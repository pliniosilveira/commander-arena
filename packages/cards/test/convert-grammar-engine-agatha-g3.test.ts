// Agatha deck (issue 345), group 3: Radha, Heart of Keld.
// "During your turn, Radha has first strike." (CR 611.3a, 613.8, 702.7), "You may look at the top card of your library any time, and you may play lands from the top of your
// library." (CR 401.5, 305.1, 305.2, 604.1) and "{4}{R}{G}: Radha gets +X/+X until end of turn, where X is the number of lands you control." (CR 611.2a).
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const RADHA = real('Radha, Heart of Keld');

const game = (...top: string[]) =>
  scenario()
    .define(RADHA)
    .seat(0)
    .battlefield(RADHA.name)
    .library(...top)
    .seat(1)
    .library('Forest', 'Mountain')
    .build();

describe('Radha, Heart of Keld', () => {
  test('has first strike during its controller turn only', () => {
    const mine = game('Forest');
    mine.expect.derived(RADHA.name, { keywords: ['firstStrike'] });
    const theirs = scenario()
      .define(RADHA)
      .seat(0)
      .battlefield(RADHA.name)
      .seat(1)
      .library('Forest')
      .at('precombatMain', { active: 1 })
      .build();
    theirs.expect.derived(RADHA.name, { keywords: [] });
  });

  const playable = (g: ReturnType<typeof game>, seat: 0 | 1) =>
    g
      .legalActions(seat)
      .flatMap((a) =>
        a.kind === 'playLand' ? [g.object(a.object).owner === seat ? a.object : -1] : [],
      );

  test('the land on top of the library may be played, once for the turn land play', () => {
    const g = game('Forest', 'Mountain');
    const top = g.find({ name: 'Forest', zone: 'library', seat: 0 })[0];
    expect(playable(g, 0)).toEqual([top?.id]);
    g.act(0).playLand('Forest');
    g.expect.zone('Forest', 'battlefield', { seat: 0 });
    g.expect.librarySize(0, 1);
    // The turn's one land play is used: the next land on top may not be played now.
    expect(playable(g, 0)).toEqual([]);
    g.expect.invariants();
  });

  test('a card on top that is not a land cannot be played', () => {
    const g = game('Lightning Bolt', 'Forest');
    expect(playable(g, 0)).toEqual([]);
  });

  test('the controller sees the top card; the opponent does not', () => {
    const g = game('Forest', 'Mountain');
    expect(g.view(0).seats[0]?.libraryTop?.name).toBe('Forest');
    expect(g.view(1).seats[0]?.libraryTop).toBeUndefined();
  });

  test('without the permanent the top land cannot be played', () => {
    const g = scenario().seat(0).library('Forest').seat(1).library('Forest').build();
    expect(playable(g, 0)).toEqual([]);
  });

  test('the opponent cannot play lands off the top of their library', () => {
    const g = scenario()
      .define(RADHA)
      .seat(0)
      .battlefield(RADHA.name)
      .library('Forest')
      .seat(1)
      .library('Forest')
      .at('precombatMain', { active: 1 })
      .build();
    expect(playable(g, 1)).toEqual([]);
  });
});
