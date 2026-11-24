// Counter Blitz deck, group G (Sin, Unending Cataclysm): "As Sin enters, remove all counters from any number of artifacts, creatures, and enchantments. Sin enters with X +1/+1 counters
// on it, where X is twice the number of counters removed this way." and "When Sin dies, put its counters on target creature you control, then shuffle this card into its owner's
// library." The REAL Oracle text of the card (the corpus's golden.jsonl) goes through the grammar as a card with no override and is played through applyAction in an engine scenario.
// Pins: CR 614.12 and 614.12a (a choice made as it enters, before it is on the battlefield), CR 122.1 and 122.2 (counters of every kind), CR 122.6 (enters with counters), CR 113.7a and
// 603.10a (a "dies" ability reads the permanent as it last was), CR 701.24c (the library is shuffled), CR 400.7 (a new object), CR 111.2 and 707.10 (a token copy). Every test plays three seats.
import {
  type CardDefinition,
  fixtureCard,
  syntheticCard,
  validateCard,
} from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const sin = real('Sin, Unending Cataclysm');
const SIN = sin.name;
const BEARS = 'Grizzly Bears';
const WALKER = 'SYNTHETIC Vanilla Planeswalker';
const REANIMATE = 'SYNTHETIC Reanimate Pay Life';
const LIBRARY = Array.from({ length: 6 }, () => 'Plains');

// {5}{G}{U}: seven lands for the cast, and a Murder ({1}{B}{B}) for the death.
const LANDS = ['Forest', 'Island', 'Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain'];

type Builder = ReturnType<typeof scenario>;
type Game = ReturnType<Builder['build']>;

const build = (setup: (b: Builder) => Builder): Game =>
  setup(
    scenario({ seats: 3 })
      .define(sin)
      .define(syntheticCard(WALKER))
      .define(syntheticCard(REANIMATE)),
  )
    .at('precombatMain', { active: 0 })
    .build();

/** Seat 0 holds Sin and seven lands; seats 1 and 2 have libraries. */
const board = (more: (b: Builder) => Builder = (b) => b) =>
  build((b) =>
    more(
      b
        .seat(0)
        .hand(SIN)
        .library(...LIBRARY)
        .battlefield(...LANDS)
        .seat(1)
        .library(...LIBRARY)
        .seat(2)
        .library(...LIBRARY),
    ),
  );

const counters = (g: Game, name: string, seat: number) =>
  g.find({ name, zone: 'battlefield', seat })[0]?.counters ?? {};

describe('Sin, Unending Cataclysm is read completely', () => {
  test('it is valid', () => {
    expect(validateCard(sin)).toEqual([]);
  });

  test('its abilities are the two replacements and the dies trigger', () => {
    const kinds = (sin.faces[0]?.abilities ?? []).map((a) =>
      a.kind === 'replacement' ? `replacement:${a.replacement.kind}` : a.kind,
    );
    expect(kinds).toContain('replacement:asEntersRemoveCounters');
    expect(kinds).toContain('replacement:entersWithCounters');
    expect(kinds).toContain('triggered');
  });
});

