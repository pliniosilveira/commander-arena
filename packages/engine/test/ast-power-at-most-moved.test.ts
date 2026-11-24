// "When ~ enters, amass Orcs 2. When you do, tap target creature an opponent controls with power less than or equal to the amassed Army's power." (Grishnákh, Brash Instigator;
// CR 603.12, 701.47a, 208.1): the filter flag `powerAtMostMoved` reads the Army the amass chose, which only a reflexive ability that carries it (`carriesMoved`) has. The card is SYNTHETIC.
import { describe, expect, test } from 'vitest';
import type { Effect } from '../src/ast/types';
import { singleFace } from '../src/cards/fixtures/helpers';
import { validateCard } from '../src/index';

const reflexive = (extra: Record<string, unknown>): Effect =>
  ({
    kind: 'sequence',
    effects: [
      { kind: 'amass', subtype: 'Orc', count: 2 },
      {
        kind: 'reflexive',
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: {
                zone: 'battlefield',
                types: ['creature'],
                controller: 'opponent',
                powerAtMostMoved: true,
              },
            },
          },
        ],
        effect: { kind: 'tap', objects: { kind: 'target', id: 't1' } },
        ...extra,
      },
    ],
  }) as Effect;

const cardOf = (effect: Effect) =>
  singleFace({
    name: 'SYNTHETIC Army Tapper',
    manaCost: ['2', 'R'],
    types: ['creature'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 2,
    toughness: 2,
    oracleText: 'SYNTHETIC',
    abilities: [
      { kind: 'triggered', trigger: { kind: 'entersBattlefield', what: { kind: 'this' } }, effect },
    ],
  });

describe('powerAtMostMoved', () => {
  test('is valid in the target of a reflexive ability that carries what the amass chose', () => {
    expect(validateCard(cardOf(reflexive({ carriesMoved: true, ifMoved: true })))).toEqual([]);
  });

  test('is refused when the reflexive ability carries nothing', () => {
    expect(validateCard(cardOf(reflexive({}))).length).toBeGreaterThan(0);
  });
});
