/** Declare blockers (CR 509.1): select a blocker, then the attacker it blocks. Pure reducers. */
import type { DeclareBlockersDecision, ObjectId } from '@commander-arena/engine';

export interface BlockPick {
  readonly blocker: ObjectId;
  readonly attacker: ObjectId;
}

export interface BlockState {
  readonly blocks: readonly BlockPick[];
  /** The blocker picked up and waiting for an attacker to be clicked. */
  readonly blocker: ObjectId | null;
}

export const NO_BLOCKS: BlockState = { blocks: [], blocker: null };

type Candidates = DeclareBlockersDecision['candidates'];
type Attackers = DeclareBlockersDecision['attackers'];

/**
 * True when `attacker` already has as many blockers as it allows (D-133, CR 509.1b: "can't be blocked by
 * more than one creature"), not counting `picked`, the blocker about to be assigned (a blocker that is
 * moved leaves its old attacker). False for an attacker without a limit, or one `attackers` does not list.
 */
export function atBlockLimit(
  blocks: readonly BlockPick[],
  attackers: Attackers,
  attacker: ObjectId,
  picked: ObjectId | null,
): boolean {
  const max = attackers.find((a) => a.attacker === attacker)?.maxBlockers;
  if (max === undefined) return false;
  return blocks.filter((b) => b.attacker === attacker && b.blocker !== picked).length >= max;
}

/**
 * Click on a creature that may block. An assigned blocker is released (and picked up again, so a
 * second click on the attacker re-assigns it elsewhere); an unassigned one is picked up or dropped.
 */
export function clickBlocker(state: BlockState, candidates: Candidates, id: ObjectId): BlockState {
  if (!candidates.some((c) => c.blocker === id)) return state;
  if (state.blocks.some((b) => b.blocker === id)) {
    return { blocks: state.blocks.filter((b) => b.blocker !== id), blocker: null };
  }
  return { ...state, blocker: state.blocker === id ? null : id };
}

/** Click on an attacker while a blocker is picked up: block it, if that is a legal block. */
export function clickAttacker(
  state: BlockState,
  candidates: Candidates,
  id: ObjectId,
  attackers: Attackers = [],
): BlockState {
  if (state.blocker === null) return state;
  const candidate = candidates.find((c) => c.blocker === state.blocker);
  if (candidate === undefined || !candidate.canBlock.includes(id)) return state;
  // An attacker that takes only so many blockers refuses one more (the engine would refuse the answer).
  if (atBlockLimit(state.blocks, attackers, id, state.blocker)) return state;
  return {
    blocks: [
      ...state.blocks.filter((b) => b.blocker !== state.blocker),
      { blocker: state.blocker, attacker: id },
    ],
    blocker: null,
  };
}

/** The attackers the picked-up blocker may block (what is clickable on their side). */
export function blockableAttackers(
  state: BlockState,
  candidates: Candidates,
  attackers: Attackers = [],
): readonly ObjectId[] {
  const picked = state.blocker;
  if (picked === null) return [];
  return (candidates.find((c) => c.blocker === picked)?.canBlock ?? []).filter(
    (a) => !atBlockLimit(state.blocks, attackers, a, picked),
  );
}

export function blockersOn(blocks: readonly BlockPick[], attacker: ObjectId): number {
  return blocks.filter((b) => b.attacker === attacker).length;
}

export interface BlockProblem {
  readonly attacker: ObjectId;
  readonly have: number;
  readonly need: number;
}

/**
 * CR 509.1b, 702.111b: an attacker that needs two blockers (menace) is blocked by none or by at
 * least its minimum. One blocker where two are needed is the only invalid assignment.
 */
export function blockProblems(
  attackers: DeclareBlockersDecision['attackers'],
  blocks: readonly BlockPick[],
): readonly BlockProblem[] {
  return attackers.flatMap((a) => {
    const have = blockersOn(blocks, a.attacker);
    return have > 0 && have < a.minBlockers
      ? [{ attacker: a.attacker, have, need: a.minBlockers }]
      : [];
  });
}

export function blockButtonLabel(count: number): string {
  return count === 0 ? 'No Blocks' : `Block (${count})`;
}
