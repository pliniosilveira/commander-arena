import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';
const NAMES = (process.env.NAMES ?? '').split(';');
test('diag', () => {
  const cards = parseGolden(readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'));
  for (const c of cards.filter((c) => NAMES.includes(c.name))) {
    const i = importCard(fromGoldenCard(c), undefined, NO_OVERRIDES, undefined, undefined, () => undefined);
    console.log(c.name, i.support.status, JSON.stringify(i.support.unparsed.map((u) => ({t: u.text, r: u.reason, c: u.closestRule, n: u.needs})), null, 1));
    if (process.env.AST) console.log(JSON.stringify(i.definition.faces, null, 1));
  }
});
