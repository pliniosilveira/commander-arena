// Issue 89 (Silverquill Influence), group 8 (D-645): a cost reduction for the spells that target something ("Spells you cast that target a creature cost {2} less to cast.", Killian, Ink
// Duelist): the real Oracle line read through the whole pipeline, the node it lowers to, SYNTHETIC variants and the near misses. The engine runs what is lowered in
// packages/engine/test/scenario-xx-cost-reduction-targets.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const creature = (text: string) => readAll(text, 'creature', ['Human', 'Wizard']).abilities;

describe('"Spells you cast that target a creature cost {N} less to cast."', () => {
  test('the real line of Killian, Ink Duelist', () => {
    expect(creature('Spells you cast that target a creature cost {2} less to cast.')).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'costReduction',
          spells: { controller: 'you', targetsObject: { types: ['creature'] } },
          amount: 2,
        },
      },
    ]);
  });

  test('a kind of spell and a creature you control (SYNTHETIC)', () => {
    expect(
      creature('Aura spells you cast that target a creature you control cost {1} less to cast.'),
    ).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'costReduction',
          spells: {
            subtypes: ['Aura'],
            controller: 'you',
            targetsObject: { types: ['creature'], controller: 'you' },
          },
          amount: 1,
        },
      },
    ]);
  });

  test.each([
    'Spells you cast that target creatures cost {2} less to cast.',
    'Spells you cast that target a creature cost {2} less to cast',
    'Spells your opponents cast that target a creature cost {2} less to cast.',
    'Spells you cast that target a creature cost {2} more to cast.',
    'Spells you cast that target cost {2} less to cast.',
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(dropped(text, 'creature', ['Human']).text).toBe(text);
  });
});
