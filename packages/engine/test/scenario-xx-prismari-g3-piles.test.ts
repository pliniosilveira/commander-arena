// The Prismari deck (issue 87), group 3: Abstract Performance, "Exile the top four cards of your library in a face-down pile, then exile the top four cards of your library in a face-up
// pile. An opponent chooses one of those piles. Put that pile into your graveyard. Look at the cards in the other pile. You may cast a spell from among them without paying its mana cost.
// Put the rest into your hand." (SYNTHETIC Pile Performance, src/cards/fixtures/synthetic-prismari-g3.ts). Pins: CR 700.3 (piles: each card in exactly one pile, a pile may hold no card,
// the cards stay in the zone they are in while they are grouped), CR 406.3 and 406.3a-b (a card exiled face down cannot be examined, except by a player who is allowed to look at it; a
// spell may be cast from among face-down cards only by one who may look at them; the card turns face up as it is cast), CR 701.13 (exile), CR 608.2g (the spell is cast during resolution,
// without paying its mana cost), CR 403.3 and 400.7 (what leaves a zone is a new object), CR 903.9b (a commander going to the hand asks its owner).
import { describe, expect, test } from 'vitest';
import { getLegalActions, getView, syntheticCard, validateCard } from '../src/index';
import type { ScenarioGame } from '../src/testing/index';
import { scenario } from '../src/testing/index';
import { definitionOf } from '../src/state/ops';
import { chooseCardsDecision, chooseOptionDecision } from './pending-helpers';

const PERFORMANCE = 'SYNTHETIC Pile Performance';
const GAIN2 = 'SYNTHETIC Calamity Gain Two'; // {1}{R} sorcery, gain 2 life
const GAIN7 = 'SYNTHETIC Calamity Gain Seven'; // {6}{R} sorcery, gain 7 life
const DISCARD_DRAW = 'SYNTHETIC Calamity Discard Draw';
const BIG = 'SYNTHETIC Prismari Big Study';
const TRINKET = 'SYNTHETIC Prismari Trinket';
const DOWN = ['d1', 'd2', 'd3', 'd4'] as const;
const UP = ['u1', 'u2', 'u3', 'u4'] as const;

/** The first pile (face down) is four cards, the second four more; `rest` stays in the library below them. */
function game(
  down: readonly string[],
  up: readonly string[],
  rest: readonly string[] = ['Island', 'Island'],
  extra: (b: ReturnType<typeof scenario>) => void = () => {},
) {
  const b = scenario().seat(0).hand(PERFORMANCE).pool('UUUUUU');
  down.forEach((name, i) => {
    b.library(name, { label: DOWN[i] ?? `d${i}` });
  });
  up.forEach((name, i) => {
    b.library(name, { label: UP[i] ?? `u${i}` });
  });
  for (const name of rest) b.library(name);
  extra(b);
  const g = b
    .seat(1)
    .library('Island', 'Island')
    .at('precombatMain', { active: 0 })
    .build();
  g.act(0).cast(PERFORMANCE, { pay: true });
  g.passAll();
  return g;
}

const zoneOf = (g: ScenarioGame, label: string) => g.state.objects[g.id(label)]?.zone;
/** The names of the cards of a zone of seat 0, in zone order (the graveyard: oldest first). */
const names = (g: ScenarioGame, zone: 'graveyard' | 'hand' | 'exile') =>
  (zone === 'exile' ? g.state.exile : (g.state.seats[0]?.[zone] ?? [])).map((id) => {
    const card = g.state.objects[id]?.card;
    return card === null || card === undefined ? '?' : definitionOf(g.state, card).name;
  });

const FOUR_DOWN = [GAIN2, GAIN7, 'Island', 'Island'];
const FOUR_UP = [BIG, TRINKET, 'Island', 'Island'];

describe('the card is valid', () => {
  test(PERFORMANCE, () => expect(validateCard(syntheticCard(PERFORMANCE))).toEqual([]));
});

