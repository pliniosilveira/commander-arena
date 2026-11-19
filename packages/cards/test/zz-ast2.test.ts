import { writeFileSync } from 'node:fs';
import { test } from 'vitest';
import { importCard } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

test('ast2', () => {
  const out: string[] = [];
  for (const text of (process.env.TEXTS ?? '').split('||')) {
    const card = syntheticCard({
      name: 'SYNTHETIC Zed',
      typeLine: process.env.TYPE ?? 'Instant',
      oracleText: text,
      manaCost: '{X}{U}',
    });
    const i = importCard(card, undefined, NO_OVERRIDES);
    out.push(JSON.stringify(i.definition.faces[0]?.spell), i.support.status);
  }
  writeFileSync('/tmp/claude-0/s/ast2.txt', out.join('\n'));
});
