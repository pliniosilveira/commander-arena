import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const NAMES = ['Theft of Dreams','Borrowing 100,000 Arrows','Gadwick, the Wizened','Loyal Warhound','Floodpits Drowner',"Cloud's Limit Break",'Ojutai Exemplars','Retreat to Coralhelm','You See a Guard Approach','Surge of Salvation'];
import { writeFileSync } from 'node:fs';
const out: string[] = [];
test('scratch', () => {
  const cards: readonly GoldenCard[] = parseGolden(readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'));
  for (const n of NAMES) {
    const c = cards.find((x) => x.name === n);
    if (!c) { console.log('MISSING', n); continue; }
    const imp = importCard(fromGoldenCard(c), undefined, NO_OVERRIDES);
    out.push([n, imp.support.status, JSON.stringify(imp.support.unparsed.map((u) => ({ text: u.text, reason: u.reason, closestRule: u.closestRule, needs: u.needs, stoppedAt: (u as any).stoppedAt })), null, 1)].join(' '));
  }
  writeFileSync('/tmp/claude-0/-workspace/51c020a4-0411-53c3-9337-2f52b4848542/scratchpad/diag.txt', out.join('\n'));
});
