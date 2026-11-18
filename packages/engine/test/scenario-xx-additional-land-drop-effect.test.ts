// "You may play an additional land this turn." as a spell effect (CR 305.2, issue 208).
// Pins: CR 305.2 (the number of lands a player can play in a turn is raised by the effect), CR 305.2a (compared with the lands already played),
// CR 305.3 (only the active player plays lands), and that the extra play does not carry into the next turn. Cards are SYNTHETIC
// (src/cards/fixtures/synthetic-play-rules.ts).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const SORCERY = 'SYNTHETIC Extra Land Sorcery';
const INSTANT = 'SYNTHETIC Extra Land Instant';

describe('the cards are valid', () => {
  test.each([SORCERY, INSTANT])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('an additional land this turn (CR 305.2)', () => {
  test('after it resolves the controller plays a second land and not a third', () => {
    const g = scenario()
      .seat(0)
      .hand(SORCERY)
      .hand('Forest', { count: 3 })
      .battlefield('Forest', { count: 2 })
      .seat(1)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).playLand('Forest[0]');
    g.expect.illegal(0, { playLand: 'Forest[0]' });
    g.act(0).cast(SORCERY, { pay: true });
    g.passAll();
    expect(g.state.turn.extraLandDrops).toBe(1);
    g.act(0).playLand('Forest[0]');
    g.expect.illegal(0, { playLand: 'Forest[0]' });
    expect(g.state.seats[0]?.landsPlayedThisTurn).toBe(2);
  });

  test('two of them add up (CR 305.2: several effects add)', () => {
    const g = scenario()
      .seat(0)
      .hand(SORCERY, SORCERY)
      .hand('Forest', { count: 4 })
      .battlefield('Forest', { count: 4 })
      .seat(1)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(`${SORCERY}[0]`, { pay: true });
    g.passAll();
    g.act(0).cast(`${SORCERY}[0]`, { pay: true });
    g.passAll();
    expect(g.state.turn.extraLandDrops).toBe(2);
  });

  test('the extra play is gone in the next turn', () => {
    const g = scenario()
      .seat(0)
      .hand(SORCERY)
      .library('Forest', { count: 10 })
      .battlefield('Forest', { count: 2 })
      .seat(1)
      .library('Forest', { count: 10 })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(SORCERY, { pay: true });
    g.passAll();
    expect(g.state.turn.extraLandDrops).toBe(1);
    g.advanceTo('precombatMain', { turn: 5 });
    expect(g.state.turn.extraLandDrops).toBe(0);
  });

  test("cast in the opponent's turn it gives the active player nothing (CR 305.3)", () => {
    const g = scenario()
      .seat(0)
      .hand(INSTANT)
      .battlefield('Forest')
      .seat(1)
      .hand('Forest', { count: 2 })
      .at('precombatMain', { active: 1, turn: 4 })
      .build();
    g.act(1).pass();
    g.act(0).cast(INSTANT, { pay: true });
    g.passAll();
    expect(g.state.turn.extraLandDrops).toBe(0);
    g.act(1).playLand('Forest[0]');
    g.expect.illegal(1, { playLand: 'Forest[0]' });
  });
});
