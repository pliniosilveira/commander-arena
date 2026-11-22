// "Each player may ..." and "each player exiles a card from their graveyard" with three seats (CR 101.4, 608.2d, 701.13): the players answer or choose in APNAP order (the active
// player, then the others in turn order), each knowing the earlier answers, and only then does anything happen, for all of them together. Cards are SYNTHETIC.
import { describe, expect, test } from 'vitest';
import type { Effect } from '../src/ast/types';
import { singleFace } from '../src/cards/fixtures/helpers';
import { type ScenarioGame, scenario } from '../src/testing/index';

const sorcery = (name: string, text: string, effect: Effect) =>
  singleFace({
    name,
    manaCost: ['1'],
    types: ['sorcery'],
    colors: [],
    colorIdentity: [],
    oracleText: text,
    spell: { effect },
  });

const MAY_DRAW = sorcery('SYNTHETIC Each May Draw', 'Each player may draw a card.', {
  kind: 'playersMay',
  players: { kind: 'eachPlayer' },
  runsAs: 'chooser',
  effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
});
const MAY_OR_PAY = sorcery(
  'SYNTHETIC Each May Draw Or Lose',
  "Each player may draw a card. Each player who doesn't loses 2 life.",
  {
    kind: 'playersMay',
    players: { kind: 'eachPlayer' },
    runsAs: 'chooser',
    effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
    otherwise: { kind: 'loseLife', player: { kind: 'declinedPlayer' }, amount: 2 },
  },
);
const EXILE_EACH = sorcery(
  'SYNTHETIC Each Exiles From Graveyard',
  'Each player exiles a card from their graveyard.',
  { kind: 'exileOwnGraveyardCard', players: { kind: 'eachPlayer' } },
);
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const FILLER = Array.from({ length: 10 }, () => 'Island');

/** Three seats with a library each; `active` casts `spell`. `graveyards` gives each seat the cards of its graveyard as [name, label]. */
function game(
  spell: string,
  active: 0 | 1 | 2 = 0,
  graveyards: readonly (readonly (readonly [string, string])[])[] = [[], [], []],
): ScenarioGame {
  const b = scenario({ seats: 3 }).define(MAY_DRAW).define(MAY_OR_PAY).define(EXILE_EACH);
  for (const seat of [0, 1, 2]) {
    const s = b.seat(seat);
    if (seat === active) s.hand(spell).pool('UUUU');
    for (const [name, label] of graveyards[seat] ?? []) s.graveyard(name, { label });
    s.library(...FILLER);
  }
  return b.at('precombatMain', { active, turn: 3 }).build();
}

const handSize = (g: ScenarioGame, seat: number) => g.state.seats[seat]?.hand.length ?? -1;
const askedSeat = (g: ScenarioGame) => {
  const d = g.state.pending;
  if (d?.kind !== 'confirmOptional') throw new Error(`expected confirmOptional, got ${d?.kind}`);
  return d.seat;
};
const zone = (g: ScenarioGame, label: string) => g.state.objects[g.id(label)]?.zone;

describe('"each player may ...": all answer, then the accepted effects happen', () => {
  test('the players are asked in turn order from the active player, and nothing happens until the last has answered', () => {
    const g = game('SYNTHETIC Each May Draw');
    g.act(0).cast('SYNTHETIC Each May Draw', { pay: true });
    g.passAll();
    const before = [0, 1, 2].map((s) => handSize(g, s));
    expect(askedSeat(g)).toBe(0);
    g.act(0).accept();
    // Seat 0 said yes, and has not drawn yet: the effects follow the last answer (CR 101.4).
    expect(askedSeat(g)).toBe(1);
    expect(handSize(g, 0)).toBe(before[0]);
    g.act(1).decline();
    expect(askedSeat(g)).toBe(2);
    expect(handSize(g, 0)).toBe(before[0]);
    g.act(2).accept();
    expect([0, 1, 2].map((s) => handSize(g, s))).toEqual([
      (before[0] ?? 0) + 1,
      before[1],
      (before[2] ?? 0) + 1,
    ]);
    g.expect.invariants();
  });

  test('the order starts with the active player, whoever that is', () => {
    const g = game('SYNTHETIC Each May Draw', 1);
    g.act(1).cast('SYNTHETIC Each May Draw', { pay: true });
    g.passAll();
    expect(askedSeat(g)).toBe(1);
    g.act(1).decline();
    expect(askedSeat(g)).toBe(2);
    g.act(2).decline();
    expect(askedSeat(g)).toBe(0);
  });

  test('"if they don\'t": the effect for a player who declined waits for the last answer too', () => {
    const g = game('SYNTHETIC Each May Draw Or Lose');
    g.act(0).cast('SYNTHETIC Each May Draw Or Lose', { pay: true });
    g.passAll();
    g.act(0).decline();
    // Seat 0 declined and has not lost the life yet.
    g.expect.life(0, 40);
    g.act(1).accept();
    g.expect.life(0, 40);
    g.act(2).decline();
    g.expect.life(0, 38);
    g.expect.life(1, 40);
    g.expect.life(2, 38);
  });
});

describe('"each player exiles a card from their graveyard": all choose, then the cards go together', () => {
  const graveyards = [
    [
      [BEARS, 'a'],
      [SPIDER, 'b'],
    ],
    [
      [BEARS, 'c'],
      [SPIDER, 'd'],
    ],
    [
      [BEARS, 'e'],
      [SPIDER, 'f'],
    ],
  ] as const;

  test('the choices are asked in turn order, and nothing is exiled until the last has chosen', () => {
    const g = game('SYNTHETIC Each Exiles From Graveyard', 0, graveyards);
    g.act(0).cast('SYNTHETIC Each Exiles From Graveyard', { pay: true });
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('a');
    g.expect.pending('chooseCards', 1);
    expect(zone(g, 'a')).toBe('graveyard');
    g.act(1).chooseCards('d');
    g.expect.pending('chooseCards', 2);
    expect(zone(g, 'a')).toBe('graveyard');
    expect(zone(g, 'd')).toBe('graveyard');
    g.act(2).chooseCards('e');
    for (const label of ['a', 'd', 'e']) expect(zone(g, label)).toBe('exile');
    for (const label of ['b', 'c', 'f']) expect(zone(g, label)).toBe('graveyard');
    g.expect.invariants();
  });

  test('a player with an empty graveyard is skipped and the others still choose', () => {
    const g = game('SYNTHETIC Each Exiles From Graveyard', 0, [graveyards[0], [], graveyards[2]]);
    g.act(0).cast('SYNTHETIC Each Exiles From Graveyard', { pay: true });
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('b');
    // Seat 1 has no card to exile, so seat 2 is next.
    g.expect.pending('chooseCards', 2);
    expect(zone(g, 'b')).toBe('graveyard');
    g.act(2).chooseCards('f');
    expect(zone(g, 'b')).toBe('exile');
    expect(zone(g, 'f')).toBe('exile');
  });
});
