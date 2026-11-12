// A melded permanent among the other rules (D-991, D-995): copying it (CR 707.8, 712.8g, 202.3c), transforming or turning it face down (CR 712.4c, 712.9, 712.16),
// control (CR 712.8, 108.3, 110.2), devotion (CR 700.5, 700.5a), attachments and counters when it leaves (CR 400.7, 303.4, 301.5). Cards are SYNTHETIC
// (src/cards/fixtures/synthetic-meld.ts).
import { describe, expect, test } from 'vitest';
import { checkInvariants } from '../src/index';
import { devotionOf } from '../src/rules/amounts';
import { scenario } from '../src/testing/index';
import { viewOf } from './layout-helpers';
import { settle } from './meld-helpers';

const DUSK = 'SYNTHETIC Dusk Squire'; // {2}{W}
const DAWN = 'SYNTHETIC Dawn Squire'; // {1}{B}
const TITAN = 'SYNTHETIC Twilight Titan';
const SHIFT = 'SYNTHETIC Doppel Shift'; // target creature becomes a copy of another target creature until end of turn
const TURN = 'SYNTHETIC Turn Over'; // transform target creature
const SNATCH = 'SYNTHETIC Snatch Creature'; // gain control of target creature until end of turn
const BLADE = 'SYNTHETIC Blade'; // Equipment, +2/+0

const melded = () =>
  scenario()
    .seat(0)
    .battlefield(DUSK, { label: 'dusk', meldedWith: 'dawn' })
    .battlefield(DAWN, { label: 'dawn' })
    .battlefield('Grizzly Bears', { label: 'bears' })
    .battlefield('Island', 'Island', 'Island')
    .library('Island', { count: 6 })
    .seat(1)
    .library('Island', { count: 6 });

describe('a copy of a melded permanent (CR 707.8, 712.8g, 202.3c)', () => {
  test('has the values of the combined face, and its mana value is 0, not 5', () => {
    const g = scenario()
      .seat(0)
      .battlefield(DUSK, { label: 'dusk', meldedWith: 'dawn' })
      .battlefield(DAWN, { label: 'dawn' })
      .battlefield('Grizzly Bears', { label: 'bears' })
      .battlefield('Island', 'Island')
      .hand(SHIFT)
      .library('Island', { count: 6 })
      .seat(1)
      .library('Island', { count: 6 })
      .build();
    expect(viewOf(g, 'dusk').meld?.manaValue).toBe(5);
    g.act(0).cast(SHIFT, { targets: ['bears', 'dusk'], pay: true });
    settle(g);
    const copy = viewOf(g, 'bears');
    expect(copy.name).toBe(TITAN);
    expect(copy.keywords).toEqual(['flying']);
    g.expect.pt('bears', 8, 8);
    // A copy of a melded permanent has mana value 0 (CR 202.3c, 712.8g): its mana cost is the combined face's, which has none.
    expect(copy.manaCost).toBeNull();
    expect(copy.meld).toBeUndefined();
    expect(g.object('bears').meldedWith).toBeUndefined();
    expect(checkInvariants(g.state)).toEqual([]);
  });
});

describe('a token that is a copy of a melded permanent (CR 707.8, 707.8a, 202.3c, 701.42b)', () => {
  test('is one ordinary permanent with the combined face, mana value 0, and not double-faced: a meld card is not (CR 712.4c)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(DUSK, { label: 'dusk', meldedWith: 'dawn' })
      .battlefield(DAWN, { label: 'dawn' })
      .battlefield('Island', 'Island', 'Island')
      .hand('SYNTHETIC Echo Image')
      .library('Island', { count: 6 })
      .seat(1)
      .library('Island', { count: 6 })
      .build();
    g.act(0).cast('SYNTHETIC Echo Image', { targets: ['dusk'], pay: true });
    settle(g);
    const tokens = g.view(0).battlefield.filter((o) => o.name === TITAN && o.id !== g.id('dusk'));
    expect(tokens).toHaveLength(1);
    const copy = tokens[0];
    expect(copy?.manaCost).toBeNull();
    expect(copy?.meld).toBeUndefined();
    expect(copy?.faces).toBeUndefined();
    expect(copy?.power).toBe(8);
    expect(checkInvariants(g.state)).toEqual([]);
  });
});

