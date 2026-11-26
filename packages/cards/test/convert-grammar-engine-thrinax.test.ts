// Bloodspore Thrinax: "Devour 1" and "Each other creature you control enters with an additional X +1/+1 counters on it, where X is the number of +1/+1 counters on this creature." The REAL
// Oracle text of the card (the corpus's golden.jsonl) goes through the grammar as a card with no override and is played through applyAction in an engine scenario.
// Pins: CR 614.1c and 614.12 (a replacement effect of a permanent on the battlefield, X worked out as the other creature enters, looking at the game without it), CR 122.1 (only counters of the
// kind named), CR 122.6 (counters it enters with otherwise are added to), CR 702.82a (devour). Every test plays three seats: only the controller's creatures are affected.
import { fixtureCard, syntheticCard, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const thrinax = real('Bloodspore Thrinax');
const THRINAX = thrinax.name;
const BEARS = 'Grizzly Bears';
const REANIMATE = 'SYNTHETIC Reanimate Pay Life';
const LIBRARY = Array.from({ length: 6 }, () => 'Plains');

type Builder = ReturnType<typeof scenario>;

const board = (more: (b: Builder) => Builder = (b) => b, active = 0) =>
  more(
    scenario({ seats: 3 })
      .define(thrinax)
      .define(syntheticCard(REANIMATE))
      .seat(0)
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY),
  )
    .at('precombatMain', { active })
    .build();

type Game = ReturnType<typeof board>;

const counters = (g: Game, name: string, seat: number, index = 0) =>
  g.find({ name, zone: 'battlefield', seat })[index]?.counters ?? {};

describe('Bloodspore Thrinax is read completely', () => {
  test('it is valid and its second ability is the group replacement with the counters on itself', () => {
    expect(validateCard(thrinax)).toEqual([]);
    const abilities = thrinax.faces[0]?.abilities ?? [];
    const group = abilities.flatMap((a) =>
      a.kind === 'replacement' && a.replacement.kind === 'othersEnterWithCounters'
        ? [a.replacement]
        : [],
    );
    expect(group).toHaveLength(1);
    expect(group[0]?.counter).toBe('+1/+1');
    expect(group[0]?.count).toEqual({ kind: 'countersOn', of: { kind: 'this' }, counter: '+1/+1' });
    expect(group[0]?.what.controller).toBe('you');
  });
});

describe('creatures that enter under its controller (CR 614.12)', () => {
  test('a creature cast enters with as many extra +1/+1 counters as Thrinax has', () => {
    const g = board((b) =>
      b
        .seat(0)
        .hand(BEARS)
        .battlefield('Forest', 'Forest')
        .battlefield(THRINAX, { counters: { '+1/+1': 3 } }),
    );
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    expect(counters(g, BEARS, 0)['+1/+1']).toBe(3);
    g.expect.pt(BEARS, 5, 5);
    // Thrinax itself is untouched.
    expect(counters(g, THRINAX, 0)['+1/+1']).toBe(3);
    g.expect.invariants();
  });

  test('X is read as each creature enters: when Thrinax gains counters in between, the next one gets more', () => {
    const first = board((b) =>
      b
        .seat(0)
        .hand(BEARS)
        .battlefield('Forest', 'Forest')
        .battlefield(THRINAX, { counters: { '+1/+1': 1 } }),
    );
    first.act(0).cast(BEARS, { pay: true });
    first.passAll();
    expect(counters(first, BEARS, 0)['+1/+1']).toBe(1);
    const second = board((b) =>
      b
        .seat(0)
        .hand(BEARS)
        .battlefield('Forest', 'Forest')
        .battlefield(THRINAX, { counters: { '+1/+1': 4 } }),
    );
    second.act(0).cast(BEARS, { pay: true });
    second.passAll();
    expect(counters(second, BEARS, 0)['+1/+1']).toBe(4);
  });

  test('with no +1/+1 counter on Thrinax a creature enters with none', () => {
    const g = board((b) =>
      b.seat(0).hand(BEARS).battlefield('Forest', 'Forest').battlefield(THRINAX),
    );
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    expect(counters(g, BEARS, 0)['+1/+1'] ?? 0).toBe(0);
    g.expect.pt(BEARS, 2, 2);
  });

  test('only +1/+1 counters count, not other kinds (CR 122.1)', () => {
    const g = board((b) =>
      b
        .seat(0)
        .hand(BEARS)
        .battlefield('Forest', 'Forest')
        .battlefield(THRINAX, { counters: { '+1/+1': 2, charge: 5 } }),
    );
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    expect(counters(g, BEARS, 0)).toEqual({ '+1/+1': 2 });
  });

  test('a creature of another player does not get them, whoever controls Thrinax (three seats)', () => {
    const g = board(
      (b) =>
        b
          .seat(0)
          .battlefield(THRINAX, { counters: { '+1/+1': 2 } })
          .seat(1)
          .hand(BEARS)
          .battlefield('Forest', 'Forest'),
      1,
    );
    g.act(1).cast(BEARS, { pay: true });
    g.passAll();
    expect(counters(g, BEARS, 1)['+1/+1'] ?? 0).toBe(0);
  });

  test('a creature that Thrinax does not control enters from the graveyard under its controller with the counters too', () => {
    const g = board((b) =>
      b
        .seat(0)
        .hand(REANIMATE)
        .graveyard(BEARS)
        .battlefield('Swamp', 'Swamp')
        .battlefield(THRINAX, { counters: { '+1/+1': 2 } }),
    );
    g.act(0)
      .cast(REANIMATE)
      .targets([{ name: BEARS, zone: 'graveyard' }])
      .pay();
    g.passAll();
    expect(counters(g, BEARS, 0)['+1/+1']).toBe(2);
  });

  test('a noncreature permanent is not covered', () => {
    const g = board((b) =>
      b
        .seat(0)
        .hand('Sol Ring')
        .battlefield('Forest', 'Forest')
        .battlefield(THRINAX, { counters: { '+1/+1': 2 } }),
    );
    g.act(0).cast('Sol Ring', { pay: true });
    g.passAll();
    expect(counters(g, 'Sol Ring', 0)).toEqual({});
  });
});

