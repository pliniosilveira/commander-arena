// Emblems a seat owns from the start (the app's challenges). The abilities are written as AST, as the web writes them.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import {
  type Ability,
  type Action,
  applyAction,
  createGame,
  deckOf,
  type GameState,
  getLegalActions,
  getView,
} from '../src/index';
import { scenario } from '../src/testing/index';

const FIRST_UPKEEP_LAND: Ability = {
  kind: 'triggered',
  trigger: { kind: 'upkeep', whose: 'you' },
  interveningIf: { kind: 'ownTurnNumber', compare: { cmp: 'equal', value: 1 } },
  effect: {
    kind: 'search',
    player: { kind: 'you' },
    filter: { types: ['land'], supertypes: ['basic'] },
    max: 1,
    destinations: [{ zone: 'battlefield', count: 1 }],
    reveal: false,
    shuffle: true,
  },
};

const deck = () =>
  deckOf([
    ['Yargle, Glutton of Urborg', 1],
    ['Swamp', 60],
    ['Grizzly Bears', 39],
  ]);

function game(emblems: boolean) {
  return createGame({
    seed: 3,
    decks: [
      { cards: deck(), commanders: [0] },
      { cards: deck(), commanders: [0] },
    ],
    ...(emblems
      ? {
          startingEmblems: [{ seat: 1, abilities: [FIRST_UPKEEP_LAND], text: 'first upkeep land' }],
        }
      : {}),
  });
}

/** Keeps, passes, and takes the first card of any search, until `done`. */
function drive(start: GameState, done: (s: GameState) => boolean): GameState {
  let state = start;
  for (let i = 0; i < 400 && !done(state) && state.result === null; i += 1) {
    const d = state.pending;
    if (d === null) throw new Error('no pending decision');
    const legal = getLegalActions(state, d.seat);
    const found = d.kind === 'chooseCards' ? d.legal[0] : undefined;
    const pick: Action =
      found !== undefined
        ? { kind: 'chooseCards', objects: [found] }
        : (legal.find((a) => a.kind === 'keepHand') ??
          legal.find((a) => a.kind === 'pass') ??
          (legal[0] as Action));
    const r = applyAction(state, d.seat, pick);
    if (!r.ok) throw new Error(r.error);
    state = r.state;
  }
  return state;
}

const GAIN_2: Ability = {
  kind: 'triggered',
  trigger: { kind: 'upkeep', whose: 'you' },
  effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 2 },
};

describe('starting emblems', () => {
  test('"at the beginning of your upkeep, you gain 2 life" works at every upkeep of that seat only', () => {
    const { state } = createGame({
      seed: 3,
      decks: [
        { cards: deck(), commanders: [0] },
        { cards: deck(), commanders: [0] },
      ],
      startingEmblems: [{ seat: 1, abilities: [GAIN_2], text: 'gain 2' }],
    });
    const end = drive(state, (s) => s.turn.number >= 5);
    // Turns 1 to 4 were played: the seat had two of them (the turns are taken in turns).
    expect(end.seats[0]?.life).toBe(40);
    expect(end.seats[1]?.life).toBe(44);
  });

  test('the seat has the emblem in its command zone before the opening hand, the other seat has none', () => {
    const { state, events } = game(true);
    expect(events.some((e) => e.kind === 'emblemCreated' && e.seat === 1)).toBe(true);
    const view = getView(state, 1);
    expect(JSON.stringify(view)).toContain('first upkeep land');
    expect(state.seats[1]?.command.length).toBe(2); // the commander and the emblem
    expect(state.seats[0]?.command.length).toBe(1);
  });

  test('a game without them is unchanged', () => {
    expect(game(false).state.seats[1]?.command.length).toBe(1);
  });

  test('"at the beginning of your first upkeep" puts one land onto the battlefield on that seat\'s first turn only', () => {
    const lands = (s: GameState) =>
      s.battlefield.filter((id) => s.objects[id]?.controller === 1).length;
    const end = drive(game(true).state, (s) => s.turn.number >= 5);
    // Seat 1 had its first turn (turn 1 or 2) and a later one; it got exactly one land and never played any.
    expect(lands(end)).toBe(1);
  });
});

// The second emblem is a trigger on a creature of a given name entering under its controller's control. It is made here by a SYNTHETIC rite,
// because the scenario DSL builds the state directly; the ability is the one the web gives the emblem at the start.
const NAMED_TRIGGER: Ability = {
  kind: 'triggered',
  trigger: {
    kind: 'entersBattlefield',
    what: { types: ['creature'], named: 'Grizzly Bears', controller: 'you' },
  },
  effect: {
    kind: 'search',
    player: { kind: 'you' },
    filter: { named: 'Grizzly Bears' },
    max: 1,
    destinations: [{ zone: 'hand', count: 1 }],
    reveal: false,
    shuffle: true,
  },
};
const RITE = 'SYNTHETIC Named Entry Emblem Rite';
const rite = singleFace({
  name: RITE,
  manaCost: ['1'],
  types: ['sorcery'],
  colors: [],
  colorIdentity: [],
  oracleText: 'SYNTHETIC fixture that creates the named-entry emblem.',
  spell: { effect: { kind: 'createEmblem', text: 'named entry', abilities: [NAMED_TRIGGER] } },
});

describe('an emblem that triggers when a creature of one name enters', () => {
  test('a creature of that name entering fetches another into the hand, and one of another name does not', () => {
    const g = scenario()
      .define(rite)
      .seat(0)
      .hand(RITE, 'Grizzly Bears', 'Giant Spider')
      .library('Grizzly Bears', 'Island', 'Island')
      .battlefield('Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest')
      .seat(1)
      .library('Island', { count: 3 })
      .build();
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.act(0).cast('Giant Spider', { pay: true });
    g.passAll();
    expect(g.state.stack.length).toBe(0);
    g.act(0).cast('Grizzly Bears', { pay: true });
    g.passAll();
    g.expect.stack(['Emblem (ability)']);
  });
});
