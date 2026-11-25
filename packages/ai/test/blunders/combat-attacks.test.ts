// Blunder suite (issue 624), attacks: positions where one attack is clearly wrong or clearly right, and
// the HeuristicAgent (seat 0) is asked to declare attackers. A human would never send the team into a
// lethal crack-back, sit at home when the damage is free, or miss lethal through the blockers. The
// opponent has no cards in hand and no lands in every position, so no trick can change the outcome.
//
// Convention of the blunder suite: a case the agent gets right today is a plain `test`; a case it gets
// wrong today is `test.fails` with a one-line comment saying what it does instead. Those are the known
// blunders later phases must fix: when one starts passing, vitest reports it, and it becomes a plain test.
// A case is never weakened to make it pass. Each case is a blunder in its own position, never a general
// rule: a move a strong player could defend there does not belong here. Its comment says in one line why.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { HeuristicAgent } from '../../src/index';
import { askHeuristic, creature } from '../heuristic-helpers';
import { nameOf } from './drive';

const V1 = 'SYNTHETIC Vanilla 1/1';
const V3 = 'SYNTHETIC Vanilla 3/3';
const V5 = 'SYNTHETIC Vanilla 5/5';
const MENACE = 'SYNTHETIC Menace 2/2';
const ANGEL = 'Serra Angel'; // 4/4 flying vigilance
const RATS = 'Typhoid Rats'; // 1/1 deathtouch
const BEARS = 'Grizzly Bears'; // 2/2

type Theirs = string | [string, { tapped: true }];

/** Seat 0 (the agent) at its declare-attackers decision with `mine`, seat 1 with `theirs`. */
function attackSetup(
  mine: string[],
  theirs: Theirs[],
  opts: { life?: number; oppLife?: number; commander?: string } = {},
) {
  let b = scenario();
  if (opts.commander !== undefined)
    b = b.define(creature(opts.commander, 4, 4, [], { cost: ['4'] }));
  b = b.seat(0).life(opts.life ?? 20);
  if (opts.commander !== undefined) b = b.battlefield(opts.commander, { commander: true });
  b = b
    .battlefield(...mine)
    .library('Island', { count: 10 })
    .seat(1)
    .life(opts.oppLife ?? 20);
  for (const t of theirs) b = typeof t === 'string' ? b.battlefield(t) : b.battlefield(t[0], t[1]);
  const g = b.library('Island', { count: 10 }).at('precombatMain', { active: 0 }).build();
  g.advanceTo('declareAttackers', { attack: false });
  return g;
}

/** The names of the attackers the agent declares. */
async function attackers(g: ReturnType<typeof attackSetup>): Promise<string[]> {
  const action = await askHeuristic(g, new HeuristicAgent({ seed: 1 }));
  if (action.kind !== 'declareAttackers')
    throw new Error(`declareAttackers expected: ${action.kind}`);
  return action.attacks.map((a) => nameOf(g, a.attacker));
}

describe('never die to the crack-back', () => {
  test('at 5 life, a lone 5/5 stays home when 8 power untaps across the table', async () => {
    // Wrong here: 5 damage to a player at 20 wins nothing, and the 8 power that untaps kills the agent if the 5/5 is tapped.
    const g = attackSetup(
      [V5],
      [
        [V5, { tapped: true }],
        [V3, { tapped: true }],
      ],
      { life: 5 },
    );
    expect(await attackers(g)).toEqual([]);
  });

  test('at 6 life, three 3/3s do not all swing into an empty board when four 3/3s untap next turn', async () => {
    const tapped: Theirs[] = Array.from({ length: 4 }, () => [V3, { tapped: true }]);
    const g = attackSetup([V3, V3, V3], tapped, { life: 6 });
    // Wrong here: 9 damage does not kill an opponent at 20, and three tapped 3/3s let 12 power through against 6 life.
    expect((await attackers(g)).length).toBeLessThanOrEqual(1);
  });
});

describe('take free damage', () => {
  test('a vigilance flier attacks at low life: it still blocks on the way back', async () => {
    // Wrong to stay home here: no creature can block a flier, and vigilance keeps the Angel back as a blocker anyway.
    const g = attackSetup([ANGEL], [V1, [V3, { tapped: true }]], { life: 3 });
    expect(await attackers(g)).toEqual([ANGEL]);
  });
});

describe('see lethal through the blockers', () => {
  test('two menace 2/2s against one untapped blocker and 4 life: both attack', async () => {
    // Wrong to hold back here: one creature cannot block a menace attacker alone (CR 702.111b), so 4 damage is lethal.
    const g = attackSetup([MENACE, MENACE], [V5], { oppLife: 4 });
    expect(await attackers(g)).toHaveLength(2);
  });
});

describe('do not throw creatures away', () => {
  test('the commander does not attack into an untapped deathtouch 1/1 for 4 damage', async () => {
    // Wrong here: 4 damage to a player at 20 does not justify offering the commander to a one-mana deathtouch blocker.
    const g = attackSetup([], [RATS], { commander: 'SYNTHETIC Commander 4/4' });
    expect(await attackers(g)).toEqual([]);
  });
});

describe('press a clear advantage', () => {
  test('three 5/5s against two untapped 2/2s and 20 life: all three attack', async () => {
    // Wrong to hold back here: no block kills a 5/5, and two 2/2s cannot threaten a player at 20 on the way back.
    const g = attackSetup([V5, V5, V5], [BEARS, BEARS]);
    expect(await attackers(g)).toHaveLength(3);
  });

  test('at 2 life, four 3/3s alpha-strike for lethal through two 1/1 blockers', async () => {
    // Wrong to hold back here: two blocks stop two 3/3s, the other two deal 6 to a player at 6; there is no next turn.
    const g = attackSetup([V3, V3, V3, V3], [V1, V1, [V5, { tapped: true }]], {
      life: 2,
      oppLife: 6,
    });
    expect(await attackers(g)).toHaveLength(4);
  });
});
