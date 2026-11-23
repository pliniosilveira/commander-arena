// The companion keyword (CR 702.139a): a deck-construction ability that functions outside the game, with a closed set of conditions. Cards here are SYNTHETIC.
import { describe, expect, test } from 'vitest';
import type { Keyword } from '../src/ast/types';
import { validateCard } from '../src/ast/validate';
import type { CardDefinition } from '../src/cards/definition';
import { syntheticCard } from '../src/cards/fixtures/index';

function withKeyword(keyword: Keyword): CardDefinition {
  const base = syntheticCard('SYNTHETIC Vanilla 2/2');
  const face = base.faces[0];
  if (!face) throw new Error('no face');
  return { ...base, faces: [{ ...face, abilities: [{ kind: 'keyword', keyword }] }] };
}

describe('the companion keyword', () => {
  test('a known condition validates', () => {
    expect(
      validateCard(withKeyword({ kind: 'companion', condition: { kind: 'noRepeatedManaSymbol' } })),
    ).toEqual([]);
  });

  test('an unknown condition is refused', () => {
    const bad = { kind: 'companion', condition: { kind: 'unknown' } } as unknown as Keyword;
    const issues = validateCard(withKeyword(bad));
    expect(issues.map((i) => i.message)).toEqual(['companion needs a known companion condition']);
  });

  test('a missing condition is refused', () => {
    const bad = { kind: 'companion' } as unknown as Keyword;
    expect(validateCard(withKeyword(bad)).length).toBe(1);
  });
});
