/**
 * The two ability words of the Case cards (CR 719.3, 702.169): "To solve — [condition]" and "Solved — [ability]". Read here, in the face reader, since the label changes what the line
 * means; the line after the label is read by the grammar as any other.
 */
import type { Ability } from '@commander-arena/engine';

/** What a Case line is: the trigger "To solve" stands for, or an ability gated on the solved designation. */
export interface CaseLine {
  readonly kind: 'toSolve' | 'solved';
  /** The text the grammar reads: the full triggered ability of "To solve", or the ability after "Solved — ". */
  readonly text: string;
}

const TO_SOLVE = /^To solve [—–-] ([^.]+)\.?$/u;
const SOLVED = /^Solved [—–-] (?=\S)/u;

/**
 * CR 719.3a: "To solve — [Condition]" means "At the beginning of your end step, if [condition] and this Case is not solved, this Case becomes solved." The text returned is the
 * ability without "and this Case is not solved" (the face reader adds it to the condition, as the grammar has no word for it). CR 702.169a: "Solved — [Ability text]".
 */
export function caseLine(line: string): CaseLine | null {
  const toSolve = TO_SOLVE.exec(line);
  if (toSolve?.[1] !== undefined) {
    const condition = toSolve[1].trim();
    const lowered = condition.charAt(0).toLowerCase() + condition.slice(1);
    return {
      kind: 'toSolve',
      text: `At the beginning of your end step, if ${lowered}, ~ becomes solved.`,
    };
  }
  const solved = SOLVED.exec(line);
  return solved === null ? null : { kind: 'solved', text: line.slice(solved[0].length) };
}

/**
 * The "To solve" trigger with CR 719.3a's "and this Case is not solved" in its intervening if, or null when the abilities are not exactly one triggered ability whose effect is
 * the solve (a condition the grammar read as something else, or an effect it added to). Never half built: the line is then refused as a whole.
 */
export function toSolveTrigger(abilities: readonly Ability[]): Ability | null {
  const only = abilities[0];
  if (
    abilities.length !== 1 ||
    only?.kind !== 'triggered' ||
    only.trigger.kind !== 'endStep' ||
    only.trigger.whose !== 'you' ||
    only.effect.kind !== 'solve' ||
    only.interveningIf === undefined ||
    only.optional === true ||
    only.targets !== undefined ||
    only.triggerCondition !== undefined
  ) {
    return null;
  }
  return {
    ...only,
    interveningIf: {
      kind: 'and',
      terms: [only.interveningIf, { kind: 'not', term: { kind: 'thisSolved' } }],
    },
  };
}

/** CR 702.169a-d: a "Solved" ability is the ability as long as the Case is solved: the engine's `solved` ability holds it. */
export function solvedAbility(abilities: readonly Ability[]): Ability {
  return { kind: 'solved', abilities: [...abilities] };
}
