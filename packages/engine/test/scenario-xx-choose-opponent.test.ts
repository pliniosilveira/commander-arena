// "An opponent ..." effects with three seats (CR 608.2d, 702.144a, 700.3, 801.5b): when an effect says an opponent separates, chooses or copies and more than one opponent is left, the
// controller of the effect chooses which one (a `chooseOption` decision of purpose `chooseOpponent`, options `seat:<n>`, asked of the controller). With one opponent nothing is asked.
// Cards are SYNTHETIC (src/cards/fixtures).
import { describe, expect, test } from 'vitest';
import { applyAction, type GameState } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const READING = 'SYNTHETIC Pile Reading'; // the controller reveals five, an opponent separates, the controller chooses
const OFFERING = 'SYNTHETIC Pile Offering'; // the controller separates four, an opponent chooses
const PERFORMANCE = 'SYNTHETIC Pile Performance'; // two exiled piles, an opponent chooses one
const ORC = 'SYNTHETIC Chaos Orc'; // upkeep: each player exiles until a nonland card, an opponent chooses one
const FILLER = ['Island', 'Island', 'Island', 'Island', 'Island', 'Island'] as const;
const TOP = ['Grizzly Bears', 'Giant Spider', 'Serra Angel', 'Lightning Bolt', 'Sol Ring'];

/** The question "which opponent" the controller (seat 0) is asked, with its options. */
function opponentQuestion(g: ScenarioGame | GameState) {
  const state = 'state' in g ? g.state : g;
  const d = state.pending;
  if (d?.kind !== 'chooseOption' || d.purpose !== 'chooseOpponent') {
    throw new Error(`expected the opponent question, got ${d?.kind}`);
  }
  return d;
}

const answer = (state: GameState, seat: number, option: string): GameState => {
  const out = applyAction(state, seat, { kind: 'chooseOption', option });
  if (!out.ok) throw new Error(out.error);
  return out.state;
};

function threeSeats(hand: string, library: readonly string[], pool = 'UUUUUU') {
  const b = scenario({ seats: 3 }).seat(0).hand(hand).pool(pool);
  for (const name of library) b.library(name);
  return b
    .seat(1)
    .library(...FILLER)
    .seat(2)
    .library(...FILLER)
    .at('precombatMain', { active: 0, turn: 1 })
    .build();
}

describe('the controller chooses the opponent who separates the piles (Fact or Fiction)', () => {
  test('with two opponents the controller is asked, and the one chosen separates', () => {
    const g = threeSeats(READING, [...TOP, 'Plains', 'Plains', 'Plains']);
    g.act(0).cast(READING, { pay: true });
    g.passAll();
    const q = opponentQuestion(g);
    expect(q.seat).toBe(0);
    expect(q.options).toEqual(['seat:1', 'seat:2']);
    const state = answer(g.state, 0, 'seat:2');
    expect(state.pending?.kind).toBe('chooseCards');
    if (state.pending?.kind === 'chooseCards') {
      expect(state.pending.seat).toBe(2);
      expect(state.pending.purpose).toBe('separate');
    }
  });

  test('an answer that is not an option is refused, and the controller is not one', () => {
    const g = threeSeats(READING, [...TOP, 'Plains', 'Plains', 'Plains']);
    g.act(0).cast(READING, { pay: true });
    g.passAll();
    for (const option of ['seat:0', 'seat:3', 'nope']) {
      expect(applyAction(g.state, 0, { kind: 'chooseOption', option }).ok).toBe(false);
    }
  });
});

describe('the controller chooses the opponent who picks a pile', () => {
  test('the controller separates four cards, the opponent chosen picks a pile', () => {
    const g = threeSeats(OFFERING, [...TOP, 'Plains', 'Plains', 'Plains']);
    g.act(0).cast(OFFERING, { pay: true });
    g.passAll();
    expect(opponentQuestion(g).options).toEqual(['seat:1', 'seat:2']);
    let state = answer(g.state, 0, 'seat:2');
    // The controller separates first; then seat 2 is the one asked which pile.
    expect(state.pending?.kind).toBe('chooseCards');
    if (state.pending?.kind === 'chooseCards') {
      expect(state.pending.seat).toBe(0);
      const first = state.pending.legal.slice(0, 2);
      const out = applyAction(state, 0, { kind: 'chooseCards', objects: first });
      if (!out.ok) throw new Error(out.error);
      state = out.state;
    }
    expect(state.pending?.kind).toBe('chooseOption');
    if (state.pending?.kind === 'chooseOption') {
      expect(state.pending.purpose).toBe('pile');
      expect(state.pending.seat).toBe(2);
    }
  });
});

