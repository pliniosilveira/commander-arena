// Issue 89 (Silverquill Influence), "Whenever one or more creatures that are enchanted by an Aura you control attack, draw a card." (D-651; Killian, Decisive Mentor)
// read through the whole pipeline: the real line, the node it lowers to and the near misses the grammar must not read.
// The engine runs what is lowered in packages/engine/test/scenario-xx-enchanted-attack-batch.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const line =
  'Whenever one or more creatures that are enchanted by an Aura you control attack, draw a card.';

describe('"Whenever one or more creatures that are enchanted by an Aura you control attack" (CR 508.1, 603.2c)', () => {
  test('the real second line of Killian, Decisive Mentor', () => {
    expect(readAll(line, 'creature').abilities).toEqual([
      {
        kind: 'triggered',
        trigger: {
          kind: 'attackBatch',
          who: 'any',
          atLeast: 1,
          what: { types: ['creature'], enchantedByYou: true },
        },
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
      },
    ]);
  });

  test.each([
    ['Whenever one or more creatures that are enchanted by an Aura attack, draw a card.'],
    [
      'Whenever one or more creatures that are enchanted by an Aura your opponents control attack, draw a card.',
    ],
    [
      'Whenever two or more creatures that are enchanted by an Aura you control attack, draw a card.',
    ],
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(dropped(text, 'creature').stoppedAt).toBeDefined();
  });
});
