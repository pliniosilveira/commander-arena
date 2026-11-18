// Issue 89 (Silverquill Influence), group 6 (D-643): "Whenever an opponent attacks with creatures, if two or more of those creatures are attacking you and/or planeswalkers you
// control, ..." (Mangara, the Diplomat; Tomik, Wielder of Law): the real Oracle lines read through the whole pipeline, the nodes they lower to, SYNTHETIC variants and the near
// misses the grammar must not read. The engine runs what is lowered in packages/engine/test/scenario-xx-attack-at-you.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const TRIGGER = { kind: 'attackBatch', who: 'opponent', atLeast: 1 } as const;
const IF_2 = { kind: 'attackersAtYouAtLeast', count: 2 } as const;
const creature = (text: string) => readAll(text, 'creature', ['Cleric']).abilities;

describe('"Whenever an opponent attacks with creatures, if two or more of those creatures are attacking you and/or planeswalkers you control, ..."', () => {
  test('the real line of Mangara, the Diplomat: draw a card', () => {
    expect(
      creature(
        'Whenever an opponent attacks with creatures, if two or more of those creatures are attacking you and/or planeswalkers you control, draw a card.',
      ),
    ).toEqual([
      {
        kind: 'triggered',
        trigger: TRIGGER,
        interveningIf: IF_2,
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
      },
    ]);
  });

  test('the real line of Tomik, Wielder of Law: that opponent loses 3 life and you draw a card', () => {
    expect(
      creature(
        'Whenever an opponent attacks with creatures, if two or more of those creatures are attacking you and/or planeswalkers you control, that opponent loses 3 life and you draw a card.',
      ),
    ).toEqual([
      {
        kind: 'triggered',
        trigger: TRIGGER,
        interveningIf: IF_2,
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'loseLife', player: { kind: 'triggerPlayer' }, amount: 3 },
            { kind: 'draw', player: { kind: 'you' }, count: 1 },
          ],
        },
      },
    ]);
  });

  test('three or more (SYNTHETIC)', () => {
    expect(
      creature(
        'Whenever an opponent attacks with creatures, if three or more of those creatures are attacking you and/or planeswalkers you control, draw a card.',
      ),
    ).toMatchObject([{ interveningIf: { kind: 'attackersAtYouAtLeast', count: 3 } }]);
  });

  test.each([
    [
      'Whenever an opponent attacks with creatures, if two or more of those creatures are attacking you, draw a card.',
    ],
    [
      'Whenever you attack with creatures, if two or more of those creatures are attacking you and/or planeswalkers you control, draw a card.',
    ],
    [
      'Whenever an opponent attacks with creatures, if one or more of those creatures are attacking you and/or planeswalkers you control, draw a card.',
    ],
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(dropped(text, 'creature', ['Cleric']).text).toBe(text);
  });
});