describe('two piles of exiled cards: one face down, one face up (CR 700.3, 406.3)', () => {
  test('eight cards are exiled, four in each pile, from the top; the face-down pile first; the rest of the library stays', () => {
    const g = game(FOUR_DOWN, FOUR_UP);
    expect(g.state.seats[0]?.library).toHaveLength(2);
    // The opponent is asked which pile: nothing has moved to the graveyard yet (CR 700.3c: the piles stay where they are).
    const d = chooseOptionDecision(g);
    expect(d).toMatchObject({ seat: 1, purpose: 'pile', options: ['pile1', 'pile2'] });
    expect(d.piles).toMatchObject({
      chosenTo: 'graveyard',
      otherTo: 'hand',
      receiver: 0,
      separator: 0,
      faceDownPile: 1,
      faceDownCount: 4,
      zone: 'exile',
    });
    expect(d.piles?.first).toHaveLength(4);
    expect(d.piles?.second).toHaveLength(4);
    for (const id of [...(d.piles?.first ?? []), ...(d.piles?.second ?? [])]) {
      expect(g.state.objects[id]?.zone).toBe('exile');
    }
    for (const id of d.piles?.first ?? []) {
      expect(g.state.objects[id]?.exiledFaceDown).toBe(true);
    }
    for (const id of d.piles?.second ?? []) {
      expect(g.state.objects[id]?.exiledFaceDown).not.toBe(true);
    }
    // The Performance itself is on the stack, resolving.
    expect(names(g, 'graveyard')).toEqual([]);
    g.expect.invariants();
  });

  test('the opponent sees only the number of cards of the face-down pile, and the cards of the face-up pile', () => {
    const g = game(FOUR_DOWN, FOUR_UP);
    const d = chooseOptionDecision(g);
    const seen = getView(g.state, 1).pending;
    if (seen?.kind !== 'chooseOption') throw new Error('no pile question in the view');
    expect(seen.piles?.first).toEqual([]);
    expect(seen.piles?.faceDownCount).toBe(4);
    expect(seen.piles?.second).toEqual(d.piles?.second);
    // The face-down cards are face-down to the opponent in the exile zone of the view, and have no name.
    const view = getView(g.state, 1);
    for (const id of d.piles?.first ?? []) {
      const o = view.exile.find((x) => x.id === id);
      expect(o?.name).toBe('Face-down card');
    }
    // Nor does the controller see them until they look: the cards are theirs, but nobody may look at a card exiled face down.
    const mine = getView(g.state, 0);
    for (const id of d.piles?.first ?? []) {
      expect(mine.exile.find((x) => x.id === id)?.name).toBe('Face-down card');
    }
  });

  test('the opponent chooses: only they are asked, and a choice of the controller is refused', () => {
    const g = game(FOUR_DOWN, FOUR_UP);
    expect(getLegalActions(g.state, 0)).toEqual([]);
    expect(getLegalActions(g.state, 1).map((a) => a.kind)).toEqual([
      'chooseOption',
      'chooseOption',
      'concede',
    ]);
  });
});

