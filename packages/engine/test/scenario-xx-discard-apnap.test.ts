// "Each player discards ..." with three seats (CR 101.4, 701.9): every player chooses in APNAP order (the active player, then the others in turn order), each knowing the earlier
// choices except that a card chosen from a hand stays hidden (101.4a, 101.4b), and only then are all the chosen cards discarded together. Cards are SYNTHETIC.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { type GameState, getView } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const discardSpell = (name: string, text: string, fields: Record<string, unknown>) =>
  singleFace({
    name,
    manaCost: ['1'],
    types: ['sorcery'],
    colors: [],
    colorIdentity: [],
    oracleText: text,
    spell: {
      effect: { kind: 'discard', player: { kind: 'eachPlayer' }, ...fields },
    } as never,
  });

const EACH_ONE = discardSpell('SYNTHETIC Each Discards One', 'Each player discards a card.', {
  count: 1,
});
const EACH_HAND = discardSpell('SYNTHETIC Each Discards Hand', 'Each player discards their hand.', {
  hand: true,
  count: 0,
});
const EACH_RANDOM = discardSpell(
  'SYNTHETIC Each Discards Random',
  'Each player discards a card at random.',
  { count: 1, random: true },
);
const FILLER = Array.from({ length: 10 }, () => 'Island');

/** Three seats; `active` casts `spell`. Seat 0 holds Bears (a) and Serra Angel (b), seat 1 Spider (c) and Elves (d), seat 2 Bolt (e) and Sol Ring (f). */
function game(spell: string, active: 0 | 1 | 2 = 0): ScenarioGame {
  const hands: readonly (readonly [string, string, string, string])[] = [
    [BEARS, 'a', ANGEL, 'b'],
    [SPIDER, 'c', ELVES, 'd'],
    [BOLT, 'e', RING, 'f'],
  ];
  const b = scenario({ seats: 3 }).define(EACH_ONE).define(EACH_HAND).define(EACH_RANDOM);
  hands.forEach((h, seat) => {
    const s = b.seat(seat);
    if (seat === active) s.hand(spell).pool('UUUU');
    s.hand(h[0], { label: h[1] });
    s.hand(h[2], { label: h[3] });
    s.library(...FILLER);
  });
  return b.at('precombatMain', { active, turn: 3 }).build();
}

const BEARS = 'Grizzly Bears';
const ANGEL = 'Serra Angel';
const SPIDER = 'Giant Spider';
const ELVES = 'Llanowar Elves';
const BOLT = 'Lightning Bolt';
const RING = 'Sol Ring';

const zone = (g: ScenarioGame, label: string) => g.state.objects[g.id(label)]?.zone;

const discards = (g: ScenarioGame) =>
  g.eventsSince(0).flatMap((e) => (e.kind === 'discarded' ? [e.seat] : []));

function pendingDiscard(state: GameState): { seat: number } {
  const d = state.pending;
  if (d?.kind !== 'chooseCards' || d.purpose !== 'discard') {
    throw new Error(`expected a discard choice, got ${d?.kind}`);
  }
  return d;
}

