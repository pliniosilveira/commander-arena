/**
 * SYNTHETIC CARDS FOR "ANOTHER TARGET ... THAT PLAYER CONTROLS". NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of `TargetSpec.sameControllerAs` (CR 115.1, 115.3, 109.4, 608.2b), the shape of Breaking of the Fellowship ("Target creature an opponent controls deals damage equal
 * to its power to another target creature that player controls."). Names start with "SYNTHETIC "; oracleId is null; the text describes what the AST does and is not Oracle text.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

export const SYNTHETIC_SAME_CONTROLLER_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Pit Strike',
    manaCost: ['1', 'R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'Target creature an opponent controls deals damage equal to its power to another target creature that player controls.',
    spell: {
      targets: [
        {
          id: 't1',
          what: {
            kind: 'object',
            filter: { zone: 'battlefield', types: ['creature'], controller: 'opponent' },
          },
        },
        {
          id: 't2',
          what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
          differentFrom: 't1',
          sameControllerAs: 't1',
        },
      ],
      effect: {
        kind: 'dealDamage',
        amount: { kind: 'powerOf', of: { kind: 'target', id: 't1' } },
        to: { kind: 'target', id: 't2' },
        from: { kind: 'target', id: 't1' },
      },
    },
  }),
];
