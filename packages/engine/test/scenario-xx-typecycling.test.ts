// Typecycling (CR 702.29e, 702.29f): "[Type]cycling [cost]" means "[Cost], Discard this card: Search your
// library for a [type] card, reveal it, and put it into your hand. Then shuffle your library." (D-104, D-110)
// Pins: CR 702.29e (the type is usually a subtype, "can be any card type, subtype, supertype, or combination
// thereof", as basic landcycling), CR 702.29f (it is a cycling ability: from the hand only, an activated
// ability, a cost like any other), CR 701.23b (a search for a stated quality may find nothing), CR 701.23e
// and 701.20 (the found card is revealed), CR 701.24 (the library is shuffled, also after finding nothing),
// CR 401.2 (the library's order is hidden: the opponent's view names no card), CR 602.2 (activation at instant
// speed). Cards are SYNTHETIC (src/cards/fixtures/synthetic-keywords.ts) or defined here.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { type ChooseCardsDecision, getLegalActions, getView, type ObjectId } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const BASIC_CYCLER = 'SYNTHETIC Landcycler Beast'; // basic landcycling {1}
const ISLAND_CYCLER = 'SYNTHETIC Islandcycler Drake'; // Islandcycling {2}
const TIDE_POOL = 'SYNTHETIC Tide Pool'; // land: Forest Island
const NONBASIC = 'SYNTHETIC Dual Land'; // a land with no land types and not basic

/** The name of the card an object is. */
function nameOf(g: ScenarioGame, id: ObjectId): string | undefined {
  const card = g.state.objects[id]?.card;
  return card == null
    ? undefined
    : g.state.definitions[g.state.cards[card]?.definition ?? -1]?.name;
}

function search(g: { state: { pending: unknown } }): ChooseCardsDecision {
  const d = g.state.pending as { kind?: string };
  if (d?.kind !== 'chooseCards') throw new Error(`expected chooseCards, got ${d?.kind}`);
  return d as ChooseCardsDecision;
}

describe('basic landcycling {1}', () => {
  const build = () =>
    scenario()
      .seat(0)
      .hand(BASIC_CYCLER)
      .battlefield('Forest')
      .library('Grizzly Bears', 'Island', NONBASIC, 'Forest', TIDE_POOL, 'Swamp')
      .seat(1)
      .library('Plains')
      .build();

  test('the cost is paid and the card discarded, then the search offers basic lands only', () => {
    const g = build();
    const cycler = g.id(BASIC_CYCLER);
    g.act(0).activate(BASIC_CYCLER, { pay: true });
    g.expect.zone(BASIC_CYCLER, 'graveyard', { seat: 0 });
    g.expect.tapped({ name: 'Forest', zone: 'battlefield' });
    g.expect.stack([`${BASIC_CYCLER} (ability)`]);
    g.passAll();
    const d = search(g);
    expect(d.seat).toBe(0);
    expect(d.min).toBe(0); // CR 701.23b
    expect(d.max).toBe(1);
    expect(d.reveal).toBe(true);
    // Island, Forest and Swamp: not the Bears, not the nonbasic lands.
    expect(d.legal).toHaveLength(3);
    for (const id of d.legal) expect(['Island', 'Forest', 'Swamp']).toContain(nameOf(g, id));
    expect(g.state.objects[cycler]).toBeUndefined(); // it left the hand: a new object in the graveyard
  });

  test('the chosen land is revealed and goes to the hand, then the library is shuffled', () => {
    const g = build();
    g.act(0).activate(BASIC_CYCLER, { pay: true });
    g.passAll();
    const mark = g.mark();
    g.act(0).chooseCards('Swamp');
    g.expect.zone('Swamp', 'hand', { seat: 0 });
    g.expect.librarySize(0, 5);
    g.expect.eventLog(
      [
        { kind: 'librarySearched', seat: 0, found: 1 },
        { kind: 'cardsRevealed', seat: 0, names: ['Swamp'] },
        { kind: 'zoneChanged', fromZone: 'library', toZone: 'hand' },
        { kind: 'libraryShuffled', seat: 0 },
      ],
      { since: mark },
    );
    g.expect.invariants();
  });

  test('finding nothing is allowed (an empty choice), and the library is shuffled anyway', () => {
    const g = build();
    g.act(0).activate(BASIC_CYCLER, { pay: true });
    g.passAll();
    const mark = g.mark();
    g.act(0).choose({ kind: 'chooseCards', objects: [] });
    g.expect.librarySize(0, 6);
    g.expect.handSize(0, 0);
    g.expect.eventLog([{ kind: 'librarySearched', found: 0 }, { kind: 'libraryShuffled' }], {
      since: mark,
    });
  });

  test('a library with no basic land: nothing is asked, the card is still discarded, the library shuffled', () => {
    const g = scenario()
      .seat(0)
      .hand(BASIC_CYCLER)
      .battlefield('Forest')
      .library('Grizzly Bears', NONBASIC, TIDE_POOL)
      .seat(1)
      .build();
    const mark = g.mark();
    g.act(0).activate(BASIC_CYCLER, { pay: true });
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.zone(BASIC_CYCLER, 'graveyard', { seat: 0 });
    g.expect.eventLog(
      [
        { kind: 'librarySearched', found: 0 },
        { kind: 'libraryShuffled', seat: 0 },
      ],
      { since: mark },
    );
  });

  test('the opponent sees no card of the search (CR 401.2)', () => {
    const g = build();
    g.act(0).activate(BASIC_CYCLER, { pay: true });
    g.passAll();
    expect(getView(g.state, 0).pendingCards).toHaveLength(3);
    expect(getView(g.state, 1).pendingCards).toBeUndefined();
    expect(getLegalActions(g.state, 1)).toEqual([]);
  });

  test('it works only from the hand, and only with the cost payable', () => {
    const onBattlefield = scenario().seat(0).battlefield(BASIC_CYCLER, 'Forest').seat(1).build();
    onBattlefield.expect.illegal(0, { activate: BASIC_CYCLER, ability: 1 });
    const inGraveyard = scenario()
      .seat(0)
      .graveyard(BASIC_CYCLER)
      .battlefield('Forest')
      .seat(1)
      .build();
    expect(getLegalActions(inGraveyard.state, 0).some((a) => a.kind === 'activate')).toBe(false);
    const noMana = scenario().seat(0).hand(BASIC_CYCLER).seat(1).build();
    expect(getLegalActions(noMana.state, 0).some((a) => a.kind === 'activate')).toBe(false);
  });

  test("it can be activated at instant speed on the opponent's turn", () => {
    const g = scenario()
      .seat(0)
      .hand(BASIC_CYCLER)
      .battlefield('Forest')
      .library('Island')
      .seat(1)
      .at('upkeep', { active: 1, priority: 0 })
      .build();
    expect(getLegalActions(g.state, 0).some((a) => a.kind === 'activate')).toBe(true);
  });
});

