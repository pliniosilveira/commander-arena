// Issue 89 (Silverquill Influence), group 5 (D-592): an Aura that remakes its creature and gives it a keyword, with everything else lost (Darksteel Mutation): the real Oracle line read
// through the whole pipeline, the nodes it lowers to, SYNTHETIC variants and the near misses the grammar must not read. The engine runs what is lowered in
// packages/engine/test/scenario-xx-aura-remakes-creature.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const ATTACHED = { kind: 'attached' } as const;
const aura = (text: string) =>
  readAll(`Enchant creature\n${text}`, 'enchantment', ['Aura']).abilities;

describe('"Enchanted creature is an Insect artifact creature ... and has indestructible, and it loses all other abilities, card types, and creature types." (CR 613)', () => {
  test('the real line of Darksteel Mutation: the abilities are lost first, then the keyword is given', () => {
    expect(
      aura(
        'Enchanted creature is an Insect artifact creature with base power and toughness 0/1 and has indestructible, and it loses all other abilities, card types, and creature types.',
      ),
    ).toEqual([
      { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
      { kind: 'static', static: { kind: 'loseAllAbilities', subject: ATTACHED } },
      {
        kind: 'static',
        static: {
          kind: 'setTypes',
          subject: ATTACHED,
          types: ['artifact', 'creature'],
          subtypes: ['Insect'],
        },
      },
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: { kind: 'attached', types: ['creature'] },
          keyword: { kind: 'indestructible' },
        },
      },
      { kind: 'static', static: { kind: 'setPt', subject: ATTACHED, power: 0, toughness: 1 } },
    ]);
  });

  test('two keywords and another number (SYNTHETIC)', () => {
    const abilities = aura(
      'Enchanted creature is a Frog creature with base power and toughness 1/1 and has flying and haste, and it loses all other abilities, card types, and creature types.',
    );
    expect(abilities.map((a) => (a.kind === 'static' ? a.static.kind : a.kind))).toEqual([
      'keyword',
      'loseAllAbilities',
      'setTypes',
      'grantKeyword',
      'grantKeyword',
      'setPt',
    ]);
  });

  test.each([
    [
      'Enchanted creature is an Insect artifact creature with base power and toughness 0/1 and has indestructible, and it loses all other abilities, card types, and creature types',
      '',
    ],
    [
      'Enchanted creature is an Insect artifact creature with base power and toughness 0/1 and has indestructible and it loses all other abilities, card types, and creature types.',
      'it loses all other abilities, card types, and creature types.',
    ],
  ])('is dropped, never half read (SYNTHETIC): %s', (text, part) => {
    expect(dropped(`Enchant creature\n${text}`, 'enchantment', ['Aura']).stoppedAt).toContain(part);
  });
});