describe('the controller chooses the opponent for two exiled piles', () => {
  test('the opponent chosen picks a pile, in the later stage too', () => {
    const g = threeSeats(PERFORMANCE, [
      'Grizzly Bears',
      'Giant Spider',
      'Island',
      'Island',
      'Island',
      'Island',
      'Island',
      'Island',
      'Island',
      'Island',
    ]);
    g.act(0).cast(PERFORMANCE, { pay: true });
    g.passAll();
    expect(opponentQuestion(g).options).toEqual(['seat:1', 'seat:2']);
    const state = answer(g.state, 0, 'seat:2');
    expect(state.pending?.kind).toBe('chooseOption');
    if (state.pending?.kind === 'chooseOption') {
      expect(state.pending.purpose).toBe('pile');
      expect(state.pending.seat).toBe(2);
    }
  });
});

describe('the controller chooses the opponent who chooses a card (Chaos Orc)', () => {
  test('at the upkeep, the opponent chosen picks the nonland card', () => {
    const b = scenario({ seats: 3 })
      .seat(0)
      .battlefield(ORC)
      .library('Island', 'Grizzly Bears', ...FILLER)
      .seat(1)
      .library('Island', 'Giant Spider', ...FILLER)
      .seat(2)
      .library('Island', 'Serra Angel', ...FILLER)
      .at('postcombatMain', { active: 2, turn: 3 });
    const g = b.build();
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    expect(opponentQuestion(g).options).toEqual(['seat:1', 'seat:2']);
    const state = answer(g.state, 0, 'seat:2');
    const picked = chooseCardsDecisionOf(state);
    expect(picked.seat).toBe(2);
  });
});

function chooseCardsDecisionOf(state: GameState) {
  const d = state.pending;
  if (d?.kind !== 'chooseCards') throw new Error(`expected chooseCards, got ${d?.kind}`);
  return d;
}

describe('the controller chooses the opponent who copies the spell (Demonstrate, CR 702.144a)', () => {
  test('after the controller’s own copy, the controller is asked which opponent copies, and that one chooses new targets', () => {
    const g = scenario({ seats: 3 })
      .seat(0)
      .hand('SYNTHETIC Demo Bolt')
      .battlefield('Grizzly Bears')
      .library(...FILLER)
      .pool('RRRRRRRR')
      .seat(1)
      .battlefield('Giant Spider')
      .library(...FILLER)
      .seat(2)
      .battlefield('Serra Angel')
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast('SYNTHETIC Demo Bolt', { pay: true, targets: [{ player: 1 }] });
    g.passAll();
    g.act(0).accept();
    g.act(0).chooseTargets({ player: 1 });
    expect(opponentQuestion(g).options).toEqual(['seat:1', 'seat:2']);
    const state = answer(g.state, 0, 'seat:2');
    expect(state.pending?.kind).toBe('targets');
    expect(state.pending?.kind === 'targets' ? state.pending.seat : -1).toBe(2);
    const theirs = Object.values(state.objects).filter(
      (o) => o.copyOf !== undefined && o.controller === 2,
    );
    expect(theirs).toHaveLength(1);
  });
});

describe('the controller chooses the opponent who picks the exiled card (Coin of Fate)', () => {
  test('after the cost, the opponent chosen picks which card goes where', () => {
    const g = scenario({ seats: 3 })
      .seat(0)
      .battlefield('SYNTHETIC Split Coin', 'Plains', 'Plains', 'Plains')
      .graveyard('Grizzly Bears', 'Giant Spider')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .seat(2)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).activate('SYNTHETIC Split Coin', { pay: true });
    g.passAll();
    expect(opponentQuestion(g).options).toEqual(['seat:1', 'seat:2']);
    const state = answer(g.state, 0, 'seat:2');
    expect(state.pending?.kind).toBe('chooseCards');
    expect(state.pending?.kind === 'chooseCards' ? state.pending.seat : -1).toBe(2);
  });
});

describe('one opponent left: nothing is asked', () => {
  test('a player who has lost is not offered, and the one left separates unasked', () => {
    const g = threeSeats(READING, [...TOP, 'Plains', 'Plains', 'Plains']);
    g.act(0).cast(READING, { pay: true });
    const lost = {
      ...g.state,
      seats: g.state.seats.map((s) => (s.id === 1 ? { ...s, hasLost: true } : s)),
    };
    let state: GameState = lost;
    for (let i = 0; i < 4 && state.pending?.kind === 'priority' && state.stack.length > 0; i += 1) {
      const out = applyAction(state, state.pending.seat, { kind: 'pass' });
      if (!out.ok) throw new Error(out.error);
      state = out.state;
    }
    expect(state.pending?.kind).toBe('chooseCards');
    expect(state.pending?.kind === 'chooseCards' ? state.pending.seat : -1).toBe(2);
  });
});
