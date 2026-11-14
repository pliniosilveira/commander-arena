/**
 * SYNTHETIC CARDS FOR DAMAGE DIVIDED AS THE SPELL IS CAST. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-145 (the Dinosaurs slice): a sorcery that deals X damage divided as its caster chooses among any number of
 * target creatures, X being the greatest power among creatures its caster controls as it is cast (`TargetSpec.divide`, `dealDividedDamage`),
 * and one that deals 3 damage divided among one, two or three targets of any kind. Names start with "SYNTHETIC "; oracleId is null. The
 * text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

export const SYNTHETIC_DIVIDE_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Divided Rampage',
    manaCost: ['2', 'R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'SYNTHETIC Divided Rampage deals X damage divided as you choose among any number of target creatures, where X is the greatest power among creatures you control as you cast it.',
    spell: {
      targets: [
        {
          id: 't1',
          what: { kind: 'object', filter: { types: ['creature'] } },
          divide: {
            total: {
              kind: 'aggregate',
              how: 'greatest',
              stat: 'power',
              filter: { types: ['creature'], controller: 'you' },
            },
          },
        },
      ],
      effect: { kind: 'dealDividedDamage', to: { kind: 'target', id: 't1' } },
    },
  }),
  // At least one target: with nothing to divide (X is 0) it can not be cast (CR 601.2c, 601.2d).
  singleFace({
    name: 'SYNTHETIC Measured Volley',
    manaCost: ['R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'SYNTHETIC Measured Volley deals X damage divided as you choose among one or two target creatures, where X is the greatest power among creatures you control as you cast it.',
    spell: {
      targets: [
        {
          id: 't1',
          what: { kind: 'object', filter: { types: ['creature'] } },
          min: 1,
          max: 2,
          divide: {
            total: {
              kind: 'aggregate',
              how: 'greatest',
              stat: 'power',
              filter: { types: ['creature'], controller: 'you' },
            },
          },
        },
      ],
      effect: { kind: 'dealDividedDamage', to: { kind: 'target', id: 't1' } },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Arc Volley',
    manaCost: ['1', 'R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'SYNTHETIC Arc Volley deals 3 damage divided as you choose among one, two or three targets.',
    spell: {
      targets: [{ id: 't1', what: { kind: 'anyTarget' }, min: 1, max: 3, divide: { total: 3 } }],
      effect: { kind: 'dealDividedDamage', to: { kind: 'target', id: 't1' } },
    },
  }),
];
