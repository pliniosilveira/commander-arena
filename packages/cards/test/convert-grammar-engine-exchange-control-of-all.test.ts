// Draconic Dissent deck (issue 167), group control: "You and that opponent each gain control of all creatures the other controls until end of turn." read from the Oracle text of
// Reins of Power and run by the engine. Pins: CR 701.12a (the groups exchange), 613.1b (layer 2), 611.2a (until end of turn), 611.2c (the groups are fixed as it begins), 506.4
// (a permanent that changes controller leaves combat), 701.26a (untap), 702.10 (haste for "those creatures").

import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const REINS = real('Reins of Power');
const WAR = real('The Akroan War');
const BEARS = 'Grizzly Bears';
const ANGEL = 'Serra Angel';
const ISAMARU = 'Isamaru, Hound of Konda';

describe('Reins of Power', () => {
  test('is read completely as an untap of both groups, the exchange and haste for the exchanged creatures', () => {
    const effect = REINS.faces[0]?.spell?.effect;
    if (effect?.kind !== 'sequence') throw new Error('not a sequence');
    expect(effect.effects.map((e) => e.kind)).toEqual([
      'untap',
      'untap',
      'exchangeControlOfAll',
      'grantKeyword',
    ]);
    expect(effect.effects[3]).toMatchObject({ objects: { kind: 'moved' } });
  });

  test('in a game of three: both groups are untapped, they change hands, a third player keeps their creatures, haste is given, and the turn ends it', () => {
    const g = scenario({ seats: 3 })
      .define(REINS)
      .seat(0)
      .hand(REINS.name)
      .battlefield('Island', 'Island', 'Island', 'Island')
      .battlefield(ANGEL, { tapped: true })
      .seat(1)
      .battlefield(BEARS, { tapped: true })
      .seat(2)
      .battlefield(ISAMARU)
      .at('precombatMain')
      .build();
    g.act(0).cast(REINS.name, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.zone(ANGEL, 'battlefield', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone(ISAMARU, 'battlefield', { seat: 2 });
    const view = g.view(0).battlefield;
    expect(view.find((o) => o.name === BEARS)?.keywords).toContain('haste');
    expect(view.find((o) => o.name === ANGEL)?.keywords).toContain('haste');
    g.expect.tapped(ANGEL, false);
    g.expect.tapped(BEARS, false);
    g.expect.invariants();
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.zone(ANGEL, 'battlefield', { seat: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
  });
});

// "I — Gain control of target creature for as long as this Saga remains on the battlefield." (CR 611.2b, 613.1b)
describe('The Akroan War chapter I', () => {
  test('is read as a gain of control that lasts as long as the Saga remains', () => {
    expect(JSON.stringify(WAR.faces[0]?.abilities)).toContain('forAsLongAsThisRemains');
  });

  test('the Saga controller takes the creature as the chapter resolves', () => {
    const g = scenario()
      .define(WAR)
      .seat(0)
      .hand(WAR.name)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain')
      .seat(1)
      .battlefield(BEARS)
      .at('precombatMain')
      .build();
    g.act(0).cast(WAR.name, { pay: true });
    g.passAll();
    // The only creature is the one target, chosen without a question.
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });
});