describe('as it enters from the stack (CR 614.12)', () => {
  test('the controller chooses among the permanents of every player that have counters, before it enters', () => {
    const g = board((b) =>
      b
        .seat(0)
        .battlefield(BEARS, { counters: { '+1/+1': 2 } })
        .seat(1)
        .battlefield(BEARS, { counters: { '+1/+1': 1, charge: 3 } })
        .seat(2)
        .battlefield('Sol Ring', { counters: { charge: 1 } })
        .battlefield('Forest'),
    );
    g.act(0).cast(SIN, { pay: true });
    g.passAll();
    g.expect.pending('choosePermanent', 0);
    g.expect.noObject(SIN, { zone: 'battlefield' });
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error('expected a permanent choice');
    expect(d.purpose).toBe('entersRemoveCounters');
    expect(d.min).toBe(0);
    expect(d.max).toBe(3);
    // The Bears and the Sol Ring with counters, not the Forest (none), not the lands of seat 0.
    expect(d.legal).toHaveLength(3);
  });

  test('every counter of every kind comes off each permanent chosen, of any player; Sin enters with twice as many +1/+1 counters', () => {
    const g = board((b) =>
      b
        .seat(0)
        .battlefield(BEARS, { counters: { '+1/+1': 2 } })
        .seat(1)
        .battlefield(BEARS, { counters: { '+1/+1': 1, charge: 3 } })
        .seat(2)
        .battlefield('Sol Ring', { counters: { charge: 1 } }),
    );
    g.act(0).cast(SIN, { pay: true });
    g.passAll();
    g.act(0).choosePermanents(
      { name: BEARS, seat: 1 },
      { name: 'Sol Ring', seat: 2 },
      { name: BEARS, seat: 0 },
    );
    expect(counters(g, BEARS, 0)).toEqual({});
    expect(counters(g, BEARS, 1)).toEqual({});
    expect(counters(g, 'Sol Ring', 2)).toEqual({});
    // 2 + 4 + 1 = 7 counters removed: 14 +1/+1 counters on a 5/5.
    expect(counters(g, SIN, 0)['+1/+1']).toBe(14);
    g.expect.pt(SIN, 19, 19);
    g.expect.invariants();
  });

  test('a subset: the permanents not chosen keep their counters', () => {
    const g = board((b) =>
      b
        .seat(0)
        .battlefield(BEARS, { counters: { '+1/+1': 2 } })
        .seat(1)
        .battlefield(BEARS, { counters: { '+1/+1': 1 } }),
    );
    g.act(0).cast(SIN, { pay: true });
    g.passAll();
    g.act(0).choosePermanents({ name: BEARS, seat: 1 });
    expect(counters(g, BEARS, 0)).toEqual({ '+1/+1': 2 });
    expect(counters(g, BEARS, 1)).toEqual({});
    expect(counters(g, SIN, 0)['+1/+1']).toBe(2);
  });

  test('none chosen is a legal answer: Sin enters with no counters', () => {
    const g = board((b) => b.seat(1).battlefield(BEARS, { counters: { '+1/+1': 2 } }));
    g.act(0).cast(SIN, { pay: true });
    g.passAll();
    g.act(0).choosePermanents();
    expect(counters(g, BEARS, 1)).toEqual({ '+1/+1': 2 });
    expect(counters(g, SIN, 0)['+1/+1'] ?? 0).toBe(0);
    g.expect.pt(SIN, 5, 5);
  });

  test('a planeswalker is not in the filter: its loyalty counters are not offered, and an answer naming it is refused', () => {
    const g = board((b) =>
      b
        .seat(1)
        .battlefield(WALKER, { counters: { loyalty: 4 } })
        .battlefield(BEARS, { counters: { '+1/+1': 1 } }),
    );
    g.act(0).cast(SIN, { pay: true });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error('expected a permanent choice');
    expect(d.legal).toHaveLength(1);
    const walker = g.find({ name: WALKER, zone: 'battlefield', seat: 1 })[0];
    if (walker === undefined) throw new Error('no walker');
    expect(() => g.act(0).choosePermanents(walker.id)).toThrow();
    g.act(0).choosePermanents({ name: BEARS, seat: 1 });
    expect(counters(g, WALKER, 1)).toEqual({ loyalty: 4 });
  });

  test('with no permanent that has a counter there is no question: it enters without counters', () => {
    const g = board((b) => b.seat(1).battlefield(BEARS));
    g.act(0).cast(SIN, { pay: true });
    g.passAll();
    g.expect.zone(SIN, 'battlefield', { seat: 0 });
    expect(counters(g, SIN, 0)['+1/+1'] ?? 0).toBe(0);
  });

  test('the removal goes through counterRemoved events, one for each kind', () => {
    const g = board((b) => b.seat(1).battlefield(BEARS, { counters: { '+1/+1': 1, charge: 3 } }));
    g.act(0).cast(SIN, { pay: true });
    g.passAll();
    g.act(0).choosePermanents({ name: BEARS, seat: 1 });
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
  test('returned from the graveyard to the battlefield it asks and counts the same', () => {
    const g = board((b) =>
      b
        .seat(0)
        .hand(REANIMATE)
        .graveyard(SIN)
        .battlefield(BEARS, { counters: { '+1/+1': 3 } })
        .battlefield('Swamp', 'Swamp'),
    );
    g.act(0)
      .cast(REANIMATE)
      .targets([{ name: SIN, zone: 'graveyard' }])
      .pay();
    g.passAll();
    g.expect.pending('choosePermanent', 0);
    g.act(0).choosePermanents({ name: BEARS, seat: 0 });
    expect(counters(g, BEARS, 0)).toEqual({});
    expect(counters(g, SIN, 0)['+1/+1']).toBe(6);
  });
});

describe('as a token that is a copy of Sin (CR 111.2, 707.10, 614.12)', () => {
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

  test('the token copy asks the same question and enters with the counters', () => {
    const g = scenario({ seats: 3 })
      .define(sin)
      .define(copier)
      .seat(0)
      .hand(COPIER)
      .library(...LIBRARY)
      .battlefield('Mountain')
      .battlefield(SIN)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { counters: { '+1/+1': 2 } })
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0)
      .cast(COPIER)
      .targets([{ name: SIN, seat: 0 }])
      .pay();
    g.passAll();
    g.expect.pending('choosePermanent', 0);
    g.act(0).choosePermanents({ name: BEARS, seat: 1 });
    const tokens = g
      .find({ name: SIN, zone: 'battlefield', seat: 0 })
      .filter((o) => o.token !== null);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.counters['+1/+1']).toBe(4);
    expect(counters(g, BEARS, 1)).toEqual({});
    g.expect.invariants();
  });
});

