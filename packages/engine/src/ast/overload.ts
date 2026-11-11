/**
 * Overload (CR 702.96, D-121): the text change of a spell cast for its overload cost.
 *
 * CR 702.96a: "If you chose to pay this spell's overload cost, change its text by replacing all
 * instances of the word 'target' with the word 'each.'" The result is the same spell with another
 * text (CR 702.96c, 612: a text-changing effect), not a second spell, and it needs no targets
 * (CR 702.96b); it may affect objects that could not have been chosen as targets.
 *
 * In the AST that means: every object `target` reference an effect makes becomes an `each` selector
 * with the filter of the target slot it named, the slots go, and nothing else changes. The engine makes
 * the change itself from the face's spell text, so a card needs only its overload cost (`AlternativeCost`
 * `overload`). Text the change cannot be made on is refused by `validateCard` (`overloadIssue`):
 * - a modal spell (a "target" inside a mode's text is changed too, but a mode that was chosen for its
 *   targets is a different question: `docs/ROADMAP.md`);
 * - a player or "any target" slot (what "each player" would mean is not read off the text);
 * - a slot in a zone other than the battlefield, or on the stack;
 * - a `target` that is not a plain selector of an effect (an amount that reads a target's power, the
 *   owner of cards "in target player's graveyard", ...): the replaced word would not read as "each".
 * - a spell with no target, which has nothing for the cost to change.
 */
import type { SpellText, TargetSpec } from './types';

/** The marker of a replacement that cannot be made. */
const REFUSED = Symbol('overload refused');

/** The keys under which an effect holds an object selector (`target` there may become `each`). */
const SELECTOR_KEYS: ReadonlySet<string> = new Set(['objects', 'to']);

function isTargetRef(node: unknown): node is { kind: 'target'; id: string } {
  const n = node as { kind?: unknown; id?: unknown } | null;
  return typeof n === 'object' && n !== null && n.kind === 'target' && typeof n.id === 'string';
}

/** The `each` selector that stands for the target slot `spec` (CR 702.96a), or REFUSED. */
function eachFor(spec: TargetSpec | undefined): unknown {
  if (spec === undefined || spec.what.kind !== 'object') return REFUSED;
  const { filter } = spec.what;
  if (filter.stackKind !== undefined) return REFUSED;
  if (filter.zone !== undefined && filter.zone !== 'battlefield') return REFUSED;
  return { kind: 'each', filter: { ...filter, zone: 'battlefield' } };
}

function rewrite(
  node: unknown,
  key: string | null,
  specs: ReadonlyMap<string, TargetSpec>,
): unknown {
  if (Array.isArray(node)) {
    const out: unknown[] = [];
    for (const item of node) {
      const changed = rewrite(item, key, specs);
      if (changed === REFUSED) return REFUSED;
      out.push(changed);
    }
    return out;
  }
  if (typeof node !== 'object' || node === null) return node;
  if (isTargetRef(node)) {
    // Only an effect's own selector reads as "each"; any other place a target is named does not.
    return key !== null && SELECTOR_KEYS.has(key) ? eachFor(specs.get(node.id)) : REFUSED;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    const changed = rewrite(v, k, specs);
    if (changed === REFUSED) return REFUSED;
    out[k] = changed;
  }
  return out;
}

/**
 * The spell text with "target" replaced by "each" (CR 702.96a): no targets, and the effect's target
 * references turned into `each` selectors. Null when the change cannot be made (see the module text).
 */
export function overloadedText(text: SpellText | null | undefined): SpellText | null {
  if (text === null || text === undefined || text.modes !== undefined) return null;
  const targets = text.targets ?? [];
  if (targets.length === 0 || text.effect === undefined) return null;
  const specs = new Map(targets.map((t) => [t.id, t] as const));
  const effect = rewrite(text.effect, null, specs);
  if (effect === REFUSED) return null;
  const { targets: _targets, effect: _effect, ...rest } = text;
  return { ...rest, effect: effect as NonNullable<SpellText['effect']> };
}

/**
 * Why a face's spell text cannot be overloaded, or null when it can: what `validateCard` reports for an
 * `overload` alternative cost the engine could not run.
 */
export function overloadIssue(text: SpellText | null | undefined): string | null {
  return overloadedText(text) === null
    ? 'overload needs spell text that names its targets in the instructions of one effect (no modes, no player or any-target slot, no target read for an amount); the engine cannot change this text (CR 702.96a)'
    : null;
}
