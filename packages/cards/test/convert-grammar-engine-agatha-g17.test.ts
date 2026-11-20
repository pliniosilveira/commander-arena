// Agatha deck (issue 345), group 17: Beorn's Hospitality.
// "Landfall — Whenever a land you control enters, put a +1/+1 counter on target creature you control." and "{5}{G}{G}: This enchantment becomes a Bear creature in addition to its
// other types and gains \"This creature's power and toughness are each equal to the number of lands you control.\" (This effect doesn't end.)"
// Pins: CR 205.1b (types added), CR 613.1d (layer 4), CR 613.1f (layer 6 grant), CR 613.4a (layer 7a, the characteristic-defining ability), CR 611.2a (no duration, for good).
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const BEORN = real("Beorn's Hospitality");

const game = (lands: number) => {
  const b = scenario().define(BEORN).seat(0).battlefield(BEORN.name);
  for (let i = 0; i < lands; i++) b.battlefield('Forest');
  return b.seat(1).library('Forest').build();
};

describe("Beorn's Hospitality", () => {
  test('becomes a Bear creature besides its types, with power and toughness of the lands you control', () => {
    const g = game(8);
    g.expect.derived(BEORN.name, { types: ['enchantment'], subtypes: [] });
    g.act(0).activate(BEORN.name).pay();
    g.passAll();
    g.expect.derived(BEORN.name, { types: ['enchantment', 'creature'], subtypes: ['Bear'] });
    // Eight lands, one of which paid and is still a land: 8/8.
    g.expect.pt(BEORN.name, 8, 8);
    g.expect.invariants();
  });

  test('the power and toughness follow the lands, and the effect does not end with the turn', () => {
    const g = game(8);
    g.act(0).activate(BEORN.name).pay();
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.derived(BEORN.name, { types: ['enchantment', 'creature'], subtypes: ['Bear'] });
    g.expect.pt(BEORN.name, 8, 8);
  });

  test('it is only an enchantment before the ability is activated', () => {
    const g = game(8);
    expect(g.object(BEORN.name).counters).toEqual({});
    g.expect.derived(BEORN.name, { types: ['enchantment'] });
  });
});
