// Issue 89 (Silverquill Influence), group 7 (D-644): a cast trigger whose spell is one of three kinds ("Whenever you cast an Aura, Equipment, or Vehicle spell, draw a card.", Sram, Senior
// Edificer): the real Oracle line read through the whole pipeline (the comma between the kinds is not the end of the trigger), the nodes it lowers to and the near misses. The engine runs
// what is lowered in packages/engine/test/scenario-xx-cast-three-subtypes.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const DRAW = { kind: 'draw', player: { kind: 'you' }, count: 1 } as const;
const creature = (text: string) => readAll(text, 'creature', ['Human', 'Wizard']).abilities;

describe('"Whenever you cast an Aura, Equipment, or Vehicle spell, draw a card."', () => {
  test('the real line of Sram, Senior Edificer: three subtypes', () => {
    expect(
      creature('Whenever you cast an Aura, Equipment, or Vehicle spell, draw a card.'),
    ).toEqual([
      {
        kind: 'triggered',
        trigger: {
          kind: 'castSpell',
          filter: {
            stackKind: 'spell',
            anyOf: [{ subtypes: ['Aura'] }, { subtypes: ['Equipment'] }, { subtypes: ['Vehicle'] }],
          },
          by: 'you',
        },
        effect: DRAW,
      },
    ]);
  });

  test('three card types (SYNTHETIC)', () => {
    expect(
      creature('Whenever you cast an artifact, enchantment, or creature spell, draw a card.'),
    ).toMatchObject([
      {
        trigger: {
          filter: {
            anyOf: [{ types: ['artifact'] }, { types: ['enchantment'] }, { types: ['creature'] }],
          },
        },
      },
    ]);
  });

  test('a creature spell alone still ends the trigger at its comma (SYNTHETIC)', () => {
    expect(creature('Whenever you cast a creature spell, draw a card.')).toMatchObject([
      { trigger: { filter: { types: ['creature'] } }, effect: DRAW },
    ]);
  });

  test.each([
    [
      'Whenever you cast an Aura, Equipment, or Vehicle, draw a card.',
      ', Equipment, or Vehicle, draw a card.',
    ],
    [
      'Whenever you cast an Aura, Equipment, and Vehicle spell, draw a card.',
      ', Equipment, and Vehicle spell, draw a card.',
    ],
  ])('is dropped, never half read (SYNTHETIC): %s', (text, part) => {
    expect(dropped(text, 'creature', ['Human']).stoppedAt).toContain(part);
  });
});
