// Thief of Blood: "As this creature enters, remove all counters from all permanents. This creature enters with a +1/+1 counter on it for each counter removed this way." The REAL Oracle
// text of the card (the corpus's golden.jsonl) goes through the grammar as a card with no override and is played through applyAction in an engine scenario.
// Pins: CR 614.12 (it applies as it enters, to the permanents already on the battlefield, so not to itself), CR 122.1 and 122.2 (counters of every kind, on permanents of every player),
// CR 122.6 (enters with counters), CR 704.5i (a planeswalker with no loyalty counter goes to the graveyard), CR 111.2 and 707.10 (a token copy). Every test plays three seats.
import {
  type CardDefinition,
  fixtureCard,
  syntheticCard,
  validateCard,
} from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const thief = real('Thief of Blood');
const THIEF = thief.name;
const BEARS = 'Grizzly Bears';
const WALKER = 'SYNTHETIC Vanilla Planeswalker';
const REANIMATE = 'SYNTHETIC Reanimate Pay Life';
const LIBRARY = Array.from({ length: 6 }, () => 'Plains');
const LANDS = ['Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp'];

type Builder = ReturnType<typeof scenario>;

const board = (more: (b: Builder) => Builder = (b) => b) =>
  more(
    scenario({ seats: 3 })
      .define(thief)
      .define(syntheticCard(WALKER))
      .define(syntheticCard(REANIMATE))
      .seat(0)
      .hand(THIEF)
      .library(...LIBRARY)
      .battlefield(...LANDS)
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY),
  )
    .at('precombatMain', { active: 0 })
    .build();

type Game = ReturnType<typeof board>;

const counters = (g: Game, name: string, seat: number) =>
  g.find({ name, zone: 'battlefield', seat })[0]?.counters ?? {};

describe('Thief of Blood is read completely', () => {
  test('it is valid', () => {
    expect(validateCard(thief)).toEqual([]);
  });

  test('its abilities are the removal of all counters and the counters it enters with', () => {
    const abilities = thief.faces[0]?.abilities ?? [];
    const removal = abilities.flatMap((a) =>
      a.kind === 'replacement' && a.replacement.kind === 'asEntersRemoveCounters'
        ? [a.replacement]
        : [],
    );
    expect(removal).toEqual([{ kind: 'asEntersRemoveCounters', filter: {}, all: true }]);
    const enters = abilities.flatMap((a) =>
      a.kind === 'replacement' && a.replacement.kind === 'entersWithCounters'
        ? [a.replacement]
        : [],
    );
    expect(enters).toEqual([
      {
        kind: 'entersWithCounters',
        counter: '+1/+1',
        count: { kind: 'countersRemovedAsEntered' },
      },
    ]);
  });
});

