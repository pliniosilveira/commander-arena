import { readFileSync, writeFileSync } from 'node:fs';
import { test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const cards = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
test('ast', () => {
  const out: string[] = [];
  const names = (process.env.NAMES ?? '').split('|');
  for (const c of cards.filter((c) => names.some((n) => c.name.startsWith(n)))) {
    const i = importCard(fromGoldenCard(c), undefined, NO_OVERRIDES);
    out.push(c.name, JSON.stringify(i.definition.faces.map((f) => f.abilities ?? f.spell)));
  }
  writeFileSync('/tmp/claude-0/s/ast.txt', out.join('\n'));
});
