/**
 * SYNTHETIC CARDS FOR "FOR EACH OPPONENT, DESTROY UP TO ONE TARGET ... THAT PLAYER CONTROLS". NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-961 (the Dismantling Wave group): the slot that takes at most one target for each opponent (`TargetSpec.onePerOpponent`,
 * D-149) on a sorcery that destroys, with the filter of two card types ("artifact or enchantment") and of one ("creature"), and a sorcery with a
 * single target, to compare. Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const T1 = { kind: 'target', id: 't1' } as const;

export const SYNTHETIC_DESTROY_PER_OPPONENT_LIST: readonly CardDefinition[] = [
  // "For each opponent, destroy up to one target artifact or enchantment that player controls."
  singleFace({
    name: 'SYNTHETIC Razing Sweep',
    manaCost: ['2', 'W'],
    types: ['sorcery'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText:
      'For each opponent, destroy up to one target artifact or enchantment that player controls.',
    spell: {
      targets: [
        {
          id: 't1',
          onePerOpponent: true,
          what: {
            kind: 'object',
            filter: {
              controller: 'opponent',
              anyOf: [{ types: ['artifact'] }, { types: ['enchantment'] }],
            },
          },
        },
      ],
      effect: { kind: 'destroy', objects: T1 },
    },
  }),
  // "For each opponent, destroy up to one target creature that player controls."
  singleFace({
    name: 'SYNTHETIC Culling Sweep',
    manaCost: ['2', 'B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'For each opponent, destroy up to one target creature that player controls.',
    spell: {
      targets: [
        {
          id: 't1',
          onePerOpponent: true,
          what: { kind: 'object', filter: { types: ['creature'], controller: 'opponent' } },
        },
      ],
      effect: { kind: 'destroy', objects: T1 },
    },
  }),
  // "Destroy target artifact or enchantment an opponent controls." (the same, for one target)
  singleFace({
    name: 'SYNTHETIC Single Razing',
    manaCost: ['1', 'W'],
    types: ['sorcery'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'Destroy target artifact or enchantment an opponent controls.',
    spell: {
      targets: [
        {
          id: 't1',
          what: {
            kind: 'object',
            filter: {
              controller: 'opponent',
              anyOf: [{ types: ['artifact'] }, { types: ['enchantment'] }],
            },
          },
        },
      ],
      effect: { kind: 'destroy', objects: T1 },
    },
  }),
];
