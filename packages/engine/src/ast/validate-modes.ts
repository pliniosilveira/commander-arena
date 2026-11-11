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
  checkEffect,
  declareTargets,
  isCount,
  issue,
  type Scope,
} from './validate-parts';

/** The most modes a spell or ability may have: the engine lists every legal choice (2^8 at most). */
export const MAX_MODES = 8;

/** A mode's text and effect, with the ordinary checks of a target declaration and an effect. */
export function checkModes(
  modes: readonly SpellMode[] | undefined,
  choose: ModeChoice | undefined,
  path: string,
  scopeOf: (targets: Scope['targets']) => Scope,
  out: AstIssue[],
): void {
  const list = modes ?? [];
  if (!Array.isArray(list) || list.length < 2) {
    issue(out, `${path}.modes`, 'a modal spell or ability needs at least two modes (CR 700.2)');
  } else if (list.length > MAX_MODES) {
    issue(out, `${path}.modes`, `at most ${MAX_MODES} modes are supported`);
  }
  checkChoice(choose, list.length, path, out);
  const seen = new Set<string>();
  list.forEach((mode, i) => {
    const p = `${path}.modes[${i}]`;
    if (typeof mode.text !== 'string' || mode.text === '') {
      issue(out, `${p}.text`, 'mode text is empty');
    }
    const targets = declareTargets(mode.targets, `${p}.targets`, out);
    // The slots of every chosen mode are asked in one decision, so an id belongs to one mode only.
    for (const id of targets.keys()) {
      if (seen.has(id)) {
        issue(out, `${p}.targets`, `target id "${id}" is used by another mode: ids are unique`);
      }
      seen.add(id);
    }
    checkEffect(mode.effect, `${p}.effect`, scopeOf(targets), out);
  });
}

function checkChoice(
  choose: ModeChoice | undefined,
  count: number,
  path: string,
  out: AstIssue[],
): void {
  const p = `${path}.chooseModes`;
  if (choose === undefined) {
    issue(out, p, 'a modal spell or ability must say how many modes are chosen');
    return;
  }
  if (
    !isCount(choose.min) ||
    !isCount(choose.max) ||
    choose.min < 1 ||
    choose.min > choose.max ||
    choose.max > count
  ) {
    issue(out, p, 'chooseModes needs 1 <= min <= max <= number of modes');
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
