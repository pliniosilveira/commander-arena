// CR 509.1c (D-206): "must be blocked if able". Every agent's declaration goes through `withinBlockBudget`, which first adds the blocks the requirement
// asks for. The decision is built by hand: it is the shape the engine sends (`mustBeBlocked` on the attacker).
import type { DeclareBlockersDecision, ObjectId } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { withinBlockBudget } from '../src/legal';

const id = (n: number) => `o${n}` as ObjectId;

function decision(
  attackers: readonly { id: number; must?: true; min?: number }[],
  candidates: readonly { blocker: number; canBlock: readonly number[] }[],
): DeclareBlockersDecision {
  return {
    kind: 'declareBlockers',
    seat: 1,
    attackers: attackers.map((a) => ({
      attacker: id(a.id),
      target: { kind: 'player', seat: 1 },
      minBlockers: a.min ?? 1,
      ...(a.must === true ? { mustBeBlocked: true as const } : {}),
    })),
    candidates: candidates.map((c) => ({ blocker: id(c.blocker), canBlock: c.canBlock.map(id) })),
  } as unknown as DeclareBlockersDecision;
}

describe('withinBlockBudget adds the blocks a requirement asks for (CR 509.1c)', () => {
  test('an attacker that must be blocked gets a blocker when the agent chose none', () => {
    const d = decision([{ id: 1, must: true }], [{ blocker: 2, canBlock: [1] }]);
    expect(withinBlockBudget(d, [])).toEqual([{ blocker: id(2), attacker: id(1) }]);
  });

  test('a blocker that blocks something else already is left where it is', () => {
    const d = decision(
      [{ id: 1, must: true }, { id: 3 }],
      [
        { blocker: 2, canBlock: [1, 3] },
        { blocker: 4, canBlock: [1] },
      ],
    );
    const blocks = withinBlockBudget(d, [{ blocker: id(2), attacker: id(3) }]);
    expect(blocks).toContainEqual({ blocker: id(4), attacker: id(1) });
    expect(blocks).toContainEqual({ blocker: id(2), attacker: id(3) });
  });

  test('menace needs two blockers: both are added, or none when there are not two', () => {
    const two = decision(
      [{ id: 1, must: true, min: 2 }],
      [
        { blocker: 2, canBlock: [1] },
        { blocker: 3, canBlock: [1] },
      ],
    );
    expect(withinBlockBudget(two, [])).toHaveLength(2);
    const one = decision([{ id: 1, must: true, min: 2 }], [{ blocker: 2, canBlock: [1] }]);
    expect(withinBlockBudget(one, [])).toEqual([]);
  });

  test('an attacker with no requirement is not blocked by the helper', () => {
    const d = decision([{ id: 1 }], [{ blocker: 2, canBlock: [1] }]);
    expect(withinBlockBudget(d, [])).toEqual([]);
  });
});
