import { readFileSync } from 'node:fs';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
const card = cards.find(({ name }) => name === 'Revival // Revenge');
if (card === undefined) throw new Error('Revival // Revenge is not in the golden corpus');

const revenge = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
expect(revenge.support.status, JSON.stringify(revenge.support)).toBe('supported');

test('Revenge doubles its caster life and makes the target lose half, rounded up', () => {
  const g = scenario()
    .define(revenge.definition)
    .seat(0)
    .life(7)
    .hand(revenge.definition.name)
    .battlefield('Plains', 'Plains', 'Swamp', 'Swamp', 'Swamp', 'Swamp')
    .library('Plains')
    .seat(1)
    .life(5)
    .library('Swamp')
    .build();

  g.act(0).cast(revenge.definition.name, { face: 1, targets: [{ player: 1 }], pay: true });
  resolve(g);

  g.expect.life(0, 14);
  g.expect.life(1, 2);
  g.expect.invariants();
});

function resolve(g: ScenarioGame): void {
  g.pass();
  g.pass();
}
