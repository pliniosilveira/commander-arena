// "Spend this mana only to cast Elemental spells or activate abilities of Elemental sources." and its singular form "... an Elemental spell or activate an ability of an Elemental."
// (CR 106.6): the abilities of the sources of the same creature type as the spells, read by `effect.spend-only`. The real Oracle lines of Flamebraider and Primal Beyond are in
// the golden corpus; the other lines are SYNTHETIC siblings and near misses.
import { describe, expect, test } from 'vitest';
import { dropped, type FaceType, readAll } from './parser-p5-helpers';

const abilities = (text: string, type: FaceType = 'creature') => readAll(text, type).abilities;

describe('spend this mana only ... abilities of sources', () => {
  test('two mana in any combination, Elemental spells or abilities of Elemental sources', () => {
    expect(
      abilities(
        '{T}: Add two mana in any combination of colors. Spend this mana only to cast Elemental spells or activate abilities of Elemental sources.',
      ),
    ).toEqual([
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production: { kind: 'anyCombination', count: 2 },
        spendOnly: { subtypes: ['Elemental'], alsoAbilities: true },
      },
    ]);
  });

  test('one mana of any color, an Elemental spell or an ability of an Elemental', () => {
    expect(
      abilities(
        '{T}: Add one mana of any color. Spend this mana only to cast an Elemental spell or activate an ability of an Elemental.',
        'land',
      ),
    ).toEqual([
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production: { kind: 'anyColor' },
        spendOnly: { subtypes: ['Elemental'], alsoAbilities: true },
      },
    ]);
  });

  test('other creature types read the same way', () => {
    expect(
      abilities(
        '{T}: Add one mana of any color. Spend this mana only to cast Dragon spells or activate abilities of Dragon sources.',
      ),
    ).toMatchObject([{ spendOnly: { subtypes: ['Dragon'], alsoAbilities: true } }]);
  });

  test.each([
    // the abilities name another kind than the spells
    'Spend this mana only to cast Elemental spells or activate abilities of Dragon sources.',
    'Spend this mana only to cast an Elemental spell or activate an ability of a Dragon.',
    // plural or a restriction of the source that the engine does not read
    'Spend this mana only to cast an Elemental spell or activate an ability of an Elemental you control.',
    'Spend this mana only to cast Elemental spells or activate abilities of Elemental sources you control.',
    // the article is wrong for the number
    'Spend this mana only to cast Elemental spells or activate an ability of Elementals.',
  ])('does not read %s', (spend) => {
    expect(dropped(`{T}: Add one mana of any color. ${spend}`).reason).toBe('unrecognised');
  });
});
