// Revenant Recon deck, group B: Counterpoint, the REAL card of the golden corpus read through the grammar only and played through `applyAction`: "Counter target spell. You may cast a
// creature, instant, sorcery, or planeswalker spell from your graveyard with mana value less than or equal to that spell's mana value without paying its mana cost." (CR 701.6a counter,
// 608.2c the order of the instructions, 608.2g a spell cast as it resolves, 118.9 without paying its mana cost, 202.3 mana value, 608.2h last-known information of the countered spell).
// Stand-ins are SYNTHETIC (named so), with invented power and toughness.
import { readFileSync } from 'node:fs';
import type { CardDefinition } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
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
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const counterpoint = real('Counterpoint');

/** The spell that gets countered: mana value 3. */
const target = parsed('SYNTHETIC Parsed Target', 'Creature — Elf', 'Vigilance', {
  manaCost: '{2}{G}',
  power: '2',
  toughness: '2',
  colors: ['G'],
});
const cheap = parsed('SYNTHETIC Parsed Cheap', 'Creature — Bear', 'Vigilance', {
  manaCost: '{1}{G}',
  power: '2',
  toughness: '2',
  colors: ['G'],
});
const equal = parsed('SYNTHETIC Parsed Equal', 'Creature — Bear', 'Vigilance', {
  manaCost: '{2}{G}',
  power: '3',
  toughness: '3',
  colors: ['G'],
});
const big = parsed('SYNTHETIC Parsed Big', 'Creature — Giant', 'Vigilance', {
  manaCost: '{4}{G}',
  power: '5',
  toughness: '5',
  colors: ['G'],
});
const zap = parsed('SYNTHETIC Parsed Zap', 'Instant', 'You gain 2 life.', {
  manaCost: '{U}',
  colors: ['U'],
});
const relic = parsed('SYNTHETIC Parsed Relic', 'Artifact', 'Flash', { manaCost: '{1}' });

function game(yard: readonly string[]) {
  let b = scenario()
    .define(counterpoint)
    .define(target)
    .define(cheap)
    .define(equal)
    .define(big)
    .define(zap)
    .define(relic)
    .seat(0)
    .life(20)
    .hand(counterpoint.name)
    .pool('UBCCC')
    .library('Island', 'Island');
  for (const name of yard) b = b.graveyard(name);
  const g = b
    .seat(1)
    .hand(target.name)
    .pool('GCC')
    .library('Island', 'Island')
    .at('precombatMain', { active: 1, turn: 1 })
    .build();
  g.act(1).cast(target.name, { pay: true });
  g.pass(); // seat 1 passes priority: seat 0 may respond
  g.act(0).cast(counterpoint.name, { pay: true, targets: [target.name] });
  g.passAll();
  return g;
}

/** The names of the cards the controller is asked to choose among (the decision's legal cards). */
function offered(g: ScenarioGame): string[] {
  const d = g.state.pending;
  if (d === null || d.kind !== 'chooseCards') throw new Error(`pending is ${d?.kind}`);
  return d.legal
    .map((id) => {
      const card = g.state.objects[id]?.card;
      const def = card === null || card === undefined ? undefined : g.state.cards[card];
      return def === undefined ? '?' : (g.state.definitions[def.definition]?.name ?? '?');
    })
    .sort();
}

describe('Counterpoint, from the real text (CR 701.6a, 608.2c, 608.2g, 118.9, 202.3)', () => {
  test('the countered spell goes to the graveyard, then only cards of the listed types with mana value at most its own are offered', () => {
    const g = game([cheap.name, equal.name, big.name, zap.name, relic.name]);
    g.expect.zone(target.name, 'graveyard', { seat: 1 });
    g.expect.pending('chooseCards', 0);
    expect(offered(g)).toEqual([cheap.name, equal.name, zap.name].sort());
  });

  test('the chosen creature card is cast without paying its mana cost and resolves onto the battlefield under the controller', () => {
    const g = game([cheap.name, big.name, zap.name]);
    g.act(0).chooseCards(cheap.name);
    g.passAll();
    g.expect.zone(cheap.name, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('a card with greater mana value than the countered spell is never offered', () => {
    const g = game([big.name]);
    g.expect.zone(big.name, 'graveyard', { seat: 0 });
    expect(g.state.pending?.kind).not.toBe('chooseCards');
  });

  test('declining casts nothing', () => {
    const g = game([cheap.name, zap.name]);
    g.act(0).chooseCards();
    g.expect.zone(cheap.name, 'graveyard', { seat: 0 });
    g.expect.zone(zap.name, 'graveyard', { seat: 0 });
    g.expect.life(0, 20);
  });

  test('an instant card is cast free too', () => {
    const g = game([zap.name, big.name]);
    g.act(0).chooseCards(zap.name);
    g.passAll();
    g.expect.life(0, 22);
    g.expect.zone(zap.name, 'graveyard', { seat: 0 });
  });
});
