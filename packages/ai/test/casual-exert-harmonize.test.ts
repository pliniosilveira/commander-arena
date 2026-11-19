// CasualAgent and the keywords Exert (CR 701.43) and Harmonize (CR 702.180), on real engine states built with the scenario DSL (SYNTHETIC cards of the engine's fixtures).
// Exert: the agent exerts a creature whose "When you do, ..." ability hurts a creature only when an opponent has one, and otherwise keeps it ready to attack again.
// Harmonize: a card of the graveyard is cast for its harmonize cost once nothing worth casting is left in the hand, and a creature is tapped for the reduction so a cast the
// engine offered (which may be payable only with it) can be paid. Every action the agent sends is one the engine lists.
import { applyAction } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { answer, expectLegal } from './casual-helpers';

const WYRM = 'SYNTHETIC Exert Wyrm';
const GUARD = 'SYNTHETIC Exert Guard';
const DRAIN = 'SYNTHETIC Harmonize Drain';
const FILLER = Array.from({ length: 6 }, () => 'Island');

function attacking(own: string, opposing: readonly string[]): ScenarioGame {
  const b = scenario()
    .seat(0)
    .library(...FILLER)
    .battlefield(own)
    .seat(1)
    .library(...FILLER);
  for (const card of opposing) b.battlefield(card);
  const g = b.at('precombatMain', { active: 0 }).build();
  g.advanceTo('declareAttackers', { attack: false });
  g.act(0).attack(own);
  return g;
}

describe('Exert', () => {
  test('a creature that deals damage when exerted is exerted when an opponent has a creature to hit', async () => {
    const g = attacking(WYRM, ['Giant Spider']);
    const action = await answer(g);
    expect(action).toEqual({ kind: 'acceptOptional' });
    expectLegal(g, action);
  });

  test('with no creature to hit it is not exerted: it would only stay tapped', async () => {
    const g = attacking(WYRM, []);
    const action = await answer(g);
    expect(action).toEqual({ kind: 'declineOptional' });
    expectLegal(g, action);
  });

  test('a creature whose "When you do" ability needs no creature is exerted whatever the board', async () => {
    const g = attacking(GUARD, []);
    expect(await answer(g)).toEqual({ kind: 'acceptOptional' });
  });
});

describe('Harmonize', () => {
  test('a card of the graveyard is cast with the alternative, and the creature to tap is chosen so the cast can be paid', async () => {
    // {3}{B} with one Swamp is payable only by tapping a 4-power creature: the agent taps it.
    const g = scenario()
      .seat(0)
      .graveyard(DRAIN)
      .battlefield('Swamp')
      .battlefield('Serra Angel')
      .seat(1)
      .build();
    const cast = await answer(g);
    expect(cast).toEqual({ kind: 'castSpell', object: g.id(DRAIN), alternative: 'harmonize' });
    expectLegal(g, cast);
    expect(applyAction(g.state, 0, cast).ok).toBe(true);
    g.act(0).choose(cast);
    const tap = await answer(g);
    expect(tap).toEqual({ kind: 'choosePermanents', objects: [g.id('Serra Angel')] });
    g.act(0).choose(tap);
    g.act(0).payAuto();
    g.passAll();
    g.expect.life(1, 37);
    g.expect.zone(DRAIN, 'exile');
  });
});
