// Nykthos, Shrine to Nyx (the Bruna deck, issue 5): the REAL card of the owner's golden corpus, read through the grammar only and played through applyAction. CR 605.3b (the
// color is chosen as the mana ability resolves, and it does not use the stack), CR 700.5 (devotion: the mana symbols of the color among the mana costs of the permanents
// you control, hybrid ones counted for each color). The permanents are SYNTHETIC (named so), with invented power and toughness.
import { readFileSync } from 'node:fs';
import type { CardDefinition } from '@commander-arena/engine';
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

const NYKTHOS = real('Nykthos, Shrine to Nyx');
const FILLER = Array.from({ length: 30 }, () => 'Island');
const creature = (name: string, cost: string) =>
  parsed(`SYNTHETIC ${name}`, 'Creature — Bear', '', {
    manaCost: cost,
    power: '1',
    toughness: '1',
  });
const GREEN_TRIPLE = creature('Green Triple', '{G}{G}{G}');
const WHITE_ONE = creature('White One', '{2}{W}');
const HYBRID = creature('Hybrid Pair', '{G/W}{G/W}');

const game = (...permanents: CardDefinition[]) => {
  let b = scenario().define(NYKTHOS);
  for (const p of permanents) b = b.define(p);
  b = b.seat(0).battlefield(NYKTHOS.name, 'Plains', 'Plains');
  for (const p of permanents) b = b.battlefield(p.name);
  return b
    .library(...FILLER)
    .seat(1)
    .library(...FILLER)
    .at('precombatMain', { active: 0, turn: 1 })
    .build();
};

describe('Nykthos, Shrine to Nyx', () => {
  test('reads as two mana abilities: {T}: Add {C}, and the devotion ability', () => {
    expect(NYKTHOS.faces[0]?.abilities).toEqual([
      { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['C'] } },
      {
        kind: 'mana',
        cost: [{ kind: 'mana', symbols: ['2'] }, { kind: 'tap' }],
        production: { kind: 'anyColorDevotion' },
      },
    ]);
  });

  test('the first ability adds {C}', () => {
    const g = game(GREEN_TRIPLE);
    g.act(0).tapForMana(NYKTHOS.name);
    g.expect.pool(0, 'C');
  });

  test('{2} from the pool, then the chosen color as many times as the devotion: GGG with {G}{G}{G}', () => {
    const g = game(GREEN_TRIPLE, WHITE_ONE);
    g.act(0).tapForMana({ name: 'Plains', nth: 0 });
    g.act(0).tapForMana({ name: 'Plains', nth: 1 });
    g.act(0).tapForMana(NYKTHOS.name, { ability: 1, color: 'G' });
    g.expect.pool(0, 'GGG');
    g.expect.stack([]);
  });

  test('the same permanents give devotion 1 to white: W', () => {
    const g = game(GREEN_TRIPLE, WHITE_ONE);
    g.act(0).tapForMana({ name: 'Plains', nth: 0 });
    g.act(0).tapForMana({ name: 'Plains', nth: 1 });
    g.act(0).tapForMana(NYKTHOS.name, { ability: 1, color: 'W' });
    g.expect.pool(0, 'W');
  });

  test('hybrid {G/W}{G/W} is 2 to green and 2 to white at once', () => {
    const g = game(HYBRID);
    g.act(0).tapForMana({ name: 'Plains', nth: 0 });
    g.act(0).tapForMana({ name: 'Plains', nth: 1 });
    g.act(0).tapForMana(NYKTHOS.name, { ability: 1, color: 'W' });
    g.expect.pool(0, 'WW');
  });

  test('with no colored mana symbol among the permanents there is no color to choose', () => {
    const g = game();
    g.act(0).tapForMana({ name: 'Plains', nth: 0 });
    g.act(0).tapForMana({ name: 'Plains', nth: 1 });
    for (const color of ['W', 'U', 'B', 'R', 'G'] as const) {
      g.expect.illegal(0, { tap: NYKTHOS.name, ability: 1, color });
    }
    expect(g.act(0).try.tapForMana(NYKTHOS.name, { ability: 1, color: 'G' }).ok).toBe(false);
  });
});