describe('"each player discards a card": every player chooses, then all discard together', () => {
  test('the choices are asked in turn order from the active player, and nothing is discarded until the last', () => {
    const g = game(EACH_ONE.faces[0]?.name ?? '');
    g.act(0).cast('SYNTHETIC Each Discards One', { pay: true });
    g.passAll();
    expect(pendingDiscard(g.state).seat).toBe(0);
    g.act(0).chooseCards('a');
    // Seat 0 has chosen, and its card is still in its hand: the discard happens once everybody has chosen (CR 101.4).
    expect(pendingDiscard(g.state).seat).toBe(1);
    expect(zone(g, 'a')).toBe('hand');
    g.act(1).chooseCards('d');
    expect(pendingDiscard(g.state).seat).toBe(2);
    expect(zone(g, 'a')).toBe('hand');
    expect(zone(g, 'd')).toBe('hand');
    g.act(2).chooseCards('e');
    expect(['a', 'd', 'e'].map((l) => zone(g, l))).toEqual(['graveyard', 'graveyard', 'graveyard']);
    expect(['b', 'c', 'f'].map((l) => zone(g, l))).toEqual(['hand', 'hand', 'hand']);
    expect(discards(g)).toEqual([0, 1, 2]);
    g.expect.invariants();
  });

  test('the order starts with the active player, whoever that is (CR 101.4)', () => {
    const g = game('SYNTHETIC Each Discards One', 1);
    g.act(1).cast('SYNTHETIC Each Discards One', { pay: true });
    g.passAll();
    expect(pendingDiscard(g.state).seat).toBe(1);
    g.act(1).chooseCards('c');
    expect(pendingDiscard(g.state).seat).toBe(2);
    g.act(2).chooseCards('e');
    expect(pendingDiscard(g.state).seat).toBe(0);
    g.act(0).chooseCards('a');
    expect(discards(g)).toEqual([1, 2, 0]);
  });

  test('a card chosen from a hand stays hidden from the players who choose after (CR 101.4a)', () => {
    const g = game('SYNTHETIC Each Discards One');
    g.act(0).cast('SYNTHETIC Each Discards One', { pay: true });
    g.passAll();
    g.act(0).chooseCards('b');
    // Seat 1 is choosing now: nothing shows it that seat 0 chose Serra Angel.
    expect(JSON.stringify(getView(g.state, 1))).not.toContain(ANGEL);
    g.act(1).chooseCards('d');
    expect(JSON.stringify(getView(g.state, 2))).not.toContain(ANGEL);
    expect(JSON.stringify(getView(g.state, 2))).not.toContain(ELVES);
  });
});

describe('the other each-player discards follow the same order', () => {
  test('"discards their hand" asks nothing: all the hands go at once', () => {
    const g = game('SYNTHETIC Each Discards Hand');
    g.act(0).cast('SYNTHETIC Each Discards Hand', { pay: true });
    g.passAll();
    expect(g.state.pending?.kind).not.toBe('chooseCards');
    for (const label of ['a', 'b', 'c', 'd', 'e', 'f']) expect(zone(g, label)).toBe('graveyard');
    expect(discards(g)).toEqual([0, 0, 1, 1, 2, 2]);
  });

  test('"at random" draws a different card for each player and discards them together', () => {
    const g = game('SYNTHETIC Each Discards Random');
    g.act(0).cast('SYNTHETIC Each Discards Random', { pay: true });
    g.passAll();
    expect(g.state.pending?.kind).not.toBe('chooseCards');
    expect(discards(g)).toEqual([0, 1, 2]);
    // One card of each hand went, and the other stayed.
    const gone = ['a', 'b', 'c', 'd', 'e', 'f'].filter((l) => zone(g, l) === 'graveyard');
    expect(gone).toHaveLength(3);
    g.expect.invariants();
  });
  test('"at random": the generator moves on between players, so equal hands do not lose the same position', () => {
    const NAMES = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', BEARS, SPIDER, ANGEL];
    const b = scenario({ seats: 3 }).define(EACH_RANDOM);
    for (const seat of [0, 1, 2]) {
      const s = b.seat(seat);
      if (seat === 0) s.hand('SYNTHETIC Each Discards Random').pool('UUUU');
      s.hand(...NAMES).library(...FILLER);
    }
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    g.act(0).cast('SYNTHETIC Each Discards Random', { pay: true });
    g.passAll();
    const lost = [0, 1, 2].map((seat) =>
      NAMES.filter((n) => g.find({ name: n, zone: 'graveyard', seat }).length > 0),
    );
    expect(lost.map((l) => l.length)).toEqual([1, 1, 1]);
    // With the generator left where it was, every player would lose the card in the same position.
    expect(new Set(lost.map((l) => l[0])).size).toBeGreaterThan(1);
  });
});
