// The Blood token (CR 111.10g): a predefined token, "a colorless Blood artifact token with '{1}, {T}, Discard a card, Sacrifice this token: Draw a card.'". Its activation through the
// ordinary activation path is played in packages/cards/test/convert-grammar-engine-most-wanted-g3.test.ts (Kamber, the Plunderer).
import { describe, expect, test } from 'vitest';
import { TOKEN_PRESETS } from '../src/index';

describe('the Blood preset (CR 111.10g)', () => {
  const blood = TOKEN_PRESETS.Blood;

  test('is a colorless Blood artifact token with the discard-and-sacrifice ability', () => {
    expect([blood.name, blood.types, blood.subtypes, blood.colors]).toEqual([
      'Blood',
      ['artifact'],
      ['Blood'],
      [],
    ]);
    expect(blood.abilities).toEqual([
      {
        kind: 'activated',
        cost: [
          { kind: 'mana', symbols: ['1'] },
          { kind: 'tap' },
          { kind: 'discard', count: 1 },
          { kind: 'sacrifice', what: { kind: 'this' } },
        ],
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
      },
    ]);
    expect(blood.oracleText).toBe('{1}, {T}, Discard a card, Sacrifice this token: Draw a card.');
  });
});
