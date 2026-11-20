import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
test('ast', () => {
  const c = GOLDEN.find((x) => x.name === process.env.NAME);
  if (!c) throw new Error('missing');
  const i = importCard(fromGoldenCard(c), undefined, NO_OVERRIDES);
  console.log('AST', JSON.stringify(i.definition.faces[0]?.abilities, null, 1));
});