describe('it can not be transformed (CR 712.4c, 712.9)', () => {
  test('an instruction to transform it is ignored: the same face is up and nothing happened', () => {
    const g = scenario()
      .seat(0)
      .battlefield(DUSK, { label: 'dusk', meldedWith: 'dawn' })
      .battlefield(DAWN, { label: 'dawn' })
      .battlefield('Island', 'Island')
      .hand(TURN)
      .library('Island', { count: 6 })
      .seat(1)
      .library('Island', { count: 6 })
      .build();
    const before = g.object('dusk');
    g.act(0).cast(TURN, { targets: ['dusk'], pay: true });
    settle(g);
    expect(g.object('dusk')).toEqual(before);
    expect(viewOf(g, 'dusk').name).toBe(TITAN);
  });
});

describe('control of the melded permanent (CR 712.8, 108.3, 110.2)', () => {
  test('stolen: the opponent controls the one permanent, the owner is still the player who owns both cards, and both cards go to the owner when it dies', () => {
    const g = scenario()
      .seat(0)
      .battlefield(DUSK, { label: 'dusk', meldedWith: 'dawn' })
      .battlefield(DAWN, { label: 'dawn' })
      .library('Island', { count: 6 })
      .seat(1)
      .battlefield('Mountain', 'Mountain')
      .hand(SNATCH, 'Murder')
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .library('Island', { count: 6 })
      .at('precombatMain', { active: 1, turn: 4, priority: 1 })
      .build();
    g.act(1).cast(SNATCH, { targets: ['dusk'], pay: true });
    settle(g);
    expect(g.object('dusk').controller).toBe(0); // the object keeps the player it entered under; the effect says who controls it now
    expect(viewOf(g, 'dusk', 1).controller).toBe(1);
    g.act(1).cast('Murder', { targets: ['dusk'], pay: true });
    settle(g);
    g.expect.zone(DUSK, 'graveyard', { seat: 0 });
    g.expect.zone(DAWN, 'graveyard', { seat: 0 });
    g.expect.noObject(DUSK, { seat: 1 });
  });
});

describe('devotion (CR 700.5, 700.5a)', () => {
  test('a melded permanent has no mana cost, so it adds nothing to devotion; the two cards apart add their own symbols', () => {
    const apart = scenario()
      .seat(0)
      .battlefield(DUSK)
      .battlefield(DAWN)
      .library('Island', { count: 6 })
      .seat(1)
      .library('Island', { count: 6 })
      .build();
    expect(devotionOf(apart.state, 0, ['W'])).toBe(1);
    expect(devotionOf(apart.state, 0, ['B'])).toBe(1);
    const together = melded().build();
    expect(devotionOf(together.state, 0, ['W'])).toBe(0);
    expect(devotionOf(together.state, 0, ['B'])).toBe(0);
  });
});

describe('attachments, counters and damage when it leaves (CR 400.7, 704.5m, 301.5)', () => {
  test('an Equipment is left unattached on the battlefield when the permanent it equipped dies', () => {
    const g = scenario()
      .seat(0)
      .battlefield(DUSK, { label: 'dusk', meldedWith: 'dawn', damage: 8 })
      .battlefield(DAWN, { label: 'dawn' })
      .battlefield(BLADE, { label: 'blade', attachedTo: 'dusk' })
      .library('Island', { count: 6 })
      .seat(1)
      .library('Island', { count: 6 })
      .build({ settle: true });
    g.expect.zone(DUSK, 'graveyard', { seat: 0 });
    g.expect.zone(DAWN, 'graveyard', { seat: 0 });
    expect(g.object('blade').attachedTo).toBeNull();
    g.expect.zone(BLADE, 'battlefield');
  });
});