describe('as it enters from the stack (CR 614.12)', () => {
  test('every counter of every kind comes off every permanent of every player, and nothing is asked', () => {
    const g = board((b) =>
      b
        .seat(0)
        .battlefield(BEARS, { counters: { '+1/+1': 2 } })
        .seat(1)
        .battlefield(BEARS, { counters: { '+1/+1': 1, charge: 3 } })
        .seat(2)
        .battlefield('Sol Ring', { counters: { charge: 1 } })
        .battlefield('Forest', { counters: { oil: 2 } }),
    );
    g.act(0).cast(THIEF, { pay: true });
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
    expect(counters(g, BEARS, 0)).toEqual({});
    expect(counters(g, BEARS, 1)).toEqual({});
    expect(counters(g, 'Sol Ring', 2)).toEqual({});
    expect(counters(g, 'Forest', 2)).toEqual({});
    // 2 + 4 + 1 + 2 = 9 counters removed: nine +1/+1 counters on a 1/1.
    expect(counters(g, THIEF, 0)['+1/+1']).toBe(9);
    g.expect.pt(THIEF, 10, 10);
    g.expect.invariants();
  });

  test('a permanent that has no counter changes nothing, and it enters with none', () => {
    const g = board((b) => b.seat(1).battlefield(BEARS));
    g.act(0).cast(THIEF, { pay: true });
    g.passAll();
    g.expect.zone(THIEF, 'battlefield', { seat: 0 });
    expect(counters(g, THIEF, 0)['+1/+1'] ?? 0).toBe(0);
    g.expect.pt(THIEF, 1, 1);
  });

  test('a planeswalker loses its loyalty counters and goes to the graveyard (CR 704.5i)', () => {
    const g = board((b) =>
      b
        .seat(1)
        .battlefield(WALKER, { counters: { loyalty: 4 } })
        .battlefield(BEARS, { counters: { '+1/+1': 1 } }),
    );
    g.act(0).cast(THIEF, { pay: true });
    g.passAll();
    g.expect.zone(WALKER, 'graveyard', { seat: 1 });
    // Both the loyalty counters and the +1/+1 counter were removed: five in all.
    expect(counters(g, THIEF, 0)['+1/+1']).toBe(5);
  });

  test('the removal goes through counterRemoved events, one for each kind', () => {
    const g = board((b) => b.seat(1).battlefield(BEARS, { counters: { '+1/+1': 1, charge: 3 } }));
    g.act(0).cast(THIEF, { pay: true });
    g.passAll();
    const removed = g.events.filter((e) => e.kind === 'counterRemoved');
    expect(removed.map((e) => (e.kind === 'counterRemoved' ? [e.counter, e.count] : null))).toEqual(
      expect.arrayContaining([
        ['+1/+1', 1],
        ['charge', 3],
      ]),
    );
  });
});

describe('entering by an effect (CR 614.12: whichever way it enters)', () => {
  test('returned from the graveyard to the battlefield it removes and counts the same', () => {
    const g = board((b) =>
      b
        .seat(0)
        .hand(REANIMATE)
        .graveyard(THIEF)
        .battlefield(BEARS, { counters: { '+1/+1': 3 } })
        .battlefield('Swamp', 'Swamp'),
    );
    g.act(0)
      .cast(REANIMATE)
      .targets([{ name: THIEF, zone: 'graveyard' }])
      .pay();
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
    expect(counters(g, BEARS, 0)).toEqual({});
    expect(counters(g, THIEF, 0)['+1/+1']).toBe(3);
  });
});

describe('as a token that is a copy of Thief of Blood (CR 111.2, 707.10, 614.12)', () => {
  /** "Create a token that's a copy of target creature you control." (SYNTHETIC: a Lightning Bolt with other text.) */
  const bolt = fixtureCard('Lightning Bolt');
  const face = bolt.faces[0];
  if (face === undefined) throw new Error('no face');
  const COPIER = 'SYNTHETIC Creature Copier';
  const copier: CardDefinition = {
    ...bolt,
    name: COPIER,
    faces: [
      {
        ...face,
        name: COPIER,
        oracleText: "Create a token that's a copy of target creature you control.",
        spell: {
          targets: [
            {
              id: 't1',
              what: {
                kind: 'object',
                filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
              },
            },
          ],
          effect: {
            kind: 'createToken',
            token: { kind: 'copyOf', object: { kind: 'target', id: 't1' } },
            count: 1,
          },
        },
      },
    ],
  };

  test('the token copy removes every counter without a question and enters with the counters', () => {
    const g = scenario({ seats: 3 })
      .define(thief)
      .define(copier)
      .seat(0)
      .hand(COPIER)
      .library(...LIBRARY)
      .battlefield('Mountain')
      .battlefield(THIEF)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { counters: { '+1/+1': 2 } })
      .seat(2)
      .library(...LIBRARY)
      .battlefield(BEARS, { counters: { '+1/+1': 1 } })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0)
      .cast(COPIER)
      .targets([{ name: THIEF, seat: 0 }])
      .pay();
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
    const tokens = g
      .find({ name: THIEF, zone: 'battlefield', seat: 0 })
      .filter((o) => o.token !== null);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.counters['+1/+1']).toBe(3);
    expect(counters(g, BEARS, 1)).toEqual({});
    expect(counters(g, BEARS, 2)).toEqual({});
    g.expect.invariants();
  });
});
