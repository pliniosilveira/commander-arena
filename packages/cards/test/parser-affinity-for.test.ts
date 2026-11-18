// Issue 89 (Silverquill Influence), group 9 (D-596): "Enchantment spells you cast have affinity for Auras." (Pearl-Ear, Imperial Advisor): the real Oracle line read through the whole
// pipeline, the node it lowers to (the same as "cost {1} less to cast for each Aura you control", CR 702.41a), SYNTHETIC variants and the near misses. The engine runs what is lowered in
// packages/engine/test/scenario-xx-affinity-for-auras.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const creature = (text: string) => readAll(text, 'creature', ['Human', 'Advisor']).abilities;

describe('"[Kind] spells you cast have affinity for [kind]." (CR 702.41a)', () => {
  test('the real line of Pearl-Ear: enchantment spells have affinity for Auras', () => {
    const reduced = creature(
      'Enchantment spells you cast cost {1} less to cast for each Aura you control.',
    );
    expect(creature('Enchantment spells you cast have affinity for Auras.')).toEqual(reduced);
    expect(reduced).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'costReduction',
          spells: { types: ['enchantment'], controller: 'you' },
          amount: { kind: 'countOf', filter: { subtypes: ['Aura'], controller: 'you' } },
        },
      },
    ]);
  });

  test('a card type of permanents (SYNTHETIC)', () => {
    expect(creature('Creature spells you cast have affinity for artifacts.')).toEqual(
      creature('Creature spells you cast cost {1} less to cast for each artifact you control.'),
    );
  });

  test.each([
    'Enchantment spells you cast have affinity for Aura.',
    'Enchantment spells you cast have affinity for Auras',
    'Enchantment spells have affinity for Auras.',
    'Enchantment spells you cast have affinity for Auras you control.',
    'Enchantment spells you cast have affinity for tokens.',
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(dropped(text, 'creature', ['Human']).text).toBe(text);
  });
});