describe('the chosen pile goes to the graveyard, the controller may cast a spell from the other (CR 608.2g, 406.3b)', () => {
  test('pile 2 (face up) chosen: its cards go to the graveyard; the face-down pile is looked at, one spell is cast, the rest go to the hand', () => {
    const g = game(FOUR_DOWN, FOUR_UP);
    g.act(1).chooseOption('pile2');
    // The face-up pile is in the graveyard (the controller's), event names them.
    expect(names(g, 'graveyard')).toEqual([BIG, TRINKET, 'Island', 'Island']);
    // The controller looks at the face-down cards: they can be chosen to cast.
    const cast = chooseCardsDecision(g);
    expect(cast).toMatchObject({ seat: 0, purpose: 'cast', zone: 'exile' });
    expect(cast.legal).toHaveLength(2); // Gain Two and Gain Seven; the lands cannot be cast
    expect(getView(g.state, 0).pendingCards?.map((o) => o.name).sort()).toEqual([GAIN2, GAIN7].sort());
    g.act(0).chooseCards({ name: GAIN7, zone: 'exile', seat: 0 });
    // The rest of the pile goes into the hand: the other three cards of the pile.
    g.passAll();
    g.expect.life(0, 47);
    expect(names(g, 'hand').sort()).toEqual([GAIN2, 'Island', 'Island'].sort());
    expect(g.state.exile).toHaveLength(0);
    g.expect.invariants();
  });

  test('pile 1 (face down) chosen: it is put into the graveyard face up; the face-up pile is the other pile', () => {
    const g = game(FOUR_DOWN, FOUR_UP);
    g.act(1).chooseOption('pile1');
    expect(names(g, 'graveyard').sort()).toEqual([GAIN2, GAIN7, 'Island', 'Island'].sort());
    const cast = chooseCardsDecision(g);
    expect(cast.legal).toHaveLength(2); // the Big Study and the Trinket
    g.act(0).chooseCards({ name: TRINKET, zone: 'exile', seat: 0 });
    g.passAll();
    g.expect.zone(TRINKET, 'battlefield', { seat: 0 });
    expect(g.state.seats[0]?.hand).toHaveLength(3);
  });

  test('no card is cast: all of the other pile goes into the hand', () => {
    const g = game(FOUR_DOWN, FOUR_UP);
    g.act(1).chooseOption('pile2');
    g.act(0).chooseCards();
    expect(g.state.seats[0]?.hand).toHaveLength(4);
    expect(g.state.exile).toHaveLength(0);
    expect(g.state.seats[0]?.hand.map((id) => g.state.objects[id]?.exiledFaceDown)).not.toContain(
      true,
    );
  });

  test('"a spell": only one is cast, whatever the pile has; the other spells go to the hand', () => {
    const g = game([GAIN2, GAIN7, BIG, TRINKET], FOUR_UP);
    g.act(1).chooseOption('pile2');
    g.act(0).chooseCards({ name: BIG, zone: 'exile', seat: 0 });
    // No second question: one spell.
    expect(g.state.pending?.kind).not.toBe('chooseCards');
    g.passAll();
    // The three spells not cast go to the hand, and the Big Study that was cast drew an Island.
    expect(names(g, 'hand').sort()).toEqual([GAIN2, GAIN7, TRINKET, 'Island'].sort());
  });

  test('no spell in the other pile: nothing is asked, all of it goes to the hand', () => {
    // The face-down pile of spells goes to the graveyard; the other pile has four lands.
    const g = game(FOUR_DOWN, ['Island', 'Island', 'Island', 'Island']);
    g.act(1).chooseOption('pile1');
    g.expect.pending('priority', 0);
    expect(g.state.seats[0]?.hand).toHaveLength(4);
    expect(g.state.exile).toHaveLength(0);
  });

  test('the spell is cast without paying its mana cost (CR 118.9): no mana is spent', () => {
    const g = game(FOUR_DOWN, FOUR_UP, ['Island'], (b) => b.pool('UUUUUUUUUUU'));
    const before = JSON.stringify(g.state.seats[0]?.pool);
    g.act(1).chooseOption('pile2');
    g.act(0).chooseCards({ name: GAIN7, zone: 'exile', seat: 0 });
    expect(JSON.stringify(g.state.seats[0]?.pool)).toBe(before);
  });

  test('a face-down card that is cast turns face up as it is cast (CR 406.3a)', () => {
    const g = game(FOUR_DOWN, FOUR_UP);
    g.act(1).chooseOption('pile2');
    g.act(0).chooseCards({ name: GAIN7, zone: 'exile', seat: 0 });
    const onStack = g.state.stack.map((id) => g.state.objects[id]);
    expect(onStack[0]?.exiledFaceDown).not.toBe(true);
    expect(getView(g.state, 1).stack.some((o) => o.name === GAIN7)).toBe(true);
  });

  test('a spell with an additional cost: the cost is paid; one that cannot be paid is not offered', () => {
    const g = game([DISCARD_DRAW, 'Island', 'Island', 'Island'], FOUR_UP);
    g.act(1).chooseOption('pile2');
    // The hand is empty (the Performance itself was cast): the discard cannot be paid, so the card is not offered.
    g.expect.pending('priority', 0);
    expect(names(g, 'hand').filter((c) => c === DISCARD_DRAW)).toHaveLength(1);
  });
});

