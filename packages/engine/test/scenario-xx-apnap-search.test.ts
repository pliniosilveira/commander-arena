// "Each player searches their library ..." with three seats (CR 701.23i, 101.4): the players decide which card to find in APNAP order (the active player, then the others in turn order),
// each knowing that the earlier ones decided but not which card they found (101.4a, a card of a hidden zone), and only then do the cards go where the text says and every library is
// shuffled. A "may" search asks the players first, in the same order. Cards are SYNTHETIC.
import { describe, expect, test } from 'vitest';
import type { Effect } from '../src/ast/types';
import { singleFace } from '../src/cards/fixtures/helpers';
import { getView } from '../src/index';
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

const EACH_TUTOR = sorcery(
  'SYNTHETIC Each Tutors',
  'Each player searches their library for a card, puts it into their hand, then shuffles.',
  {
    kind: 'search',
    player: { kind: 'eachPlayer' },
    filter: {},
    max: 1,
    destinations: [{ zone: 'hand', count: 1 }],
    reveal: false,
    shuffle: true,
  },
);
const EACH_MAY_FETCH = sorcery(
  'SYNTHETIC Each May Fetch',
  'Each player may search their library for a land card, put it onto the battlefield, then shuffle.',
  {
    kind: 'search',
    player: { kind: 'eachPlayer' },
    filter: { types: ['land'] },
    max: 1,
    destinations: [{ zone: 'battlefield', count: 1 }],
    reveal: false,
    shuffle: true,
    optional: true,
  },
);
const BEARS = 'Grizzly Bears';
const ANGEL = 'Serra Angel'; // only in the library of seat 0
const SPIDER = 'Giant Spider';
const FILLER = Array.from({ length: 8 }, () => 'Plains');

/** Three seats; `active` casts `spell`. Each library holds three cards: Bears (labelled `<n>a`), a second card (`<n>b`: the Angel for seat 0, a Spider for the others) and an Island (`<n>i`), then Plains. */
function game(spell: string, active: 0 | 1 | 2 = 0): ScenarioGame {
  const b = scenario({ seats: 3 }).define(EACH_TUTOR).define(EACH_MAY_FETCH);
  for (const seat of [0, 1, 2]) {
    const s = b.seat(seat);
    if (seat === active) s.hand(spell).pool('UUUU');
    s.library(BEARS, { label: `${seat}a` });
    s.library(seat === 0 ? ANGEL : SPIDER, { label: `${seat}b` });
    s.library('Island', { label: `${seat}i` });
    s.library(...FILLER);
  }
  return b.at('precombatMain', { active, turn: 3 }).build();
}

const zone = (g: ScenarioGame, label: string) => g.state.objects[g.id(label)]?.zone;
const searching = (g: ScenarioGame) => {
  const d = g.state.pending;
  if (d?.kind !== 'chooseCards' || d.purpose !== 'search') {
    throw new Error(`expected a search choice, got ${d?.kind}`);
  }
  return d.seat;
};

describe('"each player searches their library": all decide, then the cards go and the libraries are shuffled', () => {
  test('the players choose in turn order from the active player, and nothing moves until the last has chosen', () => {
    const g = game('SYNTHETIC Each Tutors');
    g.act(0).cast('SYNTHETIC Each Tutors', { pay: true });
    g.passAll();
    expect(searching(g)).toBe(0);
    g.act(0).chooseCards('0a');
    expect(searching(g)).toBe(1);
    // Seat 0 decided, and its card is still in its library: the cards move after the last decision (CR 701.23i).
    expect(zone(g, '0a')).toBe('library');
    g.act(1).chooseCards('1b');
    expect(searching(g)).toBe(2);
    expect(zone(g, '0a')).toBe('library');
    expect(zone(g, '1b')).toBe('library');
    g.act(2).chooseCards('2i');
    expect(['0a', '1b', '2i'].map((l) => zone(g, l))).toEqual(['hand', 'hand', 'hand']);
    expect(['0b', '1a', '2a'].map((l) => zone(g, l))).toEqual(['library', 'library', 'library']);
    g.expect.invariants();
  });

  test('the order starts with the active player, whoever that is', () => {
    const g = game('SYNTHETIC Each Tutors', 1);
    g.act(1).cast('SYNTHETIC Each Tutors', { pay: true });
    g.passAll();
    expect(searching(g)).toBe(1);
    g.act(1).chooseCards('1a');
    expect(searching(g)).toBe(2);
    g.act(2).chooseCards('2a');
    expect(searching(g)).toBe(0);
  });

  test('the card a player found stays hidden from the players who decide after (CR 101.4a)', () => {
    const g = game('SYNTHETIC Each Tutors');
    g.act(0).cast('SYNTHETIC Each Tutors', { pay: true });
    g.passAll();
    g.act(0).chooseCards('0b');
    // Seat 1 is deciding now: nothing shows it that seat 0 found the Angel.
    expect(JSON.stringify(getView(g.state, 1))).not.toContain(ANGEL);
    g.act(1).chooseCards('1a');
    expect(JSON.stringify(getView(g.state, 2))).not.toContain(ANGEL);
  });
});

describe('"each player may search": the players are asked first, in turn order', () => {
  test('a player who declines is skipped, and the cards of the others go together at the end', () => {
    const g = game('SYNTHETIC Each May Fetch');
    g.act(0).cast('SYNTHETIC Each May Fetch', { pay: true });
    g.passAll();
    g.act(0).accept();
    expect(searching(g)).toBe(0);
    g.act(0).chooseCards('0i');
    // Seat 1 is asked whether to search; seat 0's land is still in its library.
    g.expect.pending('confirmOptional', 1);
    expect(zone(g, '0i')).toBe('library');
    g.act(1).decline();
    g.expect.pending('confirmOptional', 2);
    g.act(2).accept();
    expect(searching(g)).toBe(2);
    expect(zone(g, '0i')).toBe('library');
    g.act(2).chooseCards('2i');
    expect(zone(g, '0i')).toBe('battlefield');
    expect(zone(g, '2i')).toBe('battlefield');
    expect(zone(g, '1i')).toBe('library');
    g.expect.invariants();
  });
  test('a player with nothing to find searches anyway: the next player still decides', () => {
    const b = scenario({ seats: 3 }).define(EACH_MAY_FETCH);
    b.seat(0).hand('SYNTHETIC Each May Fetch').pool('UUUU');
    b.seat(0)
      .library('Island', { label: '0i' })
      .library(...FILLER);
    // Seat 1 has no land card in its library.
    b.seat(1).library(...Array.from({ length: 6 }, () => BEARS));
    b.seat(2)
      .library('Island', { label: '2i' })
      .library(...FILLER);
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    g.act(0).cast('SYNTHETIC Each May Fetch', { pay: true });
    g.passAll();
    g.act(0).accept();
    g.act(0).chooseCards('0i');
    g.act(1).accept();
    // Seat 1 found nothing to choose, so seat 2 is asked next and the lands go together at the end.
    g.expect.pending('confirmOptional', 2);
    expect(zone(g, '0i')).toBe('library');
    g.act(2).accept();
    g.act(2).chooseCards('2i');
    expect(zone(g, '0i')).toBe('battlefield');
    expect(zone(g, '2i')).toBe('battlefield');
  });
});
