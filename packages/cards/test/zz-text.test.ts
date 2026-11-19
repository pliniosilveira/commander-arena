import { writeFileSync } from 'node:fs';
import { test } from 'vitest';
import { importCard } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

test('text', () => {
  const out: string[] = [];
  for (const text of (process.env.TEXTS ?? '').split('||')) {
    const card = syntheticCard({
      name: 'SYNTHETIC Zed',
      typeLine: process.env.TYPE ?? 'Creature — Wizard',
      oracleText: text.replaceAll('~', 'SYNTHETIC Zed'),
      manaCost: '{X}{U}',
      power: '1',
      toughness: '1',
    });
    const i = importCard(card, undefined, NO_OVERRIDES);
    out.push(JSON.stringify(i.support.reasons), JSON.stringify(i.support.unparsed));
    out.push(
      `${i.support.status} | ${text}\n   ${JSON.stringify(i.support.unparsed.map((u) => ({ r: u.reason, c: u.closestRule, n: u.needs })))}`,
    );
  }
  writeFileSync('/tmp/claude-0/s/text.txt', out.join('\n'));
});
