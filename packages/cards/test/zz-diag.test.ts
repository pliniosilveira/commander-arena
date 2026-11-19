import { readFileSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const cards = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
const out: string[] = [];
const names = (process.env.NAMES ?? '').split('|');
test('diag', () => {
  for (const c of cards.filter((c) => names.some((n) => c.name.startsWith(n)))) {
    const i = importCard(fromGoldenCard(c), undefined, NO_OVERRIDES);
    out.push([
      c.name,
      i.support.status,
      JSON.stringify(
        i.support.unparsed.map((u) => ({
          t: u.text,
          r: u.reason,
          c: u.closestRule,
          n: u.needs,
        })),
      ),
      JSON.stringify(i.support.reasons),
    ].join(' '));
  }
  writeFileSync('/tmp/claude-0/s/diag.txt', out.join('\n'));
});
