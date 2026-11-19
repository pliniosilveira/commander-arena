// Promise of Loyalty (the top-5 card ranking): the REAL card of the golden corpus, read through the grammar only and played through applyAction. The first sentence is the engine's
// `sparePermanents` of each player's own creatures with a counter on the one kept; the second is `cantAttackController` over the creatures kept, for as long as each has the counter
// (CR 608.2d, 701.21a, 122.1, 508.1a, 506.3, 611.2b, 611.2c). Stand-ins are the engine's real fixtures.
import { readFileSync } from 'node:fs';
import type { CardDefinition } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

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

const PROMISE = real('Promise of Loyalty');
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const GOBLIN = 'Raging Goblin';
const ANGEL = 'Serra Angel';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

const game = () =>
  scenario()
    .define(PROMISE)
    .seat(0)
    .hand(PROMISE.name)
    .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains')
    .battlefield(BEARS, SPIDER)
    .library(...LIBRARY)
    .seat(1)
    .battlefield(GOBLIN, ANGEL, 'Island')
    .library(...LIBRARY)
    .at('precombatMain', { active: 0, turn: 3 })
    .build();

const resolve = (g: ReturnType<typeof game>) => {
  g.act(0).cast(PROMISE.name, { pay: true });
  g.passAll();
  g.act(0).choosePermanents({ name: SPIDER, seat: 0 });
  g.act(1).choosePermanents({ name: ANGEL, seat: 1 });
  g.passAll();
};

describe('Promise of Loyalty', () => {
  test('reads as a spell that keeps one creature of each player with a vow counter and bars them from attacking the caster', () => {
    const ast = JSON.stringify(PROMISE.faces[0]?.spell?.effect);
    expect(ast).toContain('sparePermanents');
    expect(ast).toContain('"counter":"vow"');
    expect(ast).toContain('cantAttackController');
    expect(ast).toContain('"whileCounter":"vow"');
  });

  test('each player keeps one creature with a vow counter and sacrifices the others; the lands stay', () => {
    const g = game();
    resolve(g);
    g.expect.counters(SPIDER, { vow: 1 });
    g.expect.counters(ANGEL, { vow: 1 });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(GOBLIN, 'graveyard', { seat: 1 });
    g.expect.zone('Island', 'battlefield', { seat: 1 });
    g.expect.zone('Plains', 'battlefield', { seat: 0 });
  });

  test('the creature of the opponent can’t attack the caster; the creature of the caster attacks the other player', () => {
    const g = game();
    resolve(g);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('declareAttackers');
    g.expect.canAttack(ANGEL, false);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('declareAttackers');
    g.expect.canAttack(SPIDER, true);
  });
});

describe('the second sentence names nothing by itself', () => {
  const imported = (text: string) =>
    importCard(
      syntheticCard({
        name: 'SYNTHETIC Lone Vow',
        manaCost: '{4}{W}',
        typeLine: 'Sorcery',
        oracleText: text,
      } as never),
      undefined,
      NO_OVERRIDES,
    );

  test('without the sentence before it, the card is unsupported: nothing is guessed', () => {
    const r = imported(
      "Each of those creatures can't attack you or planeswalkers you control for as long as it has a vow counter on it.",
    );
    expect(r.support.status).toBe('unsupported');
  });

  test('with another sentence between them, or in the other order, it is unsupported too', () => {
    const swapped = imported(
      "Each of those creatures can't attack you or planeswalkers you control for as long as it has a vow counter on it. Each player puts a vow counter on a creature they control and sacrifices the rest.",
    );
    expect(swapped.support.status).toBe('unsupported');
  });
});
