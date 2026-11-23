import { appendFileSync, readFileSync } from 'node:fs';
import { test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

test('diag', () => {
  const cards = parseGolden(readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8')).slice(-3);
  for (const c of cards) {
    const r = importCard(fromGoldenCard(c), undefined, NO_OVERRIDES);
    appendFileSync('/tmp/claude-0/work/diag.txt', c.name + ' ' + JSON.stringify(r.support) + '\n');
  }
});
