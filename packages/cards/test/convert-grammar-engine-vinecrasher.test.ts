// Centaur Vinecrasher: "Trample", "This creature enters with a number of +1/+1 counters on it equal to the number of land cards in all graveyards." and "Whenever a land card is put into a
// graveyard from anywhere, you may pay {G}{G}. If you do, return this card from your graveyard to your hand." The REAL Oracle text of the card (the corpus's golden.jsonl) goes through
// the grammar as a card with no override and is played through applyAction in an engine scenario.
// Pins: CR 614.12 (the count is made as it enters, looking at the game without it), CR 404.1 (every player's graveyard), CR 113.6b (an ability that works from the graveyard works there and not
// elsewhere), CR 603.2 (a land card put into a graveyard from the battlefield, a hand, a library: a trigger for each card), CR 118.12 (pay, then return), CR 400.7 (a card that left the
// graveyard is a new object). Every test plays three seats.
import {
  type CardDefinition,
  fixtureCard,
  syntheticCard,
  validateCard,
} from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const vine = real('Centaur Vinecrasher');
const VINE = vine.name;
const BEARS = 'Grizzly Bears';
const REANIMATE = 'SYNTHETIC Reanimate Pay Life';
const LIBRARY = Array.from({ length: 6 }, () => 'Forest');

const bolt = fixtureCard('Lightning Bolt');
const boltFace = bolt.faces[0];
if (boltFace === undefined) throw new Error('no face');

