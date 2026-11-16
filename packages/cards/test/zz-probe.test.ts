import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
const NAMES = [
  'Elrond, Lord of Rivendell',
  'Galadriel of Lothlórien',
  'Matoya, Archon Elder',
  'Elven Farsight',
  'Track Down',
  'Nissa, Steward of Elements',
  'Shower of Arrows',
];
test('probe', () => {
  for (const name of NAMES) {
    const card = GOLDEN.find((c) => c.name === name);
    if (card === undefined) throw new Error(name);
    const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
    const face = imported.definition.faces[0];
    console.log(
      'CARD',
      name,
      imported.support.status,
      '\n  ABILITIES',
      JSON.stringify(face?.abilities ?? null),
      '\n  SPELL',
      JSON.stringify(face?.spell ?? null),
      '\n  UNPARSED',
      JSON.stringify(imported.support.unparsed),
      '\n  SUPPORT',
      JSON.stringify(imported.support).slice(0, 1500),
    );
  }
});