describe('Islandcycling {2}', () => {
  const build = () =>
    scenario()
      .seat(0)
      .hand(ISLAND_CYCLER)
      .battlefield('Island', 'Island')
      .library('Forest', 'Island', TIDE_POOL, 'SYNTHETIC Dual Island', 'Swamp')
      .seat(1)
      .build();

  test('finds a card with the Island subtype, nonbasic ones included, and no other', () => {
    const g = build();
    g.act(0).activate(ISLAND_CYCLER, { pay: true });
    g.passAll();
    const d = search(g);
    const found = d.legal.map((id) => nameOf(g, id));
    expect(found.sort()).toEqual(['Island', 'SYNTHETIC Dual Island', TIDE_POOL].sort());
    g.act(0).chooseCards(TIDE_POOL);
    g.expect.zone(TIDE_POOL, 'hand', { seat: 0 });
  });

  test('two mana are needed', () => {
    const g = scenario().seat(0).hand(ISLAND_CYCLER).battlefield('Island').seat(1).build();
    expect(getLegalActions(g.state, 0).some((a) => a.kind === 'activate')).toBe(false);
  });
});

describe('the other land types', () => {
  for (const type of ['Plains', 'Swamp', 'Mountain', 'Forest'] as const) {
    test(`${type}cycling finds a ${type}`, () => {
      const card = singleFace({
        name: `SYNTHETIC Test ${type}cycler`,
        manaCost: ['3'],
        types: ['artifact', 'creature'],
        colors: [],
        colorIdentity: [],
        power: 2,
        toughness: 2,
        oracleText: `${type}cycling {1}`,
        abilities: [
          {
            kind: 'keyword',
            keyword: {
              kind: 'typecycling',
              filter: { subtypes: [type] },
              cost: [{ kind: 'mana', symbols: ['1'] }],
            },
          },
        ],
      });
      const g = scenario()
        .seat(0)
        .define(card)
        .hand(card.name)
        .battlefield('Forest')
        .library('Plains', 'Swamp', 'Mountain', 'Forest', 'Island')
        .seat(1)
        .build();
      g.act(0).activate(card.name, { pay: true });
      g.passAll();
      const d = search(g);
      expect(d.legal).toHaveLength(1);
      expect(g.state.objects[d.legal[0] as ObjectId]?.zone).toBe('library');
      g.act(0).chooseCards(type);
      g.expect.zone(type, 'hand', { seat: 0 });
    });
  }
});