describe('Thrinax itself and a second Thrinax', () => {
  test('it does not apply to itself ("other"): it enters with only its devour counters', () => {
    const g = board((b) =>
      b
        .seat(0)
        .hand(THRINAX)
        .battlefield('Forest', 'Forest', 'Forest', 'Forest')
        .battlefield(BEARS),
    );
    g.act(0).cast(THRINAX, { pay: true });
    g.passAll();
    g.expect.pending('choosePermanent', 0);
    g.act(0).choosePermanents(BEARS);
    expect(counters(g, THRINAX, 0)['+1/+1']).toBe(1);
    g.expect.pt(THRINAX, 3, 3);
  });

  test('a second Thrinax is another creature: it gets the extra counters on top of its devour counters', () => {
    const g = board((b) =>
      b
        .seat(0)
        .hand(THRINAX)
        .battlefield('Forest', 'Forest', 'Forest', 'Forest')
        .battlefield(THRINAX, { counters: { '+1/+1': 3 } })
        .battlefield(BEARS),
    );
    g.act(0).cast(THRINAX, { pay: true });
    g.passAll();
    g.expect.pending('choosePermanent', 0);
    g.act(0).choosePermanents(BEARS);
    const both = g.find({ name: THRINAX, zone: 'battlefield', seat: 0 });
    expect(both.map((o) => o.counters['+1/+1']).sort()).toEqual([3, 4]);
    g.expect.invariants();
  });

  test('it is lost when Thrinax is not on the battlefield: nothing is added from the graveyard', () => {
    const g = board((b) =>
      b.seat(0).hand(BEARS).graveyard(THRINAX).battlefield('Forest', 'Forest'),
    );
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    expect(counters(g, BEARS, 0)['+1/+1'] ?? 0).toBe(0);
  });
});

describe('a token that enters (CR 111.2)', () => {
  /** "Create a token that's a copy of target creature you control." (SYNTHETIC: a Lightning Bolt with other text.) */
  const bolt = fixtureCard('Lightning Bolt');
  const face = bolt.faces[0];
  if (face === undefined) throw new Error('no face');
  const COPIER = 'SYNTHETIC Creature Copier';
  const copier = {
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
                kind: 'object' as const,
                filter: {
                  zone: 'battlefield' as const,
                  types: ['creature'],
                  controller: 'you' as const,
                },
              },
            },
          ],
          effect: {
            kind: 'createToken' as const,
            token: { kind: 'copyOf' as const, object: { kind: 'target' as const, id: 't1' } },
            count: 1,
          },
        },
      },
    ],
  };

  test('a token copy of a creature enters with the extra counters', () => {
    const g = scenario({ seats: 3 })
      .define(thrinax)
      .define(copier)
      .seat(0)
      .hand(COPIER)
      .library(...LIBRARY)
      .battlefield('Mountain')
      .battlefield(THRINAX, { counters: { '+1/+1': 2 } })
      .battlefield(BEARS)
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0)
      .cast(COPIER)
      .targets([{ name: BEARS, seat: 0 }])
      .pay();
    g.passAll();
    const tokens = g
      .find({ name: BEARS, zone: 'battlefield', seat: 0 })
      .filter((o) => o.token !== null);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.counters['+1/+1']).toBe(2);
  });
});
