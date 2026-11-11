// What the HeuristicAgent has seen of its opponent's blocking (M7c, D-163): the count of sensible blocks that
// were offered and made, and the weight it gives to a passive opponent.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { OpponentModel } from '../src/heuristic-model';

const SPIDER = 'Giant Spider'; // 2/4
const BEARS = 'Grizzly Bears'; // 2/2

/** The agent (seat 0) attacked with Bears into `theirs`; `block` says whether the first of them blocked. */
function afterBlocks(theirs: string[], block: boolean) {
  const g = scenario()
    .seat(0)
    .battlefield(BEARS)
    .library('Island', { count: 4 })
    .seat(1)
    .battlefield(...theirs)
    .library('Island', { count: 4 })
    .at('precombatMain', { active: 0 })
    .build();
  g.playCombat({
    attack: [BEARS],
    block: block ? [{ blocker: theirs[0] ?? SPIDER, attacker: BEARS }] : [],
    until: 'declareBlockers',
  });
  return g.view(0);
}

describe('OpponentModel', () => {
  test('starts undecided: a passive opponent is as likely as not', () => {
    expect(new OpponentModel().passiveWeight).toBe(0.5);
  });

  test('a sensible block that was not made counts against the opponent', () => {
    const model = new OpponentModel();
    model.observe(afterBlocks([SPIDER], false));
    expect(model.counts).toEqual([1, 0]);
    expect(model.passiveWeight).toBeGreaterThan(0.5);
  });

  test('a sensible block that was made counts for it', () => {
    const model = new OpponentModel();
    model.observe(afterBlocks([SPIDER], true));
    expect(model.counts).toEqual([1, 1]);
    expect(model.passiveWeight).toBeLessThan(0.5);
  });

  test('an attacker that no sensible block could stop teaches nothing', () => {
    const model = new OpponentModel();
    model.observe(afterBlocks(['SYNTHETIC Vanilla 1/1'], false));
    expect(model.counts).toEqual([0, 0]);
  });

  test("a turn is read once, and only the declare-blockers step of the agent's own turn", () => {
    const model = new OpponentModel();
    const view = afterBlocks([SPIDER], false);
    model.observe(view);
    model.observe(view);
    expect(model.counts).toEqual([1, 0]);
    const other = new OpponentModel();
    other.observe({ ...view, step: 'declareAttackers' });
    other.observe({ ...view, activeSeat: 1 });
    expect(other.counts).toEqual([0, 0]);
  });
});
