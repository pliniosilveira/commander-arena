// The Bruna deck (issue 5), the cards that read the life they gained (D-256, D-257). The REAL cards of the golden corpus, read through the grammar only and played through
// applyAction: "that many" of a life gain trigger, "Do this only once each turn" (CR 603.2h), and "pay {X}, where X is less than or equal to the amount of life you gained.
// If you do, draw X cards." Stand-ins are SYNTHETIC (named so).
import { readFileSync } from 'node:fs';
import type { Action, CardDefinition, GameState } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = cards.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.status, name).toBe('supported');
  expect(imported.support.unparsed, name).toEqual([]);
  return imported.definition;
}

const FILLER = Array.from({ length: 30 }, () => 'Plains');
const MEND = parsed('SYNTHETIC Mend', 'Instant', 'You gain 3 life.', { manaCost: '{W}' });
const BEAR = parsed('SYNTHETIC Bear', 'Creature — Bear', '', {
  manaCost: '{1}{G}',
  power: '2',
  toughness: '2',
});

function settle(g: {
  state: GameState;
  passAll(): unknown;
  legalActions(seat: 0 | 1): readonly Action[];
  choose(seat: 0 | 1, action: Action): unknown;
}) {
  for (let i = 0; i < 20; i += 1) {
    const d = g.state.pending;
    if (d !== null && d.kind === 'orderTriggers') {
      g.choose(d.seat as 0 | 1, g.legalActions(d.seat as 0 | 1)[0] as Action);
    } else if (g.state.stack.length > 0) g.passAll();
    else break;
  }
}

describe('Nykthos Paragon (whenever you gain life, you may put that many +1/+1 counters on each creature you control. Do this only once each turn.)', () => {
  const NYKTHOS = real('Nykthos Paragon');
  const game = (...hand: string[]) =>
    scenario()
      .define(NYKTHOS)
      .define(MEND)
      .define(BEAR)
      .seat(0)
      .hand(...hand)
      .battlefield(NYKTHOS.name, BEAR.name)
      .battlefield('Plains', { count: 4 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('reads as an optional life gain trigger that limits itself by CR 603.2h', () => {
    expect(NYKTHOS.faces[0]?.abilities.find((a) => a.kind === 'triggered')).toMatchObject({
      trigger: { kind: 'lifeGained', who: 'you' },
      optional: true,
      doOnlyOnceEachTurn: true,
    });
  });

  test('gaining 3 life puts three counters on each creature I control', () => {
    const g = game(MEND.name);
    g.act(0).cast(MEND.name, { pay: true });
    g.passAll();
    g.act(0).accept();
    settle(g);
    g.expect.counters(NYKTHOS.name, { '+1/+1': 3 });
    g.expect.counters(BEAR.name, { '+1/+1': 3 });
    g.expect.invariants();
  });

  test('a second gain the same turn does nothing, after the counters were put', () => {
    const g = game(MEND.name, MEND.name);
    g.act(0).cast({ name: MEND.name, zone: 'hand', nth: 0 }, { pay: true });
    g.passAll();
    g.act(0).accept();
    settle(g);
    g.act(0).cast(MEND.name, { pay: true });
    settle(g);
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.counters(BEAR.name, { '+1/+1': 3 });
  });
});

describe('Well of Lost Dreams (whenever you gain life, you may pay {X}, where X is less than or equal to the amount of life you gained. If you do, draw X cards.)', () => {
  const WELL = real('Well of Lost Dreams');
  const game = (lands: number) =>
    scenario()
      .define(WELL)
      .define(MEND)
      .seat(0)
      .hand(MEND.name)
      .battlefield(WELL.name)
      .battlefield('Plains', { count: lands })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('gaining 3 life: X from 0 to 3, pay {2}, draw 2 cards', () => {
    const g = game(5);
    g.act(0).cast(MEND.name, { pay: true });
    g.passAll();
    const d = g.state.pending;
    expect(d?.kind).toBe('chooseX');
    if (d?.kind !== 'chooseX') return;
    expect([d.min, d.max]).toEqual([0, 3]);
    g.act(0).chooseX(2);
    g.act(0).payAuto();
    settle(g);
    g.expect.handSize(0, 2);
    g.expect.invariants();
  });

  test('the most is what the mana I have allows: one land left, one card', () => {
    const g = game(2);
    g.act(0).cast(MEND.name, { pay: true });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'chooseX') throw new Error('not asked');
    expect(d.max).toBe(1);
  });
});
