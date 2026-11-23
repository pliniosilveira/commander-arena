// N-seat harness (issue 362): createGame with two to four seats, and a scenario with 3 seats.
import { describe, expect, test } from 'vitest';
import { createGame, type DeckConfig, fixtureCard } from '../src/index';
import { ScenarioError, scenario } from './dsl-helpers';

function deck(): DeckConfig {
  const cards = [
    fixtureCard('Grizzly Bears'),
    ...Array.from({ length: 99 }, () => fixtureCard('Forest')),
  ];
  return { cards, commanders: [0] };
}

describe('createGame seat count', () => {
  test('refuses one deck and five decks', () => {
    for (const n of [1, 5]) {
      const decks = Array.from({ length: n }, deck);
      expect(() => createGame({ seed: 1, decks })).toThrow(/two to four seats/);
    }
  });

  test.each([3, 4])('builds a legal %i-seat game', (n) => {
    const { state } = createGame({
      seed: 3,
      decks: Array.from({ length: n }, deck),
    });
    expect(state.seats.map((s) => s.id)).toEqual(Array.from({ length: n }, (_, i) => i));
    for (const s of state.seats) {
      expect(s.commanders).toHaveLength(1);
      expect(s.hand).toHaveLength(7);
    }
    expect(state.pending?.kind).toBe('mulligan');
    // CR 103.5c: with more than two players every player's first mulligan is free.
    expect(state.settings.freeFirstMulligan || n > 2).toBe(true);
  });
});

describe('a scenario with three seats', () => {
  const three = () =>
    scenario({ seats: 3 })
      .seat(0)
      .battlefield('Grizzly Bears')
      .seat(1)
      .library('Forest', { count: 3 })
      .seat(2)
      .battlefield('Grizzly Bears')
      .library('Forest', { count: 3 })
      .at('precombatMain', { active: 0 });

  test('puts a permanent under seat 2 and attacks it from seat 0', () => {
    const g = three().build();
    g.expect.life(2, 40);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: 'Grizzly Bears[0]', target: { player: 2 } }]);
    g.advanceTo('postcombatMain');
    g.expect.life(2, 38);
    g.expect.life(1, 40);
  });

  test('an attack without a named player is ambiguous', () => {
    const g = three().build();
    g.advanceTo('declareAttackers', { attack: false });
    expect(() => g.act(0).declareAttackers([{ attacker: 'Grizzly Bears[0]' }])).toThrow(
      ScenarioError,
    );
  });

  test('a battle placed under seat 2 is protected by the next seat in order', () => {
    const g = scenario({ seats: 3 }).seat(2).battlefield('SYNTHETIC Vanilla Battle').build();
    expect(Object.values(g.state.objects).find((o) => o.protector !== null)?.protector).toBe(0);
  });

  test('a battle in a three-seat scenario can be protected by the third seat, but not by its own controller', () => {
    const g = scenario({ seats: 3 })
      .seat(0)
      .battlefield('SYNTHETIC Vanilla Battle', { protector: 2 })
      .build();
    expect(Object.values(g.state.objects).find((o) => o.protector !== null)?.protector).toBe(2);
    expect(() =>
      scenario({ seats: 3 })
        .seat(0)
        .battlefield('SYNTHETIC Vanilla Battle', { protector: 0 })
        .build(),
    ).toThrow(/protector is an opponent of its controller/);
    expect(() =>
      scenario({ seats: 3 })
        .seat(0)
        .battlefield('SYNTHETIC Vanilla Battle', { protector: 3 })
        .build(),
    ).toThrow(/protector 3 is not a seat/);
  });

  test('refuses a seat past the configured count', () => {
    expect(() => scenario({ seats: 3 }).seat(3)).toThrow(
      /Seat 3 does not exist: this scenario has 3 seats/,
    );
    expect(() => scenario({ seats: 5 })).toThrow(/2 to 4 seats/);
  });
});
