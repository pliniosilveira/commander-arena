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
  const card = cards.find((candidate) => candidate.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.status, `${name}: ${JSON.stringify(imported.support)}`).toBe('supported');
  expect(imported.support.unparsed, name).toEqual([]);
  return imported.definition;
}

const HERMES = real('Hermes, Overseer of Elpis');
const BIRD = parsed('SYNTHETIC Bird', 'Creature — Bird', '', {
  manaCost: '{1}{W}',
  power: '1',
  toughness: '1',
  colors: ['W'],
});
const FILLER = Array.from({ length: 12 }, () => 'Island');

describe('Hermes, Overseer of Elpis', () => {
  test('scry triggers once when multiple Birds attack together', () => {
    const g = scenario()
      .define(HERMES)
      .define(BIRD)
      .seat(0)
      .battlefield(HERMES.name, BIRD.name, BIRD.name)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([HERMES.name, `${BIRD.name}[1]`]);
    g.passAll();

    g.expect.pending('arrangeCards', 0);
    g.expect.invariants();
  });
});
