// The companion (CR 103.2b, 116.2g, 702.139): a card revealed from outside the game, brought into the hand once per game as a
// special action.
// Pins: CR 103.2b (it remains outside the game; public), 116.2g and 702.139a (once per game, with priority and an empty stack in a
// main phase of your own turn, pay {3}; a special action: no stack, no response, 116.1), 702.139c (afterwards an ordinary card; it
// never goes back outside the game), 702.139d (cards enter the game from outside it), 903.5a (it is none of the 100 cards),
// 400.7 (the card in the hand is a new object). Cards are SYNTHETIC, defined here.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import {
  applyAction,
  createGame,
  deckOf,
  getLegalActions,
  getView,
  type PriorityOption,
  stateHash,
} from '../src/index';
import type { ScenarioGame } from '../src/testing/index';
import { scenario } from '../src/testing/index';
import { deckA, deckB, type Policy, play } from './random-games';

const BEAR = 'SYNTHETIC Companion Bear'; // {1}{G} 2/2, the companion of seat 0
const OWL = 'SYNTHETIC Companion Owl'; // {1}{U} 1/1 flier, the companion of seat 1
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

const bear = singleFace({
  name: BEAR,
  manaCost: ['1', 'G'],
  types: ['creature'],
  subtypes: ['Bear'],
  colors: ['G'],
  colorIdentity: ['G'],
  power: 2,
  toughness: 2,
  oracleText: 'SYNTHETIC companion text',
});
const owl = singleFace({
  name: OWL,
  manaCost: ['1', 'U'],
  types: ['creature'],
  subtypes: ['Bird'],
  colors: ['U'],
  colorIdentity: ['U'],
  power: 1,
  toughness: 1,
  oracleText: 'SYNTHETIC companion text',
});

type Builder = ReturnType<typeof scenario>;

function game(
  configure: (b: Builder) => Builder = (b) => b,
  at: Parameters<Builder['at']>[1] = { active: 0, turn: 3 },
  step: Parameters<Builder['at']>[0] = 'precombatMain',
): ScenarioGame {
  return configure(
    scenario()
      .define(bear)
      .define(owl)
      .seat(0)
      .life(20)
      .companion(BEAR)
      .library(...FILLER),
  )
    .seat(1)
    .life(20)
    .library(...FILLER)
    .at(step, at)
    .build();
}

const lands = (b: Builder, count = 5) => b.seat(0).battlefield('Forest', { count }).seat(0);

const isBring = (o: PriorityOption): boolean => o.kind === 'bringCompanion';

