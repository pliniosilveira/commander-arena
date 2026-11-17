import { readFileSync } from 'node:fs';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const CORPUS = new URL('./fixtures/corpus/golden.jsonl', import.meta.url);
const cards: readonly GoldenCard[] = parseGolden(readFileSync(CORPUS, 'utf8'));

function real(name: string) {
  const card = cards.find((entry) => entry.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  return importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
}

describe('life-gain doubling replacements from issue #255', () => {
  test.each(['Rhox Faithmender', 'The Wind Crystal'])(
    '%s parses and lowers as supported',
    (name) => {
      expect(real(name).support.status).toBe('supported');
    },
  );

  test('Rhox Faithmender doubles a life gain in a real-card game', () => {
    const faithmender = real('Rhox Faithmender');
    const g = scenario()
      .define(faithmender.definition)
      .seat(0)
      .hand('SYNTHETIC Mend')
      .battlefield('Plains', { count: 4 })
      .battlefield(faithmender.definition.name)
      .build();

    g.act(0).cast('SYNTHETIC Mend', { pay: true });
    resolve(g);
    g.expect.life(0, 46);
    g.expect.invariants();
  });
});

function resolve(g: ScenarioGame): void {
  g.pass();
  g.pass();
}
