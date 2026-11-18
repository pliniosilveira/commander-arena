// Issue 89 (Silverquill Influence), group 3 (D-640): a static ability that gives annihilator ("Enchanted creature gets +10/+10 and has trample and annihilator 2."): the real Oracle
// line of Eldrazi Conscription read through the whole pipeline, the nodes it lowers to, SYNTHETIC variants and the near misses the grammar must not read. The engine runs what is
// lowered in packages/engine/test/scenario-xx-granted-annihilator.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const ATTACHED = { kind: 'attached', types: ['creature'] } as const;
const aura = (text: string) =>
  readAll(`Enchant creature\n${text}`, 'enchantment', ['Aura']).abilities;

describe('"Enchanted creature has annihilator N." (CR 613.1f, 702.86a)', () => {
  test('the real line of Eldrazi Conscription: +10/+10, trample and annihilator 2', () => {
    const abilities = aura('Enchanted creature gets +10/+10 and has trample and annihilator 2.');
    expect(abilities).toContainEqual({
      kind: 'static',
      static: { kind: 'modifyPt', subject: ATTACHED, power: 10, toughness: 10 },
    });
    expect(abilities).toContainEqual({
      kind: 'static',
      static: { kind: 'grantKeyword', subject: ATTACHED, keyword: { kind: 'trample' } },
    });
    expect(abilities).toContainEqual({
      kind: 'static',
      static: {
        kind: 'grantKeyword',
        subject: ATTACHED,
        keyword: { kind: 'annihilator', count: 2 },
      },
    });
  });

  test('another number alone (SYNTHETIC)', () => {
    expect(aura('Enchanted creature has annihilator 1.')).toContainEqual({
      kind: 'static',
      static: {
        kind: 'grantKeyword',
        subject: ATTACHED,
        keyword: { kind: 'annihilator', count: 1 },
      },
    });
  });

  test.each([
    'Enchanted creature has annihilator.',
    'Enchanted creature has annihilator 0.',
    'Enchanted creature has annihilator X.',
    'Enchanted creature has annihilator two.',
    'Enchanted creature has annihilator {2}.',
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(dropped(`Enchant creature\n${text}`, 'enchantment', ['Aura']).text).toBe(text);
  });
});
