// The Elven Council deck (issue 17), the council cards: the REAL Oracle text of Plea for Power, Sail into the West, Travel Through Caradhras and Galadriel, Elven-Queen (the corpus's
// golden.jsonl, taken from the issue) goes through the grammar as a card with no override, is defined in an engine scenario and is played through applyAction with three seats, so the nodes the
// parser writes for the real text are what the engine runs. Each is also the same as its SYNTHETIC sibling of the engine fixtures (`synthetic-council.ts`), which the engine tests play.
// Pins: CR 701.38a (each player votes, starting with the controller, in turn order), 500.7 (an extra turn), 101.4 (each player's choices in APNAP order), 701.23 and 701.24 (search, shuffle),
// 608.2n (a spell exiled by its own instruction), 701.54 (the Ring), 603.4 (the intervening "if"), 400.7 (a new object).
import { readFileSync } from 'node:fs';
import { type CardDefinition, syntheticCard, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

/** The real card of the golden corpus, imported through the grammar only; it must read as supported. */
function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const PLEA = real('Plea for Power');
const SAIL = real('Sail into the West');
const TRAVEL = real('Travel Through Caradhras');
const GALADRIEL = real('Galadriel, Elven-Queen');
/** Each seat votes for the option at its index, in turn order. */
function vote(
  g: ReturnType<typeof scenario>['build'] extends () => infer G ? G : never,
  votes: readonly string[],
): void {
  for (const [seat, option] of votes.entries()) g.act(seat).chooseOption(option);
}

const FILLER = ['Island', 'Mountain', ...Array.from({ length: 10 }, () => 'Plains')];

describe('every card is valid and has the nodes of its SYNTHETIC sibling', () => {
  test('Plea for Power', () => {
    expect(validateCard(PLEA)).toEqual([]);
    expect(PLEA.faces[0]?.spell).toEqual(
      syntheticCard('SYNTHETIC Council of Time').faces[0]?.spell,
    );
  });
  test('Sail into the West', () => {
    expect(validateCard(SAIL)).toEqual([]);
    expect(SAIL.faces[0]?.spell).toEqual(
      syntheticCard('SYNTHETIC Council of Tides').faces[0]?.spell,
    );
  });
  test('Travel Through Caradhras', () => {
    expect(validateCard(TRAVEL)).toEqual([]);
    expect(TRAVEL.faces[0]?.spell).toEqual(
      syntheticCard('SYNTHETIC Council of Roads').faces[0]?.spell,
    );
  });
  test('Galadriel, Elven-Queen', () => {
    expect(validateCard(GALADRIEL)).toEqual([]);
    expect(GALADRIEL.faces[0]?.abilities).toEqual(
      syntheticCard('SYNTHETIC Council Queen').faces[0]?.abilities,
    );
  });
});

/** Three seats: seat 0 has `hand`, `lands` and `own`, seats 1 and 2 have a library; at the main phase of seat 0. */
const three = (
  card: CardDefinition,
  hand: readonly string[],
  lands: readonly string[],
  own: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario> = (b) => b,
) =>
  own(
    scenario({ seats: 3 })
      .define(card)
      .seat(0)
      .life(20)
      .hand(...hand)
      .battlefield(...lands)
      .library(...FILLER),
  )
    .seat(1)
    .life(20)
    .library(...FILLER)
    .seat(2)
    .life(20)
    .library(...FILLER)
    .at('precombatMain', { active: 0 })
    .build();

describe('Plea for Power', () => {
  const play = (votes: readonly string[]) => {
    const g = three(PLEA, ['Plea for Power'], ['Island', 'Island', 'Island', 'Island']);
    g.act(0).cast('Plea for Power', { pay: true });
    g.passAll();
    vote(g, votes);
    return g;
  };

  test('time gets more votes (two of three): an extra turn, no cards', () => {
    const g = play(['time', 'knowledge', 'time']);
    expect(g.state.extraTurns).toEqual([0]);
    g.expect.handSize(0, 0);
  });

  test('knowledge gets more votes: three cards, no extra turn', () => {
    const g = play(['knowledge', 'knowledge', 'time']);
    expect(g.state.extraTurns ?? []).toEqual([]);
    g.expect.handSize(0, 3);
  });
});

describe('Sail into the West', () => {
  test('return gets more votes: each player returns up to two cards of their own graveyard and the spell is exiled', () => {
    const g = three(SAIL, ['Sail into the West'], ['Island', 'Forest', 'Island', 'Forest'], (b) =>
      b.graveyard('Grizzly Bears', 'Giant Spider', 'Serra Angel'),
    );
    g.act(0).cast('Sail into the West', { pay: true });
    g.passAll();
    vote(g, ['return', 'return', 'embark']);
    g.act(0).chooseCards('Grizzly Bears', 'Serra Angel');
    g.expect.zone('Grizzly Bears', 'hand', { seat: 0 });
    g.expect.zone('Serra Angel', 'hand', { seat: 0 });
    g.expect.zone('Giant Spider', 'graveyard', { seat: 0 });
    g.expect.zone('Sail into the West', 'exile', { seat: 0 });
    g.expect.invariants();
  });

  test('the vote is tied (one each of two, a third voting too would not tie): the embark half, each player decides for themselves', () => {
    const g = three(
      SAIL,
      ['Sail into the West', 'Mountain'],
      ['Island', 'Forest', 'Island', 'Forest'],
    );
    g.act(0).cast('Sail into the West', { pay: true });
    g.passAll();
    vote(g, ['embark', 'return', 'embark']);
    g.act(0).accept();
    g.act(1).decline();
    g.act(2).decline();
    g.expect.handSize(0, 7);
    g.expect.zone('Mountain', 'graveyard', { seat: 0 });
    g.expect.handSize(1, 0);
    g.expect.zone('Sail into the West', 'graveyard', { seat: 0 });
  });
});

describe('Travel Through Caradhras', () => {
  test('one vote for each place: a tapped basic land and a shuffle, a card returned, and the spell exiled', () => {
    const g = three(
      TRAVEL,
      ['Travel Through Caradhras'],
      ['Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest'],
      (b) => b.graveyard('Grizzly Bears', 'Giant Spider'),
    );
    g.act(0).cast('Travel Through Caradhras', { pay: true });
    g.passAll();
    const mark = g.mark();
    vote(g, ['Redhorn Pass', 'Mines of Moria', 'Redhorn Pass']);
    // Two Redhorn Pass votes: two searches, then one shuffle; one Mines of Moria vote: one card back.
    g.act(0).chooseCards('Island');
    g.act(0).chooseCards('Mountain');
    expect(g.eventsSince(mark).filter((e) => e.kind === 'libraryShuffled')).toHaveLength(1);
    g.act(0).chooseCards('Giant Spider');
    g.expect.zone('Giant Spider', 'hand', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.expect.tapped({ name: 'Island', zone: 'battlefield', seat: 0 }, true);
    g.expect.tapped({ name: 'Mountain', zone: 'battlefield', seat: 0 }, true);
    g.expect.zone('Travel Through Caradhras', 'exile', { seat: 0 });
    g.expect.invariants();
  });
});

describe('Galadriel, Elven-Queen', () => {
  const ELF = 'Llanowar Elves';
  const board = () =>
    three(GALADRIEL, [ELF], ['Forest', 'Forest', 'Forest'], (b) =>
      b.battlefield('Galadriel, Elven-Queen'),
    );

  test('another Elf entered this turn: at the beginning of combat the players vote and dominion gives the Ring-bearer a counter', () => {
    const g = board();
    g.act(0).cast(ELF, { pay: true });
    g.passAll();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    vote(g, ['dominion', 'dominion', 'guidance']);
    g.act(0).choosePermanents(ELF);
    g.expect.ringBearer(0, ELF);
    g.expect.counters(ELF, { '+1/+1': 1 });
    g.expect.invariants();
  });

  test('guidance gets more votes or the vote is tied: a card is drawn', () => {
    const g = board();
    g.act(0).cast(ELF, { pay: true });
    g.passAll();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    vote(g, ['guidance', 'dominion', 'guidance']);
    g.expect.handSize(0, 1);
    g.expect.ringLevel(0, 0);
  });

  test('no other Elf entered this turn: nothing triggers', () => {
    const g = board();
    g.advanceTo('beginningOfCombat');
    g.expect.stack([]);
  });
});