describe('libraries shorter than the piles (CR 700.3d: a pile may hold no card)', () => {
  test('six cards: the face-down pile has four, the face-up pile two; the opponent still chooses', () => {
    const b = scenario().seat(0).hand(PERFORMANCE).pool('UUUUUU');
    for (const name of [GAIN2, GAIN7, 'Island', 'Island', BIG, TRINKET]) b.library(name);
    const g = b.seat(1).library('Island').at('precombatMain', { active: 0 }).build();
    g.act(0).cast(PERFORMANCE, { pay: true });
    g.passAll();
    const d = chooseOptionDecision(g);
    expect(d.piles?.faceDownCount).toBe(4);
    expect(d.piles?.second).toHaveLength(2);
    g.act(1).chooseOption('pile1');
    expect(g.state.seats[0]?.library).toHaveLength(0);
    g.expect.invariants();
  });

  test('four cards: the face-up pile has none; the opponent may put the face-down pile away, and there is nothing to cast', () => {
    const b = scenario().seat(0).hand(PERFORMANCE).pool('UUUUUU');
    for (const name of FOUR_DOWN) b.library(name);
    const g = b.seat(1).library('Island').at('precombatMain', { active: 0 }).build();
    g.act(0).cast(PERFORMANCE, { pay: true });
    g.passAll();
    const d = chooseOptionDecision(g);
    expect(d.piles?.second).toEqual([]);
    g.act(1).chooseOption('pile1');
    g.expect.pending('priority', 0);
    // The four cards of the pile, and the Performance itself once it has finished resolving.
    expect(names(g, 'graveyard')).toHaveLength(5);
    expect(g.state.seats[0]?.hand).toHaveLength(0);
  });

  test('four cards, the empty pile put away: the opponent can choose the empty pile, and the controller looks at all four', () => {
    const b = scenario().seat(0).hand(PERFORMANCE).pool('UUUUUU');
    for (const name of FOUR_DOWN) b.library(name);
    const g = b.seat(1).library('Island').at('precombatMain', { active: 0 }).build();
    g.act(0).cast(PERFORMANCE, { pay: true });
    g.passAll();
    g.act(1).chooseOption('pile2');
    expect(chooseCardsDecision(g).legal).toHaveLength(2);
    g.act(0).chooseCards({ name: GAIN2, zone: 'exile', seat: 0 });
    g.passAll();
    expect(g.state.seats[0]?.hand).toHaveLength(3);
  });

  test('an empty library: nothing is exiled, nothing is asked', () => {
    const g = scenario()
      .seat(0)
      .hand(PERFORMANCE)
      .pool('UUUUUU')
      .seat(1)
      .library('Island')
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(PERFORMANCE, { pay: true });
    g.passAll();
    g.expect.pending('priority', 0);
    expect(g.state.exile).toHaveLength(0);
  });
});

describe('a commander in a pile', () => {
  test('a commander in the pile put into the hand asks its owner (CR 903.9b)', () => {
    const b = scenario().seat(0).hand(PERFORMANCE).pool('UUUUUU');
    b.library('Grizzly Bears', { commander: true, label: 'cmd' });
    for (const name of ['Island', 'Island', 'Island', ...FOUR_UP]) b.library(name);
    const g = b.seat(1).library('Island').at('precombatMain', { active: 0 }).build();
    g.act(0).cast(PERFORMANCE, { pay: true });
    g.passAll();
    // The commander is in the face-down pile; the opponent sends the face-up pile to the graveyard.
    g.act(1).chooseOption('pile2');
    g.act(0).chooseCards();
    expect(g.state.pending).toMatchObject({ kind: 'commanderZone', seat: 0 });
  });
});
