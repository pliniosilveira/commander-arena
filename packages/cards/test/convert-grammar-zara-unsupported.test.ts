// Zara, Renegade Recruiter is unsupported until the engine lets the controller choose the player or planeswalker a creature put onto the battlefield attacking attacks (CR 508.4,
// 506.3) and shows the whole hand she looks at (CR 402.3): a card that cannot be played by the rules is flagged, never played in a wrong way. The real Oracle text of the golden corpus.
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

describe('Zara, Renegade Recruiter', () => {
  test('is unsupported and names the feature the engine lacks', () => {
    const card = parseGolden(
      readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
    ).find((c) => c.name === 'Zara, Renegade Recruiter');
    expect(card).toBeDefined();
    if (card === undefined) return;
    const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.unparsed).toHaveLength(1);
    expect(imported.support.unparsed[0]?.needs).toContain('ability:attackTargetChoice');
  });
});
