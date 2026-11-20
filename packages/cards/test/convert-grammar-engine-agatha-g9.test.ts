// Agatha deck (issue 345), group 9: Silvanus's Invoker, "{8}: Untap target land you control. It becomes an 8/8 Elemental creature with trample and haste until end of turn.
// It's still a land."
// Pins: CR 613.1d (layer 4 types), CR 613.4b (layer 7b base power and toughness), CR 613.1f (layer 6 keywords), CR 205.1b (still a land), CR 611.2a (until end of turn),
// CR 502.3-style untap by an effect (CR 701.26).
import { scenario } from '@commander-arena/engine/testing';
import { describe, test } from 'vitest';
import { real } from './agatha-helpers';

const INVOKER = real("Silvanus's Invoker");

const game = () =>
  scenario()
    .define(INVOKER)
    .seat(0)
    .battlefield(INVOKER.name)
    .battlefield('Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest')
    .battlefield('Mountain', { tapped: true })
    .seat(1)
    .library('Forest')
    .build();

describe("Silvanus's Invoker", () => {
  test('untaps the land and makes it an 8/8 Elemental land creature with trample and haste', () => {
    const g = game();
    g.act(0).activate(INVOKER.name).targets(['Mountain']).pay();
    g.passAll();
    g.expect.tapped('Mountain', false);
    g.expect.pt('Mountain', 8, 8);
    g.expect.derived('Mountain', {
      types: ['land', 'creature'],
      subtypes: ['Mountain', 'Elemental'],
      keywords: ['trample', 'haste'],
    });
    g.expect.invariants();
  });

  test('it is a plain land again after the turn ends', () => {
    const g = game();
    g.act(0).activate(INVOKER.name).targets(['Mountain']).pay();
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.derived('Mountain', { types: ['land'], subtypes: ['Mountain'], keywords: [] });
  });
});