describe('when it may be brought (CR 116.2g, 702.139a)', () => {
  test('in your main phase with priority, an empty stack and {3}: a priority option', () => {
    const g = game((b) => lands(b, 3));
    g.expect.legal(0, { bringCompanion: true });
    const d = g.state.pending;
    expect(d?.kind === 'priority' && d.options.some(isBring)).toBe(true);
  });

  test('in the second main phase too', () => {
    const g = game((b) => lands(b, 3), { active: 0, turn: 3 }, 'postcombatMain');
    g.expect.legal(0, { bringCompanion: true });
  });

  test('not in the opponent’s turn, even with priority', () => {
    const g = game((b) => lands(b, 3), { active: 1, turn: 4, priority: 0 });
    g.expect.illegal(0, { bringCompanion: true });
  });

  test('not in the other steps of your own turn', () => {
    const g = game((b) => lands(b, 3), { active: 0, turn: 3 }, 'upkeep');
    g.expect.illegal(0, { bringCompanion: true });
    g.advanceTo('beginningOfCombat');
    g.expect.illegal(0, { bringCompanion: true });
    g.advanceTo('end');
    g.expect.illegal(0, { bringCompanion: true });
  });

  test('not while the stack is not empty', () => {
    const g = game((b) => lands(b, 3).hand('Lightning Bolt').battlefield('Mountain'));
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.expect.illegal(0, { bringCompanion: true });
    g.passAll();
    g.expect.legal(0, { bringCompanion: true });
  });

  test('not without {3}', () => {
    const g = game((b) => lands(b, 2));
    g.expect.illegal(0, { bringCompanion: true });
  });

  test('not without a companion', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield('Forest', { count: 5 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.expect.illegal(0, { bringCompanion: true });
  });

  test('only once per game, even after the card has left the hand', () => {
    // Enough mana for a second payment, so only the once-per-game rule can refuse it.
    const g = game((b) => lands(b, 8));
    g.act(0).bringCompanion();
    g.expect.illegal(0, { bringCompanion: true });
    // Cast it: it is on the battlefield, and the action is still gone.
    g.act(0).cast(BEAR, { pay: true });
    g.passAll();
    g.expect.zone(BEAR, 'battlefield', { seat: 0 });
    g.expect.illegal(0, { bringCompanion: true });
  });
});

describe('what bringing does (CR 702.139a, 702.139c, 116.1, 400.7)', () => {
  test('{3} is paid and a card of the game is in the hand; the library is untouched', () => {
    const g = game((b) => lands(b, 5));
    g.expect.librarySize(0, 7);
    g.expect.handSize(0, 0);
    g.act(0).bringCompanion();
    g.expect.zone(BEAR, 'hand', { seat: 0 });
    g.expect.handSize(0, 1);
    g.expect.librarySize(0, 7);
    expect(g.state.battlefield.filter((id) => g.state.objects[id]?.tapped)).toHaveLength(3);
    g.expect.invariants();
    // It is an ordinary card: cast it for its mana cost.
    g.act(0).cast(BEAR, { pay: true });
    g.passAll();
    g.expect.zone(BEAR, 'battlefield', { seat: 0 });
  });

  test('it is a new object, owned and controlled by the seat, and no commander', () => {
    const g = game((b) => lands(b, 3));
    const before = g.state.nextObjectNumber;
    g.act(0).bringCompanion();
    const [card] = g.find({ name: BEAR, zone: 'hand' });
    expect(card).toBeDefined();
    const obj = card === undefined ? undefined : g.state.objects[card.id];
    expect(Number(obj?.id.slice(1))).toBeGreaterThanOrEqual(before);
    expect(obj?.owner).toBe(0);
    expect(obj?.controller).toBe(0);
    expect(g.state.cards[obj?.card ?? 'c-1']?.isCommander).toBe(false);
    expect(g.events.some((e) => e.kind === 'companionBrought' && e.seat === 0)).toBe(true);
  });

  test('a special action: no stack, the same player keeps priority, nobody else is asked', () => {
    const g = game((b) => lands(b, 3));
    const r = applyAction(g.state, 0, { kind: 'bringCompanion' });
    if (!r.ok) throw new Error(r.error);
    expect(r.state.stack).toHaveLength(0);
    expect(r.state.pending?.kind).toBe('priority');
    expect(r.state.pending?.seat).toBe(0);
    expect(r.state.turn.prioritySeat).toBe(0);
    expect(r.state.turn.passedInSuccession).toEqual([]);
    // The opponent never had a decision between the payment and the card arriving.
    expect(r.state.seats[0]?.companion?.brought).toBe(true);
    expect(r.state.seats[0]?.hand).toHaveLength(1);
    // The opponent cannot act at all: it is not their decision.
    expect(applyAction(r.state, 1, { kind: 'pass' }).ok).toBe(false);
  });

  test('destroyed or countered, it goes to the graveyard and is never offered again', () => {
    const g = game((b) =>
      lands(b, 5)
        .hand('Murder')
        .battlefield('Swamp', { count: 3 })
        .seat(1)
        .battlefield('Island', { count: 2 })
        .hand('Counterspell'),
    );
    g.act(0).bringCompanion();
    g.act(0).cast(BEAR, { pay: true });
    g.pass(); // the opponent counters it
    g.act(1).cast('Counterspell', { targets: [BEAR], pay: true });
    g.passAll();
    g.expect.zone(BEAR, 'graveyard', { seat: 0 });
    g.expect.illegal(0, { bringCompanion: true });
    expect(getView(g.state, 0).seats[0]?.companion?.brought).toBe(true);
    g.expect.invariants();
  });
});

describe('it is public (CR 103.2b)', () => {
  test('both seats see the companion of both, brought or not', () => {
    const g = game((b) => lands(b, 3).seat(1).companion(OWL));
    for (const viewer of [0, 1]) {
      const v = getView(g.state, viewer);
      expect(v.seats[0]?.companion?.name).toBe(BEAR);
      expect(v.seats[0]?.companion?.manaCost).toEqual(['1', 'G']);
      expect(v.seats[0]?.companion?.brought).toBe(false);
      expect(v.seats[1]?.companion?.name).toBe(OWL);
      expect(v.seats[1]?.companion?.brought).toBe(false);
    }
    g.act(0).bringCompanion();
    expect(getView(g.state, 1).seats[0]?.companion?.brought).toBe(true);
    // The hidden hand stays hidden: the other seat sees a count, not the card.
    expect(getView(g.state, 1).seats[0]?.hand).toBeNull();
    expect(getView(g.state, 1).seats[0]?.handCount).toBe(1);
  });

  test('a seat without a companion shows none', () => {
    const g = game((b) => lands(b, 3));
    expect(getView(g.state, 0).seats[1]?.companion).toBeUndefined();
  });

  test('the second seat may bring its own in its own turn', () => {
    const g = game((b) => b.seat(1).companion(OWL).battlefield('Island', { count: 3 }), {
      active: 1,
      turn: 4,
      priority: 1,
    });
    g.expect.illegal(0, { bringCompanion: true });
    g.expect.legal(1, { bringCompanion: true });
    g.act(1).bringCompanion();
    g.expect.zone(OWL, 'hand', { seat: 1 });
  });
});

describe('setup and replay', () => {
  const companionCard = deckOf([['Grizzly Bears', 1]])[0];
  if (companionCard === undefined) throw new Error('no fixture');
  const config = (seed: number, companion: boolean) => ({
    seed,
    decks: [
      companion ? { ...deckA(), companion: companionCard } : deckA(),
      companion ? { ...deckB(), companion: companionCard } : deckB(),
    ],
  });

  test('a companion changes neither the 100 cards, the libraries, the hands nor the random draws', () => {
    const plain = createGame(config(7, false)).state;
    const with_ = createGame(config(7, true)).state;
    expect(with_.rng).toEqual(plain.rng);
    expect(Object.keys(with_.cards)).toEqual(Object.keys(plain.cards));
    expect(Object.keys(with_.objects)).toEqual(Object.keys(plain.objects));
    for (const s of plain.seats) {
      expect(with_.seats[s.id]?.library).toEqual(s.library);
      expect(with_.seats[s.id]?.hand).toEqual(s.hand);
    }
    expect(Object.keys(with_.cards)).toHaveLength(200);
    for (const s of with_.seats) {
      expect(s.companion?.brought).toBe(false);
      expect(s.library.length + s.hand.length + s.command.length).toBe(100);
    }
  });

  test('a game without one has no companion field at all', () => {
    const plain = createGame(config(7, false)).state;
    expect(plain.seats.every((s) => !('companion' in s))).toBe(true);
  });

  test('a game that used the companion is rebuilt exactly from its config and action log', () => {
    const bringFirst: Policy = (legal) =>
      legal.find((a) => a.kind === 'bringCompanion') ??
      legal.find((a) => a.kind === 'playLand') ??
      legal.find((a) => a.kind === 'pass') ??
      (legal.find((a) => a.kind !== 'concede') as (typeof legal)[number]);
    const first = play(createGame(config(11, true)).state, bringFirst, 300);
    expect(first.log.some((e) => e.action.kind === 'bringCompanion')).toBe(true);
    let state = createGame(config(11, true)).state;
    for (const { seat, action } of first.log) {
      const r = applyAction(state, seat, action);
      if (!r.ok) throw new Error(r.error);
      state = r.state;
    }
    expect(stateHash(state)).toBe(stateHash(first.state));
    expect(state.seats.filter((s) => s.companion?.brought === true)).not.toHaveLength(0);
  });

  test('every legal action list of a running game stays valid with a companion around', () => {
    const state = createGame(config(3, true)).state;
    const d = state.pending;
    if (d === null) throw new Error('no decision');
    for (const a of getLegalActions(state, d.seat)) expect(a.kind).not.toBe('bringCompanion');
  });
});