describe('when Sin dies (CR 603.10a, 113.7a)', () => {
  const MURDER = 'Murder';

  /** Sin (with counters) on the battlefield of seat 0, a creature to receive them, and two Murders in hand. */
  const dying = (counterKinds: Record<string, number>) =>
    build((b) =>
      b
        .seat(0)
        .library(...LIBRARY)
        .hand(MURDER, MURDER)
        .battlefield('Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp')
        .battlefield(SIN, { counters: counterKinds })
        .battlefield(BEARS)
        .seat(1)
        .library(...LIBRARY)
        .seat(2)
        .library(...LIBRARY),
    );

  test('every counter of every kind goes onto the target creature, then the card is shuffled into its owner library', () => {
    const g = dying({ '+1/+1': 4, charge: 2, oil: 1 });
    g.act(0).cast(`${MURDER}[0]`).targets([SIN]).pay();
    // The only creature seat 0 controls is the target, so no question is asked.
    g.passAll();
    expect(counters(g, BEARS, 0)).toEqual({ '+1/+1': 4, charge: 2, oil: 1 });
    g.expect.noObject(SIN, { zone: 'graveyard' });
    expect(g.find({ name: SIN, zone: 'library', seat: 0 })).toHaveLength(1);
    g.expect.invariants();
  });

  test('an illegal target on resolution: nothing happens and Sin stays in the graveyard', () => {
    const g = dying({ '+1/+1': 2 });
    g.act(0).cast(`${MURDER}[0]`).targets([SIN]).pay();
    // Everyone passes: Murder resolves, Sin dies and its ability is on the stack aimed at the Bears.
    g.pass().pass().pass();
    g.expect.stack(['Sin, Unending Cataclysm (ability)']);
    // In response the Bears die: the target is gone as the ability tries to resolve (CR 608.2b).
    g.act(0)
      .cast(MURDER)
      .targets([{ name: BEARS, seat: 0 }])
      .pay();
    g.passAll();
    g.expect.zone(SIN, 'graveyard', { seat: 0 });
    expect(g.find({ name: SIN, zone: 'library', seat: 0 })).toHaveLength(0);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });

  test('exiled from the graveyard in response, the counters still go on the creature but the card is not shuffled', () => {
    const g = build((b) =>
      b
        .seat(0)
        .library(...LIBRARY)
        .hand(MURDER, 'SYNTHETIC Grave Scour')
        .battlefield('Swamp', 'Swamp', 'Swamp', 'Swamp')
        .battlefield(SIN, { counters: { '+1/+1': 2 } })
        .battlefield(BEARS)
        .seat(1)
        .library(...LIBRARY)
        .seat(2)
        .library(...LIBRARY),
    );
    g.act(0).cast(MURDER).targets([SIN]).pay();
    g.pass().pass().pass();
    g.act(0)
      .cast('SYNTHETIC Grave Scour')
      .targets([{ name: SIN, zone: 'graveyard' }])
      .pay();
    g.passAll();
    // CR 113.7a, 603.10a: the counters are those Sin had on the battlefield, whatever became of the card.
    expect(counters(g, BEARS, 0)).toEqual({ '+1/+1': 2 });
    g.expect.zone(SIN, 'exile', { seat: 0 });
    expect(g.find({ name: SIN, zone: 'library', seat: 0 })).toHaveLength(0);
  });

  test('two Sins dying together: each puts its own counters on a creature its controller controls and is shuffled into its owner library', () => {
    const g = build((b) =>
      b
        .seat(0)
        .library(...LIBRARY)
        .hand('SYNTHETIC Wrath')
        .battlefield('Plains', 'Plains', 'Plains', 'Plains')
        .battlefield(SIN, { counters: { '+1/+1': 3 } })
        .battlefield('SYNTHETIC Indestructible 2/2')
        .seat(1)
        .library(...LIBRARY)
        .battlefield(SIN, { counters: { '+1/+1': 5, charge: 1 } })
        .battlefield('SYNTHETIC Indestructible 2/2')
        .seat(2)
        .library(...LIBRARY),
    );
    g.act(0).cast('SYNTHETIC Wrath', { pay: true });
    g.passAll();
    const guard = 'SYNTHETIC Indestructible 2/2';
    expect(counters(g, guard, 0)).toEqual({ '+1/+1': 3 });
    expect(counters(g, guard, 1)).toEqual({ '+1/+1': 5, charge: 1 });
    expect(g.find({ name: SIN, zone: 'library', seat: 0 })).toHaveLength(1);
    expect(g.find({ name: SIN, zone: 'library', seat: 1 })).toHaveLength(1);
    expect(g.find({ name: SIN, zone: 'graveyard' })).toHaveLength(0);
    g.expect.invariants();
  });
});
