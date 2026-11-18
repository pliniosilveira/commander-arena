import { describe, expect, test } from 'vitest';
import type { CardDefinition } from '../src/index';
import { syntheticCard } from '../src/index';
import { scenario } from '../src/testing/index';

const CLASS_NAME = 'SYNTHETIC Level Three Class';
const LEVEL_CLASS: CardDefinition = (() => {
  const base = syntheticCard('SYNTHETIC Ring Watcher');
  const face = base.faces[0];
  if (face === undefined) throw new Error('no synthetic face');
  return {
    ...base,
    name: CLASS_NAME,
    layout: 'class',
    faces: [
      {
        ...face,
        name: CLASS_NAME,
        types: ['enchantment'],
        subtypes: ['Class'],
        abilities: [
          {
            kind: 'activated',
            cost: [{ kind: 'mana', symbols: ['3', 'W'] }],
            timing: 'sorcery',
            effect: { kind: 'gainLevel', level: 2 },
          },
          {
            kind: 'level',
            level: 2,
            abilities: [{ kind: 'keyword', keyword: { kind: 'flying' } }],
          },
          {
            kind: 'activated',
            cost: [{ kind: 'mana', symbols: ['4', 'W'] }],
            timing: 'sorcery',
            effect: { kind: 'gainLevel', level: 3 },
          },
          {
            kind: 'level',
            level: 3,
            abilities: [
              {
                kind: 'triggered',
                trigger: { kind: 'classLevel', level: 3 },
                effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 2 },
              },
            ],
          },
        ],
      },
    ],
  };
})();

describe('Class level triggers', () => {
  test('a Class reaching level 3 triggers its level-three ability', () => {
    const g = scenario()
      .define(LEVEL_CLASS)
      .seat(0)
      .life(20)
      .battlefield(CLASS_NAME, { level: 2 })
      .battlefield('Plains', { count: 5 })
      .seat(1)
      .build();

    g.act(0).activate(CLASS_NAME, { ability: 2, pay: true });
    g.passAll();

    expect(g.state.objects[g.id(CLASS_NAME)]?.level).toBe(3);
    g.expect.life(0, 22);
    g.expect.invariants();
  });
});
