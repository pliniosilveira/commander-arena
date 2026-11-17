// Issue 89 (Silverquill Influence), group 1 (D-588): a static ability that gives ward ("Enchanted creature has ward {2}"): the real Oracle lines of Chains of Custody and Sheltered
// by Ghosts read through the whole pipeline, the nodes they lower to, SYNTHETIC variants and the near misses the grammar must not read. The engine runs what is lowered in
// packages/engine/test/scenario-xx-granted-ward.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const ATTACHED = { kind: 'attached', types: ['creature'] } as const;
const WARD_2 = { kind: 'ward', cost: [{ kind: 'mana', symbols: ['2'] }] } as const;

describe('"Enchanted creature has ward {2}." (CR 613.1f, 702.21a)', () => {
  test('the real line of Chains of Custody: the enchanted creature is given ward {2}', () => {
    expect(
      readAll('Enchant creature\nEnchanted creature has ward {2}.', 'enchantment', ['Aura'])
        .abilities,
    ).toEqual([
      { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
      { kind: 'static', static: { kind: 'grantKeyword', subject: ATTACHED, keyword: WARD_2 } },
    ]);
  });

  test('the real line of Sheltered by Ghosts: +1/+0, lifelink and ward {2} in one sentence', () => {
    const { abilities } = readAll(
      'Enchant creature\nEnchanted creature gets +1/+0 and has lifelink and ward {2}.',
      'enchantment',
      ['Aura'],
    );
    expect(abilities).toContainEqual({
      kind: 'static',
      static: { kind: 'modifyPt', subject: ATTACHED, power: 1, toughness: 0 },
    });
    expect(abilities).toContainEqual({
      kind: 'static',
      static: { kind: 'grantKeyword', subject: ATTACHED, keyword: { kind: 'lifelink' } },
    });
    expect(abilities).toContainEqual({
      kind: 'static',
      static: { kind: 'grantKeyword', subject: ATTACHED, keyword: WARD_2 },
    });
  });

  test('another cost with a colored symbol (SYNTHETIC)', () => {
    expect(
      readAll('Enchant creature\nEnchanted creature has ward {1}{W}.', 'enchantment', ['Aura'])
        .abilities,
    ).toContainEqual({
      kind: 'static',
      static: {
        kind: 'grantKeyword',
        subject: ATTACHED,
        keyword: { kind: 'ward', cost: [{ kind: 'mana', symbols: ['1', 'W'] }] },
      },
    });
  });

  test.each([
    'Enchanted creature has ward.',
    'Enchanted creature has ward 2.',
    'Enchanted creature has ward {X}.',
    'Enchanted creature has ward {2}{.',
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(dropped(`Enchant creature\n${text}`, 'enchantment', ['Aura']).text).toBe(text);
  });
});
