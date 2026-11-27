// Planeswalker Party deck (issue 132), group 24: Guff Rewrites History, read from the golden corpus through the grammar with no override and played with the scenario DSL.
// Pins: CR 115.1 and 601.2c ("for each player, choose target ... that player controls": a target for every player who has a legal one, none for a player who has none, and
// not an enchantment or a land), CR 701.24 (the chosen permanents are shuffled into their owners' libraries), CR 701.13 and 401.4 (each controller exiles until a nonland card and
// puts the rest on the bottom), CR 608.2g and 118.9 (each of them may cast the card without paying its mana cost), CR 101.4 (three seats, turn order). No card of Plains is nonland, so the
// nonland card each controller finds is the permanent that was shuffled into their library.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';
import { parsed } from './convert-grammar-helpers';

const GUFF = real('Guff Rewrites History');
const SHRINE = parsed(
  'SYNTHETIC Calm Shrine',
  'Enchantment',
  'Creatures you control have vigilance.',
);
const BEARS = 'Grizzly Bears';
const LANDS = (n: number) => Array.from({ length: n }, () => 'Plains');

const build = () =>
  scenario({ seats: 3 })
    .define(GUFF)
    .define(SHRINE)
    .seat(0)
    .hand(GUFF.name)
    .library(...LANDS(5))
    .battlefield('Mountain', 'Mountain', 'Mountain')
    .battlefield(BEARS, { label: 'mine' })
    .seat(1)
    .library(...LANDS(5))
    .battlefield(BEARS, { label: 'theirs' })
    .battlefield(SHRINE.name)
    .seat(2)
    .library(...LANDS(5))
    .battlefield('Plains')
    .at('precombatMain', { active: 0, turn: 3 })
    .build();

describe('Guff Rewrites History', () => {
  test('a player must choose for every player who has a legal permanent', () => {
    const g = build();
    expect(() => g.act(0).cast(GUFF.name, { targets: ['mine'], pay: true })).toThrow();
  });

  test('an enchantment and a land are not legal targets', () => {
    const g = build();
    expect(() => g.act(0).cast(GUFF.name, { targets: ['mine', SHRINE.name], pay: true })).toThrow();
  });

  test('the chosen permanents are shuffled in, each controller finds it and may cast it for free', () => {
    const g = build();
    g.act(0).cast(GUFF.name, { targets: ['mine', 'theirs'], pay: true });
    g.passAll();
    // Seat 2 controlled none of them: its library is untouched and it casts nothing.
    g.expect.librarySize(2, 5);
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.expect.zone(BEARS, 'exile', { seat: 1 });
    // Each library keeps its five lands: the lands exiled before the nonland card went back to the bottom.
    g.expect.librarySize(0, 5);
    g.expect.librarySize(1, 5);
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards({ name: BEARS, seat: 0, zone: 'exile' });
    g.expect.pending('chooseCards', 1);
    g.act(1).chooseCards();
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone(BEARS, 'exile', { seat: 1 });
    g.expect.zone(SHRINE.name, 'battlefield', { seat: 1 });
  });
});
