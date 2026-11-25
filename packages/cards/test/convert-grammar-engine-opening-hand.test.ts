// "If this card is in your opening hand, you may begin the game with it on the battlefield." (CR 103.6): the REAL Oracle text of Leyline of Anticipation (the corpus's golden.jsonl)
// goes through the grammar as a card with no override and reads as supported, with the pregame option and the flash permission it also has.
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';
import { read } from './parser-p5-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

describe('the opening-hand option', () => {
  test('the real card reads as supported', () => {
    const card = GOLDEN.find((c) => c.name === 'Leyline of Anticipation');
    if (card === undefined) throw new Error('Leyline of Anticipation is not in the golden corpus');
    const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.status).toBe('supported');
    const kinds = (imported.definition.faces[0]?.abilities ?? []).flatMap((a) =>
      a.kind === 'static' ? [a.static.kind] : [],
    );
    expect(kinds).toContain('beginGameOnBattlefield');
    expect(kinds).toContain('castAsThoughFlash');
  });

  test('a luck counter or a starting-player condition is not read', () => {
    const parsed = read(
      'If this card is in your opening hand, you may begin the game with it on the battlefield with a luck counter on it.',
      'enchantment',
    );
    expect(parsed.abilities).toEqual([]);
    expect(parsed.unparsed).toHaveLength(1);
  });
});
