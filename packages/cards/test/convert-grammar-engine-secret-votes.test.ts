// The secret council cards: the REAL Oracle text of Círdan the Shipwright, Elrond of the White Council, Trap the Trespassers, Erestor of the Council and Model of Unity (the corpus's
// golden.jsonl) goes through the grammar as a card with no override, is defined in an engine scenario and is played through applyAction with three and four seats, so the nodes the parser
// writes for the real text are what the engine runs. Pins: CR 701.38a (each player votes, in turn order, secretly: nothing shown before all have voted), 701.38b (a vote for players or
// creatures), 603.2 (a trigger after the spell resolves), 122.1d (stun counters), 613.1b (control), 508.1a (can't attack its owner), 101.4 (simultaneous choices in turn order).
import { readFileSync } from 'node:fs';
import { type CardDefinition, type GameEvent, validateCard } from '@commander-arena/engine';
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

const CIRDAN = real('Círdan the Shipwright');
const ELROND = real('Elrond of the White Council');
const TRAP = real('Trap the Trespassers');
const ERESTOR = real('Erestor of the Council');
const MODEL = real('Model of Unity');
const ELF = 'SYNTHETIC Council Elf'; // {G} Elf 1/1, a body to vote for
const FILLER = Array.from({ length: 12 }, () => 'Plains');

describe('every card is valid', () => {
  test.each([CIRDAN, ELROND, TRAP, ERESTOR, MODEL].map((c) => [c.name, c] as const))(
    '%s',
    (_name, card) => {
      expect(validateCard(card)).toEqual([]);
    },
  );
});

type Seats = 3 | 4;
interface Seat {
  readonly hand?: readonly string[];
  readonly board?: readonly string[];
}

/** `seats` players, seat 0 at its first main phase with `own`; the others with `others`. */
function table(
  seats: Seats,
  cards: readonly CardDefinition[],
  own: Seat,
  others: Readonly<Record<number, Seat>> = {},
) {
  let b = scenario({ seats });
  for (const c of cards) b = b.define(c);
  b = b
    .seat(0)
    .life(20)
    .hand(...(own.hand ?? []))
    .battlefield(...(own.board ?? []))
    .library(...FILLER);
  for (let seat = 1; seat < seats; seat += 1) {
    b = b
      .seat(seat)
      .life(20)
      .hand(...(others[seat]?.hand ?? []))
      .battlefield(...(others[seat]?.board ?? []))
      .library(...FILLER);
  }
  return b.at('precombatMain', { active: 0 }).build();
}

const LANDS5 = ['Forest', 'Island', 'Plains', 'Plains', 'Plains'];

describe('Círdan the Shipwright: "each player secretly votes for a player"', () => {
  test('three seats: each player draws for each vote they received, and a player with none may put a permanent card from their hand onto the battlefield', () => {
    const g = table(
      3,
      [CIRDAN],
      { hand: [CIRDAN.name], board: LANDS5 },
      { 2: { hand: ['Forest'] } },
    );
    g.act(0).cast(CIRDAN.name, { pay: true });
    g.passAll();
    g.passAll();
    const mark = g.mark();
    [1, 1, 0].forEach((target, seat) => {
      const d = g.state.pending;
      if (d?.kind !== 'chooseOption' || d.purpose !== 'vote') throw new Error('not a vote');
      // CR 701.38a: secret, so a later voter is told nothing of the earlier votes.
      expect(d.vote?.cast).toEqual([]);
      g.act(seat).chooseOption(`seat:${target}`);
    });
    const events = g.eventsSince(mark);
    expect(events.filter((e) => e.kind === 'optionChosen')).toEqual([]);
    expect(
      events.filter(
        (e): e is Extract<GameEvent, { kind: 'votesRevealed' }> => e.kind === 'votesRevealed',
      ),
    ).toHaveLength(1);
    g.expect.handSize(0, 1);
    g.expect.handSize(1, 2);
    g.expect.pending('chooseCards', 2);
    g.act(2).chooseCards('Forest');
    g.expect.zone('Forest', 'battlefield', { seat: 2 });
    g.expect.invariants();
  });

  test('four seats: every player who received no votes is offered the put, in turn order', () => {
    const g = table(
      4,
      [CIRDAN],
      { hand: [CIRDAN.name], board: LANDS5 },
      { 2: { hand: ['Forest'] }, 3: { hand: ['Swamp'] } },
    );
    g.act(0).cast(CIRDAN.name, { pay: true });
    g.passAll();
    g.passAll();
    [1, 1, 0, 1].forEach((target, seat) => {
      g.act(seat).chooseOption(`seat:${target}`);
    });
    g.expect.pending('chooseCards', 2);
    g.act(2).chooseCards('Forest');
    g.expect.pending('chooseCards', 3);
    g.act(3).chooseCards('Swamp');
    g.expect.handSize(1, 3);
    g.expect.zone('Swamp', 'battlefield', { seat: 3 });
    g.expect.invariants();
  });
});

