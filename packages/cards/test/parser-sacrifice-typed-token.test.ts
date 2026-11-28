// "{1}, Sacrifice an artifact token: Put a +1/+1 counter on each Dog you control." (issue 128, Sophia, Dogged Detective):
// the cost sacrifices a token that has a card type (CR 701.21a, 111.1, 205.2a).
import { describe, expect, test } from 'vitest';
import { readAll } from './parser-p5-helpers';

describe('Sacrifice an artifact token', () => {
  test('is a cost of a token with the artifact type', () => {
    const read = readAll(
      '{1}, Sacrifice an artifact token: Put a +1/+1 counter on each Dog you control.',
      'creature',
      [],
    );
    expect(read.abilities).toHaveLength(1);
    expect(read.abilities[0]).toMatchObject({
      kind: 'activated',
      cost: [
        { kind: 'mana', symbols: ['1'] },
        { kind: 'sacrifice', what: { token: true, types: ['artifact'] } },
      ],
      effect: {
        kind: 'addCounters',
        counter: '+1/+1',
        objects: { kind: 'each', filter: { subtypes: ['Dog'], controller: 'you' } },
      },
    });
  });
});
