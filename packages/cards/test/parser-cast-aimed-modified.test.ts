// Issue 89 (Silverquill Influence), group 9 (D-646): "Whenever you cast an Aura spell that targets a modified permanent you control, draw a card." (Pearl-Ear, Imperial Advisor): the real
// Oracle line read through the whole pipeline, the node it lowers to, SYNTHETIC variants and the near misses. The engine runs what is lowered in
// packages/engine/test/scenario-xx-cast-aimed-modified.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const creature = (text: string) => readAll(text, 'creature', ['Human', 'Advisor']).abilities;
const DRAW = { kind: 'draw', player: { kind: 'you' }, count: 1 } as const;

describe('"... a spell that targets a modified [kind] [you control]"', () => {
  test('the real line of Pearl-Ear: an Aura spell that targets a modified permanent you control', () => {
    expect(
      creature(
        'Whenever you cast an Aura spell that targets a modified permanent you control, draw a card.',
      ),
    ).toEqual([
      {
        kind: 'triggered',
        trigger: {
          kind: 'castSpell',
          filter: {
            subtypes: ['Aura'],
            stackKind: 'spell',
            targetsObject: { controller: 'you', modified: true },
          },
          by: 'you',
        },
        effect: DRAW,
      },
    ]);
  });

  test('a kind of permanent (SYNTHETIC)', () => {
    expect(
      creature('Whenever you cast a spell that targets a modified creature, draw a card.'),
    ).toMatchObject([
      {
        trigger: {
          filter: { stackKind: 'spell', targetsObject: { types: ['creature'], modified: true } },
        },
        effect: DRAW,
      },
    ]);
  });

  test.each([
    'Whenever you cast an Aura spell that targets a modified permanent you control and, draw a card.',
    'Whenever you cast an Aura spell that targets modified permanents you control, draw a card.',
    'Whenever you cast an Aura spell that targets a modified, draw a card.',
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(dropped(text, 'creature', ['Human']).text).toBe(text);
  });
});
