// Issue 104 (Embalm, CR 702.128): the grammar reads "Embalm {cost}" (a line of its own, like Eternalize) and "You may have ~ enter as a copy of any creature on the battlefield, except
// if ~ was embalmed, the token has no mana cost, it's white, and it's a Zombie in addition to its other types." (Vizier of Many Faces). The lines are the real Oracle text of
// Angel of Sanctions and Vizier of Many Faces, names replaced by ~; the siblings and the near misses are SYNTHETIC. The engine plays what is lowered in
// convert-grammar-engine-embalm.test.ts; a missing engine feature is named in parser-embalm-needs.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const VIZIER_LINE =
  "You may have ~ enter as a copy of any creature on the battlefield, except if ~ was embalmed, the token has no mana cost, it's white, and it's a Zombie in addition to its other types.";

const embalm = (...symbols: string[]) => ({
  kind: 'keyword',
  keyword: { kind: 'embalm', cost: [{ kind: 'mana', symbols }] },
});

describe('Embalm', () => {
  test.each([
    ['Embalm {5}{W}', ['5', 'W']],
    ['Embalm {3}{U}{U}', ['3', 'U', 'U']],
    ['Embalm {B}', ['B']],
  ] as const)('%s', (text, symbols) => {
    expect(readAll(text, 'creature').abilities).toEqual([embalm(...symbols)]);
  });

  test("the reminder text of the real card is dropped before the line is read (Angel of Sanctions' line)", () => {
    const text =
      "Embalm {5}{W} ({5}{W}, Exile this card from your graveyard: Create a token that's a copy of it, except it's a white Zombie Angel with no mana cost. Embalm only as a sorcery.)";
    expect(readAll(text, 'creature', ['Angel']).abilities).toEqual([embalm('5', 'W')]);
  });

  test('beside the keyword Flying, on a creature', () => {
    expect(readAll('Flying\nEmbalm {5}{W}', 'creature', ['Angel']).abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'flying' } },
      embalm('5', 'W'),
    ]);
  });

  test.each([
    'Embalm',
    'Embalm {X}{W}',
    'Embalm {W/U}',
    'Embalm—Pay 2 life.',
    'Embalm {5}{W} and flying',
    'Embalmed {5}{W}',
  ])('is not read: %s', (text) => {
    expect(dropped(text, 'creature').reason).toBeDefined();
  });
});

describe('"You may have ~ enter as a copy of any creature on the battlefield, except if ~ was embalmed, ..."', () => {
  test('the real line of Vizier of Many Faces is the replacement effect with the exceptions of an embalmed token', () => {
    expect(readAll(VIZIER_LINE, 'creature', ['Shapeshifter', 'Cleric']).abilities).toEqual([
      {
        kind: 'replacement',
        replacement: {
          kind: 'entersAsCopy',
          what: { types: ['creature'] },
          optional: true,
          duration: 'permanent',
          ifEmbalmed: { setColors: ['W'], noManaCost: true, addSubtypes: ['Zombie'] },
        },
      },
    ]);
  });

  test('over another kind of permanent', () => {
    const text = VIZIER_LINE.replace('any creature', 'any artifact');
    expect(readAll(text, 'artifact').abilities).toMatchObject([
      { replacement: { what: { types: ['artifact'] }, ifEmbalmed: { noManaCost: true } } },
    ]);
  });

  test('with the line of Embalm after it, both abilities of the real card', () => {
    const parsed = readAll(`${VIZIER_LINE}\nEmbalm {3}{U}{U}`, 'creature', ['Shapeshifter']);
    expect(parsed.abilities).toHaveLength(2);
    expect(parsed.abilities[1]).toEqual(embalm('3', 'U', 'U'));
  });

  test.each([
    // not the whole of the exceptions
    VIZIER_LINE.replace(", and it's a Zombie in addition to its other types", ''),
    VIZIER_LINE.replace("it's white", "it's black"),
    VIZIER_LINE.replace('embalmed', 'eternalized'),
    // another question than "any creature on the battlefield"
    VIZIER_LINE.replace('any creature', 'a creature you control'),
    VIZIER_LINE.replace('on the battlefield,', 'on the battlefield until end of turn,'),
    // no final period, or more text
    VIZIER_LINE.slice(0, -1),
    `${VIZIER_LINE} Draw a card.`,
  ])('is not read: %s', (text) => {
    expect(dropped(text, 'creature').reason).toBeDefined();
  });
});
