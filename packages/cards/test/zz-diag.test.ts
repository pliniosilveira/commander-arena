import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';
const GOLDEN = parseGolden(readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'));
const NAMES = (process.env.NAMES ?? '').split('|');
test('diag', () => {
  for (const n of NAMES) {
    const c = GOLDEN.find((x) => x.name === n);
    if (!c) { console.log('MISSING', n); continue; }
    const i = importCard(fromGoldenCard(c), undefined, NO_OVERRIDES);
    console.log('##', n, i.support.status, JSON.stringify(i.support.unparsed, null, 1).slice(0, 900));
  }
});
