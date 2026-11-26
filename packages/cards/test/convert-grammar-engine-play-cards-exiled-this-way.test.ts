// "Exile the top five cards of your library. You may play cards exiled this way until the end of your next turn. You may play an additional land this turn."
// (CR 701.13, 601.2, 305.1, 305.2, 611.2a): "cards exiled this way" names the cards of the exile instruction before it, as "those cards" does. Every card
// name starts with "SYNTHETIC".
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const BOLT = 'Lightning Bolt';
const FILLER = Array.from({ length: 12 }, () => 'Mountain');

const rite = parsed(
  'SYNTHETIC Parsed Wild Escape',
  'Sorcery',
  'Exile the top five cards of your library. You may play cards exiled this way until the end of your next turn. You may play an additional land this turn.',
  { manaCost: '{3}{R}{G}', colors: ['R', 'G'] },
);

const board = () =>
  scenario()
    .seat(0)
    .hand(rite.name)
    .define(rite)
    .battlefield('Mountain', 'Mountain', 'Mountain', 'Forest', 'Forest')
    .library('Forest', 'Forest', BOLT, 'Mountain', 'Mountain', ...FILLER)
    .seat(1)
    .library(...FILLER)
    .build();

describe('"You may play cards exiled this way until the end of your next turn." (CR 611.2a)', () => {
  test('five cards are exiled, and two lands of them are played this turn (additional land, CR 305.2)', () => {
    const g = board();
    g.act(0).cast(rite.name, { pay: true });
    g.passAll();
    expect(g.state.exile).toHaveLength(5);
    g.act(0).playLand({ name: 'Forest', zone: 'exile', seat: 0, nth: 0 });
    g.act(0).playLand({ name: 'Forest', zone: 'exile', seat: 0, nth: 0 });
    g.expect.zone('Forest', 'battlefield', { seat: 0, count: 4 });
    const third = g.act(0).try.playLand({ name: 'Mountain', zone: 'exile', seat: 0, nth: 0 });
    expect(third.ok).toBe(false);
    g.expect.invariants();
  });

  test('a spell of them can be cast on the next turn, and not on the turn after', () => {
    const g = board();
    g.act(0).cast(rite.name, { pay: true });
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.illegal(0, { cast: BOLT });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.legal(0, { cast: BOLT });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.illegal(0, { cast: BOLT });
  });
});
