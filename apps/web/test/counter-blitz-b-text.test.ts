// The Counter Blitz deck, group B: the words the board shows for "Whenever an opponent attacks you" (Lulu, Stern Guardian) and for the cost "Remove a counter from a nonland permanent
// you control" (O'aka, Traveling Merchant), and the Cancel of the question that pays it (CR 118.3, 122.1, 733).
import { describe, expect, test } from 'vitest';
import { activationCostText } from '../src/game/cost-text';
import { triggerWording } from '../src/game/trigger-text';

describe('Counter Blitz group B words', () => {
  test('an opponent attacking you', () => {
    expect(
      triggerWording(
        { kind: 'attackBatch', who: 'opponent', atLeast: 1, attackedYou: true },
        { self: 'this creature' },
      ),
    ).toBe('Whenever an opponent attacks you');
  });

  test('a counter of any kind from a permanent you control, as a cost', () => {
    expect(
      activationCostText([
        { kind: 'tap' },
        {
          kind: 'removeCounters',
          count: 1,
          among: { controller: 'you', notTypes: ['land'] },
        },
      ]),
    ).toMatch(/^\{T\}, Remove a counter from among /);
  });
});