/** A SYNTHETIC {R} sorcery-speed stand-in for Stone Rain: "Destroy target land." */
const RAIN = 'SYNTHETIC Rain of Ruin';
const rain: CardDefinition = {
  ...bolt,
  name: RAIN,
  faces: [
    {
      ...boltFace,
      name: RAIN,
      oracleText: 'Destroy target land.',
      spell: {
        targets: [
          { id: 't1', what: { kind: 'object', filter: { zone: 'battlefield', types: ['land'] } } },
        ],
        effect: { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
      },
    },
  ],
};

/** A SYNTHETIC {R} spell: "Mill a card." (you). */
const MILL = 'SYNTHETIC Brief Mill';
const mill: CardDefinition = {
  ...bolt,
  name: MILL,
  faces: [
    {
      ...boltFace,
      name: MILL,
      oracleText: 'Mill a card.',
      spell: { effect: { kind: 'mill', player: { kind: 'you' }, count: 1 } },
    },
  ],
};

type Builder = ReturnType<typeof scenario>;

const board = (more: (b: Builder) => Builder = (b) => b, active = 0) =>
  more(
    scenario({ seats: 3 })
      .define(vine)
      .define(rain)
      .define(mill)
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

const counters = (g: Game, name: string, seat: number) =>
  g.find({ name, zone: 'battlefield', seat })[0]?.counters ?? {};

describe('Centaur Vinecrasher is read completely', () => {
  test('it is valid and has the replacement and the trigger that works from the graveyard', () => {
    expect(validateCard(vine)).toEqual([]);
    const abilities = vine.faces[0]?.abilities ?? [];
    const enters = abilities.flatMap((a) =>
      a.kind === 'replacement' && a.replacement.kind === 'entersWithCounters'
        ? [a.replacement]
        : [],
    );
    expect(enters).toHaveLength(1);
    const count = enters[0]?.count;
    expect(typeof count === 'object' && 'kind' in count ? count.kind : null).toBe('countOf');
    const triggers = abilities.flatMap((a) => (a.kind === 'triggered' ? [a] : []));
    expect(triggers).toHaveLength(1);
    expect(triggers[0]?.functionsIn).toBe('graveyard');
    expect(triggers[0]?.trigger).toEqual({
      kind: 'putIntoGraveyard',
      who: 'any',
      from: 'anywhere',
      filter: { types: ['land'] },
    });
  });
});

describe('it enters with a counter for each land card in all graveyards (CR 614.12, 404.1)', () => {
  test('the lands of every player count, nothing else does', () => {
    const g = board((b) =>
      b
        .seat(0)
        .hand(VINE)
        .graveyard('Forest', BEARS)
        .battlefield('Forest', 'Forest', 'Forest', 'Forest', 'Forest')
        .seat(1)
        .graveyard('Mountain', 'Mountain', BEARS)
        .battlefield('Island')
        .seat(2)
        .graveyard('Plains'),
    );
    g.act(0).cast(VINE, { pay: true });
    g.passAll();
    // Four land cards (the Island on the battlefield is no card in a graveyard): 1/1 + four counters.
    expect(counters(g, VINE, 0)['+1/+1']).toBe(4);
    g.expect.pt(VINE, 5, 5);
    g.expect.invariants();
  });

  test('with no land card in a graveyard it enters with none', () => {
    const g = board((b) =>
      b.seat(0).hand(VINE).graveyard(BEARS).battlefield('Forest', 'Forest', 'Forest', 'Forest'),
    );
    g.act(0).cast(VINE, { pay: true });
    g.passAll();
    expect(counters(g, VINE, 0)['+1/+1'] ?? 0).toBe(0);
    g.expect.pt(VINE, 1, 1);
  });

  test('returned from its graveyard to the battlefield by an effect it counts the same, without itself', () => {
    const g = board((b) =>
      b
        .seat(0)
        .hand(REANIMATE)
        .graveyard(VINE, 'Forest')
        .battlefield('Swamp', 'Swamp')
        .seat(2)
        .graveyard('Mountain'),
    );
    g.act(0)
      .cast(REANIMATE)
      .targets([{ name: VINE, zone: 'graveyard' }])
      .pay();
    g.passAll();
    expect(counters(g, VINE, 0)['+1/+1']).toBe(2);
  });
});

describe('a land card put into a graveyard from anywhere (CR 113.6b, 603.2)', () => {
  /** Vinecrasher in the graveyard of seat 0 with two Forests to pay for it; seat 1 has a land to lose. */
  const grave = () =>
    board((b) =>
      b
        .seat(0)
        .hand(RAIN, MILL, BEARS)
        .graveyard(VINE)
        .battlefield('Mountain', 'Mountain', 'Forest', 'Forest')
        .seat(1)
        .battlefield('Island')
        .seat(2)
        .battlefield('Plains'),
    );

  test('a land destroyed on the battlefield, of another player, brings it back for {G}{G}', () => {
    const g = grave();
    g.act(0).cast(RAIN, { targets: [{ name: 'Island', seat: 1 }], pay: true });
    g.passAll();
    g.expect.zone('Island', 'graveyard', { seat: 1 });
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.act(0).payAuto();
    g.passAll();
    g.expect.zone(VINE, 'hand', { seat: 0 });
    g.expect.noObject(VINE, { zone: 'graveyard' });
    g.expect.invariants();
  });

  test('a land of a third player counts too, and a land milled from the library as well', () => {
    const third = grave();
    third.act(0).cast(RAIN, { targets: [{ name: 'Plains', seat: 2 }], pay: true });
    third.passAll();
    third.act(0).accept();
    third.act(0).payAuto();
    third.passAll();
    third.expect.zone(VINE, 'hand', { seat: 0 });

    const milled = grave();
    milled.act(0).cast(MILL, { pay: true });
    milled.passAll();
    // The top card of the library is a Forest: a land card put into a graveyard from a library.
    milled.act(0).accept();
    milled.act(0).payAuto();
    milled.passAll();
    milled.expect.zone(VINE, 'hand', { seat: 0 });
  });

  test('declining to pay leaves it in the graveyard', () => {
    const g = grave();
    g.act(0).cast(RAIN, { targets: [{ name: 'Island', seat: 1 }], pay: true });
    g.passAll();
    g.act(0).decline();
    g.passAll();
    g.expect.zone(VINE, 'graveyard', { seat: 0 });
    g.expect.pending('priority', 0);
  });

  test('a card that is not a land does not trigger it', () => {
    const g = board((b) =>
      b
        .seat(0)
        .hand('Murder')
        .graveyard(VINE)
        .battlefield('Swamp', 'Swamp', 'Swamp', 'Forest', 'Forest')
        .seat(1)
        .battlefield(BEARS),
    );
    g.act(0).cast('Murder', { targets: [{ name: BEARS, seat: 1 }], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.zone(VINE, 'graveyard', { seat: 0 });
    g.expect.pending('priority', 0);
  });

  test('it works from the graveyard only: on the battlefield or in the hand it does nothing', () => {
    for (const place of ['battlefield', 'hand'] as const) {
      const g = board((b) =>
        (place === 'battlefield' ? b.seat(0).battlefield(VINE) : b.seat(0).hand(VINE))
          .seat(0)
          .hand(RAIN)
          .battlefield('Mountain', 'Forest', 'Forest')
          .seat(1)
          .battlefield('Island'),
      );
      g.act(0).cast(RAIN, { targets: [{ name: 'Island', seat: 1 }], pay: true });
      g.passAll();
      g.expect.zone('Island', 'graveyard', { seat: 1 });
      g.expect.pending('priority', 0);
      g.expect.zone(VINE, place, { seat: 0 });
    }
  });

  test('a copy in the graveyard of another player triggers for its owner, not for the caster', () => {
    const g = board((b) =>
      b
        .seat(0)
        .hand(RAIN)
        .battlefield('Mountain')
        .seat(1)
        .graveyard(VINE)
        .battlefield('Island', 'Forest', 'Forest')
        .seat(2)
        .battlefield('Plains'),
    );
    g.act(0).cast(RAIN, { targets: [{ name: 'Plains', seat: 2 }], pay: true });
    g.passAll();
    // The owner of the card, seat 1, is asked and pays.
    g.expect.pending('confirmOptional', 1);
    g.act(1).accept();
    g.act(1).payAuto();
    g.passAll();
    g.expect.zone(VINE, 'hand', { seat: 1 });
  });
});
