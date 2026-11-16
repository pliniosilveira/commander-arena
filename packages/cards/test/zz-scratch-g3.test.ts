import { readFileSync, writeFileSync } from 'node:fs';
import { test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const NAMES = [
  'Theft of Dreams',
  'Borrowing 100,000 Arrows',
  'Gadwick, the Wizened',
  'Loyal Warhound',
  'Floodpits Drowner',
  "Cloud's Limit Break",
  'Ojutai Exemplars',
  'Retreat to Coralhelm',
  'You See a Guard Approach',
  'Surge of Salvation',
];
test('scratch', () => {
  const cards: readonly GoldenCard[] = parseGolden(
    readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
  );
  const out: string[] = [];
  for (const n of NAMES) {
    const c = cards.find((x) => x.name === n);
    if (!c) continue;
    const imp = importCard(fromGoldenCard(c), undefined, NO_OVERRIDES);
    const f = imp.definition.faces[0];
    out.push(
      `=== ${n} ${imp.support.status}\n${JSON.stringify({ manaCost: f?.manaCost, abilities: f?.abilities, spell: f?.spell, additionalCosts: f?.additionalCosts }, null, 1)}`,
    );
  }
  writeFileSync(
    '/tmp/claude-0/-workspace/51c020a4-0411-53c3-9337-2f52b4848542/scratchpad/asts.txt',
    out.join('\n'),
  );
});
