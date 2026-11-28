// "At the beginning of your end step, you may pay {2} and sacrifice a token. If you do, create a 4/4 green Rhino Warrior creature token."
// (issue 128, Killer Service; CR 118.3, 701.21a, 608.2c).
import { describe, expect, test } from 'vitest';
import { readAll } from './parser-p5-helpers';

describe('you may pay {2} and sacrifice a token. If you do, ...', () => {
  test('reads Killer Service', () => {
    const read = readAll(
      'At the beginning of your end step, you may pay {2} and sacrifice a token. If you do, create a 4/4 green Rhino Warrior creature token.',
      'enchantment',
      [],
    );
    expect(read.abilities).toHaveLength(1);
    expect(read.abilities[0]).toMatchObject({
      kind: 'triggered',
      effect: {
        kind: 'mayPay',
        cost: [{ kind: 'mana' }, { kind: 'sacrifice' }],
        effect: { kind: 'createToken' },
      },
    });
  });
});
