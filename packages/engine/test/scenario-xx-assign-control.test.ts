// Issue 81 (Dack Fayden): "Reveal cards from the top of your library until you reveal X creature cards, where X is the number of opponents you have. Put those creature cards onto the
// battlefield, then shuffle. They're goaded for the rest of the game. For each of those permanents, choose a different opponent. Each opponent gains control of the permanent for which they
// were chosen." Pins: CR 701.15a (goad), 613.1b and 611.2a (a control effect with no duration), 101.4 (choices), 608.2g. Cards are SYNTHETIC.
import { describe, expect, test } from 'vitest';
import { applyAction, type GameState, getView } from '../src/index';
import { goadersOf } from '../src/rules/goad';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const SPELL = 'SYNTHETIC Gift Of Beasts';
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';

const spell = singleFaceCard({
  name: SPELL,
  manaCost: ['G'],
  types: ['sorcery'],
  colors: ['G'],
  colorIdentity: ['G'],
  oracleText:
    'Reveal until X creature cards, X the number of opponents. Goad them. Give each to a different opponent.',
  spell: {
    effect: {
      kind: 'sequence',
      effects: [
        {
          kind: 'revealUntil',
          filter: { types: ['creature'] },
          count: { kind: 'opponentCount' },
          put: 'battlefield',
          rest: 'stay',
        },
        { kind: 'shuffle', player: { kind: 'you' } },
        { kind: 'goad', objects: { kind: 'moved' }, forever: true },
        { kind: 'assignControlToOpponents', objects: { kind: 'moved' } },
      ],
    },
  },
});

function twoSeats(): ScenarioGame {
  return scenario()
    .seat(0)
    .define(spell)
    .hand(SPELL)
    .battlefield('Forest')
    .library('Plains', BEARS, 'Plains', SPIDER)
    .seat(1)
    .library('Plains', 'Plains')
    .at('precombatMain', { active: 0, turn: 1 })
    .build();
}

/** Three seats: seat 2 is a copy of seat 1's seat. The spell is on the stack. */
function threeSeats(): GameState {
  const g = scenario()
    .seat(0)
    .define(spell)
    .hand(SPELL)
    .battlefield('Forest')
    .library('Plains', BEARS, 'Plains', SPIDER)
    .seat(1)
    .library('Plains', 'Plains')
    .at('precombatMain', { active: 0, turn: 1 })
    .build();
  g.act(0).cast(SPELL, { pay: true });
  const s1 = g.state.seats[1];
  if (s1 === undefined) throw new Error('seat 1');
  return {
    ...g.state,
    seats: [...g.state.seats, { ...s1, id: 2, library: [], hand: [] }],
  } as unknown as GameState;
}

const apply = (state: GameState, seat: number, action: Parameters<typeof applyAction>[2]) => {
  const out = applyAction(state, seat, action);
  if (!out.ok) throw new Error(out.error);
  return out.state;
};

const pass = (state: GameState): GameState => {
  let next = state;
  for (let i = 0; i < 3 && next.pending?.kind === 'priority' && next.stack.length > 0; i += 1) {
    next = apply(next, next.pending.seat, { kind: 'pass' });
  }
  return next;
};

describe('assign control: a different opponent for each permanent', () => {
  test('with one opponent the creature goes to them without a question, goaded for good', () => {
    const g = twoSeats();
    g.act(0).cast(SPELL, { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    const bears = g.id({ name: BEARS, zone: 'battlefield' });
    expect(goadersOf(g.state, bears)).toEqual([0]);
    // The cards revealed that were not creatures stay in the library (shuffled).
    expect(g.state.seats[0]?.library.length).toBe(3);
    g.expect.invariants();
  });

  test('with two opponents the controller is asked once, and the last permanent goes to the last opponent', () => {
    let state = pass(threeSeats());
    const d = state.pending;
    if (d?.kind !== 'chooseOption' || d.purpose !== 'assignOpponent') {
      throw new Error(`expected the opponent question, got ${d?.kind}`);
    }
    expect(d.seat).toBe(0);
    expect(d.options).toEqual(['seat:1', 'seat:2']);
    // The first permanent goes to seat 2; the second is not asked about: seat 1 is the one left.
    state = apply(state, 0, { kind: 'chooseOption', option: 'seat:2' });
    expect(state.pending?.kind).not.toBe('chooseOption');
    const controlOf = (name: string) => {
      const view = getView(state, 0).battlefield.find((p) => p.name === name);
      return view?.controller;
    };
    // The Bears were revealed first, so the choice was about them.
    expect(controlOf(BEARS)).toBe(2);
    expect(controlOf(SPIDER)).toBe(1);
  });

  test('an answer that is not an option left is refused', () => {
    const state = pass(threeSeats());
    const out = applyAction(state, 0, { kind: 'chooseOption', option: 'seat:0' });
    expect(out.ok).toBe(false);
  });
});
