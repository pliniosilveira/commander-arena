/**
 * Validation of modal spells and abilities (CR 700.2, D-114): "Choose one —", "Choose two —", "Choose one
 * or both —", "Choose one or more —", on a spell, an activated ability or a triggered ability. The checks
 * of a mode's own targets and effect are the ordinary ones (a mode is a small spell); what a mode adds is
 * how many are chosen, that their target ids never clash (the targets of the chosen modes are asked
 * together, CR 601.2c) and that the owner of a modal ability keeps its effects in the modes.
 */
import type { Effect, ModeChoice, SpellMode } from './types';
import {
  type AstIssue,
  checkCondition,
  checkCosts,
  checkEffect,
  declareTargets,
  isCount,
  issue,
  type Scope,
} from './validate-parts';

/** The most modes a spell or ability may have: the engine lists every legal choice (2^8 at most). */
export const MAX_MODES = 8;

/**
 * The most choices of modes a repeatable choice (D-344) may list: the engine lists every legal multiset (CR 700.2d),
 * so `max` and the number of modes are held to a number of sets that stays small.
 */
export const MAX_REPEATABLE_SETS = 2000;

/** How many multisets of `size` modes there are among `modes` modes (with repeats), counted without building them. */
function multisetCount(modes: number, size: number): number {
  let n = 1;
  for (let i = 1; i <= size; i += 1) n = (n * (modes + i - 1)) / i;
  return n;
}

/** A mode's text and effect, with the ordinary checks of a target declaration and an effect. */
export function checkModes(
  modes: readonly SpellMode[] | undefined,
  choose: ModeChoice | undefined,
  path: string,
  scopeOf: (targets: Scope['targets']) => Scope,
  out: AstIssue[],
  /** True for a triggered ability: with no mode chosen it is removed from the stack (CR 700.2b), which a choice of 0 modes would need (D-346). */
  triggered = false,
  /** True for a spell: only its modes may have a cost listed before the effect (CR 700.2h, D-1270). */
  spell = false,
): void {
  const list = modes ?? [];
  if (!Array.isArray(list) || list.length < 2) {
    issue(out, `${path}.modes`, 'a modal spell or ability needs at least two modes (CR 700.2)');
  } else if (list.length > MAX_MODES) {
    issue(out, `${path}.modes`, `at most ${MAX_MODES} modes are supported`);
  }
  checkChoice(choose, list.length, path, out, triggered);
  const seen = new Set<string>();
  list.forEach((mode, i) => {
    const p = `${path}.modes[${i}]`;
    if (typeof mode.text !== 'string' || mode.text === '') {
      issue(out, `${p}.text`, 'mode text is empty');
    }
    const targets = declareTargets(mode.targets, `${p}.targets`, out);
    // The slots of every chosen mode are asked in one decision, so an id belongs to one mode only.
    for (const id of targets.keys()) {
      // D-344: the slots of the later instances of a repeated mode are `<id>#2`, ...: an id of the text cannot look like one.
      if (choose?.repeatable === true && id.includes('#')) {
        issue(
          out,
          `${p}.targets`,
          `target id "${id}" has a "#", which a repeatable mode keeps for its instances`,
        );
      }
      if (seen.has(id)) {
        issue(out, `${p}.targets`, `target id "${id}" is used by another mode: ids are unique`);
      }
      seen.add(id);
    }
    checkEffect(mode.effect, `${p}.effect`, scopeOf(targets), out);
    if (mode.cost !== undefined) checkModeCost(mode, choose, p, spell, out);
  });
}

/** CR 700.2h (D-1270): a mode's cost is an additional cost to cast the spell: mana, no X, not with a repeatable choice, and only on a spell. */
function checkModeCost(
  mode: SpellMode,
  choose: ModeChoice | undefined,
  p: string,
  spell: boolean,
  out: AstIssue[],
): void {
  if (!spell) {
    issue(out, `${p}.cost`, 'only a spell has modes with a cost (CR 700.2h)');
    return;
  }
  if (choose?.repeatable === true) {
    issue(out, `${p}.cost`, 'a mode with a cost cannot be chosen more than once in this engine');
  }
  const cost = mode.cost ?? [];
  checkCosts(cost, `${p}.cost`, out);
  if (!Array.isArray(cost) || cost.length === 0) {
    issue(out, `${p}.cost`, 'a mode cost needs a cost to pay');
    return;
  }
  cost.forEach((c, i) => {
    if (c?.kind !== 'mana') {
      issue(out, `${p}.cost[${i}]`, 'a mode cost may be mana only in this engine');
    } else if (c.symbols?.includes('X')) {
      issue(out, `${p}.cost[${i}]`, 'X in a mode cost is not supported');
    }
  });
}

function checkChoice(
  choose: ModeChoice | undefined,
  count: number,
  path: string,
  out: AstIssue[],
  triggered: boolean,
): void {
  const p = `${path}.chooseModes`;
  if (choose === undefined) {
    issue(out, p, 'a modal spell or ability must say how many modes are chosen');
    return;
  }
  const repeatable = choose.repeatable === true;
  if (choose.repeatable !== undefined && choose.repeatable !== true) {
    issue(out, `${p}.repeatable`, 'repeatable is true when present');
  }
  if (
    !isCount(choose.min) ||
    !isCount(choose.max) ||
    choose.min < (repeatable ? 0 : 1) ||
    choose.max < 1 ||
    choose.min > choose.max ||
    (!repeatable && choose.max > count)
  ) {
    issue(
      out,
      p,
      repeatable
        ? 'a repeatable chooseModes needs 0 <= min <= max, with at least 1 mode to choose'
        : 'chooseModes needs 1 <= min <= max <= number of modes',
    );
  } else if (repeatable) {
    // CR 700.2d (D-344): the engine lists every multiset between min and max, so the count is bounded.
    let sets = 0;
    for (let size = choose.min; size <= choose.max && sets <= MAX_REPEATABLE_SETS; size += 1) {
      sets += multisetCount(count, size);
    }
    if (sets > MAX_REPEATABLE_SETS) {
      issue(
        out,
        p,
        `a repeatable chooseModes lists every choice of modes: at most ${MAX_REPEATABLE_SETS} (this one has more)`,
      );
    }
    if (triggered && choose.min === 0) {
      issue(
        out,
        p,
        'a triggered ability that may choose no mode is removed from the stack (CR 700.2b): not run',
      );
    }
    if (choose.maxIf !== undefined || choose.notRepeatedThisTurn !== undefined) {
      issue(out, p, 'a repeatable chooseModes has no maxIf and no notRepeatedThisTurn (CR 700.2d)');
    }
  }
  if (choose.maxIf !== undefined) {
    const { condition, max } = choose.maxIf;
    if (!isCount(max) || max <= choose.max || max > count) {
      issue(
        out,
        `${p}.maxIf.max`,
        'maxIf.max must be more than max and at most the number of modes',
      );
    }
    checkCondition(condition, `${p}.maxIf.condition`, out);
  }
}

/** A modal ability's own `effect` is the empty sequence and it has no targets of its own (D-114). */
export function checkModalAbilityShell(
  effect: Effect | undefined,
  targets: readonly unknown[] | undefined,
  path: string,
  out: AstIssue[],
): void {
  if (effect?.kind !== 'sequence' || effect.effects.length !== 0) {
    issue(
      out,
      `${path}.effect`,
      'a modal ability puts its effects in the modes: effect is the empty sequence',
    );
  }
  if (targets !== undefined && targets.length > 0) {
    issue(out, `${path}.targets`, 'a modal ability declares targets on each mode');
  }
}
