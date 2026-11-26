// Blunder suite (issue 653), look-ahead: positions decided by what happens one turn past the start of
// the agent's next turn, where the turn planner stops today (issue 624, phase 3). The HeuristicAgent
// (seat 0) must see the second hit of its commander, a commander the opponent casts next turn, a
// counterspell's better use later in the same turn, and a crack-back from a haste creature that is still
// in the opponent's deck (the decklists are known, SPEC A31).
//
// Convention of the blunder suite: a case the agent gets right today is a plain `test`; a case it gets
// wrong today is `test.fails` with a one-line comment saying what it does instead. Those are the known
// blunders later phases must fix: when one starts passing, vitest reports it, and it becomes a plain test.
// A case is never weakened to make it pass. Each case is a blunder in its own position, never a general
// rule: a move a strong player could defend there does not belong here. Its comment says in one line why.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { askHeuristic, creature, lastReason } from '../heuristic-helpers';
import { blunderAgent, nameOf, playUntilPass } from './drive';

const V2 = 'SYNTHETIC Vanilla 2/2';
const V3 = 'SYNTHETIC Vanilla 3/3';
const BEARS = 'Grizzly Bears'; // 1G, 2/2
const LIBRARY = { count: 10 } as const;

/** A 6/6 flying commander that costs {4}; cast once before, so 6 mana with the tax (CR 903.8). */
const DRAGON = creature('SYNTHETIC Dragon Commander 6/6', 6, 6, ['flying'], { cost: ['4'] });

describe('a commander-damage clock of two hits', () => {
  test('the 5/5 flying commander that has dealt 11 commander damage attacks', async () => {
    // Wrong to stay home here: nothing can block a flier, 16 now makes the next hit 21 (CR 903.10a), and four 3/3s deal at most 12 to a player at 13.
    const boss = creature('SYNTHETIC Flying Commander 5/5', 5, 5, ['flying'], { cost: ['5'] });
    const g = scenario()
      .define(boss)
      .seat(0)
      .life(13)
      .battlefield(boss.name, { commander: true })
      .library('Island', LIBRARY)
      .seat(1)
      .life(40)
      .commanderDamageTaken(boss.name, 11)
      .battlefield(V3, V3, V3, V3)
      .library('Island', LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    const action = await askHeuristic(g, blunderAgent());
    if (action.kind !== 'declareAttackers')
      throw new Error(`declareAttackers expected: ${action.kind}`);
    expect(action.attacks.map((a) => nameOf(g, a.attacker))).toEqual([boss.name]);
  });
});

describe('removal waits for the commander', () => {
  test('Murder is not cast on a vanilla 3/3 when six Forests cast the 6/6 flying commander next turn', async () => {
    // Wrong to kill the 3/3 here: it is no threat to a player at 20, and Murder is the only answer to the commander that comes next turn.
    const g = scenario()
      .define(DRAGON)
      .seat(0)
      .hand('Murder')
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .landsPlayed(1)
      .library('Island', LIBRARY)
      .seat(1)
      .commander(DRAGON.name, { casts: 1 })
      .battlefield(V3)
      .battlefield('Forest', { count: 6 })
      .library('Island', LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    const { cast } = await playUntilPass(g, 0);
    expect(cast).not.toContain('Murder');
  });
});

describe('the counterspell waits for the commander', () => {
  // Today: it counters the Bears (reason `counter`): any spell of mana value 2 or more is countered, and a response is never planned.
  test.fails('Counterspell is not spent on Grizzly Bears while six untapped Forests can cast the 6/6 flying commander', async () => {
    // Wrong to counter here: a 2/2 is no threat, the two Islands pay for one counter only, and the commander can follow this turn.
    const g = scenario()
      .define(DRAGON)
      .seat(0)
      .hand('Counterspell')
      .battlefield('Island', 'Island')
      .library('Island', LIBRARY)
      .seat(1)
      .commander(DRAGON.name, { casts: 1 })
      .hand(BEARS)
      .battlefield('Forest', { count: 8 })
      .library('Island', LIBRARY)
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(BEARS).pay();
    g.act(1).pass();
    const action = await askHeuristic(g, blunderAgent());
    expect(action).not.toMatchObject({ kind: 'castSpell', object: g.id('Counterspell') });
  });
});

describe('no race into a crack-back from the hand', () => {
  // Passes since the opponent profile (issue 653, step 2b): the crack-back counts a haste creature the deck still holds.
  test('at 7 life, three 2/2s do not all attack when five Forests can cast a 7/7 haste creature from the deck', async () => {
    // Wrong to send all three here: 6 damage to a player at 20 wins nothing, and a 7/7 with haste (four in the opponent's hand and library) kills a player at 7 with no blocker home.
    const haste = creature('SYNTHETIC Haste 7/7', 7, 7, ['haste'], { cost: ['5'] });
    const g = scenario()
      .define(haste)
      .seat(0)
      .life(7)
      .battlefield(V2, V2, V2)
      .library('Island', LIBRARY)
      .seat(1)
      .hand(haste.name, 'Forest', 'Forest')
      .battlefield('Forest', { count: 5 })
      .library(haste.name, { count: 3 })
      .library('Forest', LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    const agent = blunderAgent();
    const action = await askHeuristic(g, agent);
    if (action.kind !== 'declareAttackers')
      throw new Error(`declareAttackers expected: ${action.kind}`);
    expect(action.attacks.length).toBeLessThan(3);
    expect(lastReason(agent)?.reason).toBe('crack-back');
  });
});
