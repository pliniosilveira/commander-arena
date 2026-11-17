// Issue 89 (Silverquill Influence), group 4 (D-591): an activated ability an Aura gives, in quotes ("Enchanted creature has flying and "Sacrifice a creature: ~ gets +2/+1 until end of
// turn."", Fallen Ideal): the real Oracle line read through the whole pipeline, the nodes it lowers to, SYNTHETIC variants and the near misses the grammar must not read. The engine
// runs what is lowered in packages/engine/test/scenario-xx-granted-activated.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const ATTACHED = { kind: 'attached', types: ['creature'] } as const;
const aura = (text: string) =>
  readAll(`Enchant creature\n${text}`, 'enchantment', ['Aura']).abilities;

describe('an Aura that gives an activated ability in quotes (CR 613.1f, 113.6g)', () => {
  test('the real line of Fallen Ideal: flying and "Sacrifice a creature: ~ gets +2/+1 until end of turn."', () => {
    expect(
      aura(
        'Enchanted creature has flying and "Sacrifice a creature: ~ gets +2/+1 until end of turn."',
      ),
    ).toEqual([
      { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
      {
        kind: 'static',
        static: { kind: 'grantKeyword', subject: ATTACHED, keyword: { kind: 'flying' } },
      },
      {
        kind: 'static',
        static: {
          kind: 'grantAbility',
          subject: ATTACHED,
          ability: {
            kind: 'activated',
            cost: [{ kind: 'sacrifice', what: { types: ['creature'] } }],
            effect: {
              kind: 'modifyPt',
              objects: { kind: 'this' },
              power: 2,
              toughness: 1,
              duration: 'untilEndOfTurn',
            },
          },
        },
      },
    ]);
  });

  test('a quoted ability alone, with a mana cost (SYNTHETIC)', () => {
    expect(aura('Enchanted creature has "{R}: ~ gets +1/+0 until end of turn."')).toContainEqual({
      kind: 'static',
      static: {
        kind: 'grantAbility',
        subject: ATTACHED,
        ability: {
          kind: 'activated',
          cost: [{ kind: 'mana', symbols: ['R'] }],
          effect: {
            kind: 'modifyPt',
            objects: { kind: 'this' },
            power: 1,
            toughness: 0,
            duration: 'untilEndOfTurn',
          },
        },
      },
    });
  });

  test.each([
    [
      'Enchanted creature has flying and "Sacrifice a creature: ~ gets +2/+1 until end of turn.',
      '',
    ],
    [
      'Enchanted creature has flying and Sacrifice a creature: ~ gets +2/+1 until end of turn.',
      'Sacrifice a creature: ~ gets +2/+1 until end of turn.',
    ],
  ])('is dropped, never half read (SYNTHETIC): %s', (text, part) => {
    expect(dropped(`Enchant creature\n${text}`, 'enchantment', ['Aura']).stoppedAt).toContain(part);
  });
});