describe('Trap the Trespassers: "each player secretly votes for a creature you don\'t control"', () => {
  test("three seats: the creature gets a stun counter for each vote and is tapped; the controller's own creature is not offered", () => {
    const g = table(
      3,
      [TRAP],
      { hand: [TRAP.name], board: ['Island', 'Island', 'Island', ELF] },
      { 1: { board: [ELF] }, 2: { board: [ELF] } },
    );
    g.act(0).cast(TRAP.name, { pay: true });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'chooseOption' || d.purpose !== 'vote') throw new Error('not a vote');
    // Two creatures the controller does not control are offered, each with its name.
    expect(d.options).toHaveLength(2);
    expect(d.vote?.choices?.map((c) => (c.kind === 'object' ? c.name : ''))).toEqual([ELF, ELF]);
    const [a, b] = d.options as [string, string];
    [a, a, b].forEach((o, seat) => {
      g.act(seat).chooseOption(o);
    });
    const stun = (o: string) =>
      Object.values(g.state.objects).find((x) => x.id === o.replace('object:', ''));
    expect(stun(a)?.counters.stun).toBe(2);
    expect(stun(a)?.tapped).toBe(true);
    expect(stun(b)?.counters.stun).toBe(1);
    expect(stun(b)?.tapped).toBe(true);
    g.expect.invariants();
  });

  test('four seats: the controller votes too, and a creature with no vote stays untouched', () => {
    const g = table(
      4,
      [TRAP],
      { hand: [TRAP.name], board: ['Island', 'Island', 'Island'] },
      { 1: { board: [ELF] }, 2: { board: [ELF] }, 3: { board: [ELF] } },
    );
    g.act(0).cast(TRAP.name, { pay: true });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'chooseOption' || d.purpose !== 'vote') throw new Error('not a vote');
    const [a] = d.options as [string, string, string];
    [0, 1, 2, 3].forEach((seat) => {
      g.act(seat).chooseOption(a);
    });
    const counters = Object.values(g.state.objects)
      .filter((o) => o.counters.stun !== undefined)
      .map((o) => o.counters.stun);
    expect(counters).toEqual([4]);
    g.expect.invariants();
  });
});

describe('Elrond of the White Council: "each player secretly votes for fellowship or aid"', () => {
  test('each fellowship voter chooses a creature they control; the controller gains them; the aid votes put counters on the creatures the controller has then', () => {
    const g = table(
      3,
      [ELROND],
      { hand: [ELROND.name], board: LANDS5 },
      { 1: { board: [ELF] }, 2: { board: [ELF] } },
    );
    g.act(0).cast(ELROND.name, { pay: true });
    g.passAll();
    g.passAll();
    ['aid', 'fellowship', 'fellowship'].forEach((v, seat) => {
      g.act(seat).chooseOption(v);
    });
    g.expect.pending('choosePermanent', 1);
    g.act(1).choosePermanents(ELF);
    g.expect.pending('choosePermanent', 2);
    g.act(2).choosePermanents(ELF);
    // Seat 0 now controls Elrond and both Elves; one aid vote put a +1/+1 counter on each.
    for (const seat of [1, 2]) {
      expect(
        g.state.battlefield
          .map((id) => g.state.objects[id])
          .filter((o) => o?.owner === seat && o.counters['+1/+1'] === 1),
      ).toHaveLength(1);
    }
    g.expect.pt(ELROND.name, 4, 4);
    g.expect.invariants();
  });
});

describe('Erestor of the Council and Model of Unity: "whenever players finish voting"', () => {
  test('a vote of any spell triggers both, which read who voted for what', () => {
    const g = table(
      3,
      [TRAP, ERESTOR, MODEL],
      { hand: [TRAP.name], board: ['Island', 'Island', 'Island', ERESTOR.name, MODEL.name] },
      { 1: { board: [ELF] }, 2: {} },
    );
    g.act(0).cast(TRAP.name, { pay: true });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'chooseOption' || d.purpose !== 'vote') throw new Error('not a vote');
    const [only] = d.options as [string];
    // Everybody votes for the one creature: every opponent voted for a choice the controller voted for.
    [0, 1, 2].forEach((seat) => {
      g.act(seat).chooseOption(only);
    });
    // The Trap has resolved; both abilities wait to be ordered (CR 603.3b), then go on the stack and resolve.
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers(0, 1);
    g.passAll();
    // Model of Unity: the controller and each opponent who voted alike may scry 2, in turn order (all decline here).
    for (const seat of [0, 1, 2]) {
      g.expect.pending('confirmOptional', seat);
      g.act(seat).decline();
    }
    g.passAll();
    const treasures = (seat: number) =>
      g.state.battlefield
        .map((id) => g.state.objects[id])
        .filter((o) => o?.token != null && o.owner === seat).length;
    expect(treasures(1)).toBe(1);
    expect(treasures(2)).toBe(1);
    g.expect.invariants();
  });
});
