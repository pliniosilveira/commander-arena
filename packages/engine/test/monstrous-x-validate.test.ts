// "When this creature becomes monstrous, goad up to X target creatures" (Death Kiss, CR 701.37c): the amount `monstrousX` is the X of the monstrosity of the permanent, valid only in the
// becomes monstrous trigger of the permanent itself, on a face with an ability that has a monstrosity; (CR 508.5) belongs to an attacks trigger.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { validateCard } from '../src/index';

describe('the monstrousX amount is valid only where the monstrosity X can be read (CR 701.37c)', () => {
  const faceOf = (opts: { monstrosity: boolean; trigger: 'becomesMonstrous' | 'dies' }) =>
    singleFace({
      name: 'SYNTHETIC Test Monster X',
      manaCost: ['1'],
      types: ['creature'],
      colors: [],
      colorIdentity: [],
      power: 1,
      toughness: 1,
      oracleText: 'test',
      abilities: [
        ...(opts.monstrosity
          ? [
              {
                kind: 'activated' as const,
                cost: [{ kind: 'mana' as const, symbols: ['X', 'X'] }],
                effect: { kind: 'monstrosity' as const, count: { kind: 'x' as const } },
              },
            ]
          : []),
        {
          kind: 'triggered' as const,
          trigger:
            opts.trigger === 'dies'
              ? { kind: 'dies' as const, what: { kind: 'this' as const } }
              : { kind: 'becomesMonstrous' as const, what: { kind: 'this' as const } },
          effect: {
            kind: 'gainLife' as const,
            player: { kind: 'you' as const },
            amount: { kind: 'monstrousX' as const },
          },
        },
      ],
    });

  test('the becomes monstrous trigger of a face with a monstrosity reads it', () => {
    expect(validateCard(faceOf({ monstrosity: true, trigger: 'becomesMonstrous' }))).toEqual([]);
  });

  test('another trigger, or a face with no monstrosity, does not', () => {
    expect(validateCard(faceOf({ monstrosity: true, trigger: 'dies' })).length).toBeGreaterThan(0);
    expect(
      validateCard(faceOf({ monstrosity: false, trigger: 'becomesMonstrous' })).length,
    ).toBeGreaterThan(0);
  });
});
