import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
const NAMES = [
  'Eccentric Pestfinder // Turn Stones',
  'Stensian Sanguinist // Exsanguinate',
  'Immoral Bargain',
  'Nether Traitor',
  'Ominous Harvest',
  'Pest Infestation',
];

function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`Missing corpus card ${name}`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

describe('issue58 group D real imports', () => {
  test.each(NAMES)('%s reads entirely and validates', (name) => {
    expect(validateCard(real(name))).toEqual([]);
  });

  test('Immoral Bargain announces X before exactly X targets and sacrifices X creatures', () => {
    const card = real('Immoral Bargain');
    const g = scenario()
      .define(card)
      .seat(0)
      .hand(card.name)
      .battlefield('Grizzly Bears', { count: 2 })
      .battlefield('Swamp', { count: 2 })
      .battlefield('Forest')
      .seat(1)
      .battlefield('Giant Spider', { count: 2 })
      .build();
    g.act(0).cast(card.name);
    g.expect.pending('chooseX', 0);
    g.act(0).chooseX(2);
    g.act(0).chooseTargets(
      { object: g.id({ name: 'Giant Spider', nth: 0 }) },
      { object: g.id({ name: 'Giant Spider', nth: 1 }) },
    );
    g.act(0).payAuto();
    g.pass();
    g.pass();
    expect(g.find({ name: 'Grizzly Bears', zone: 'battlefield' })).toHaveLength(0);
    expect(g.find({ name: 'Giant Spider', zone: 'battlefield' })).toHaveLength(0);
    g.expect.invariants();
  });
});
