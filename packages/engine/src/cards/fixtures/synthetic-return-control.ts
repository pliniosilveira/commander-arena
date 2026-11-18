/**
 * SYNTHETIC CARD FOR "AT THE BEGINNING OF YOUR END STEP, EACH PLAYER GAINS CONTROL OF ALL CREATURES THEY OWN" (issue 160). NOT A REAL MAGIC CARD.
 *
 * Invented for the tests of what the real card needs from the engine: a creature whose triggered ability gives every creature back to its owner (the engine's
 * `returnControlToOwners`). Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and it is not the definition of a
 * real card.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

export const SYNTHETIC_RETURN_CONTROL_LIST: readonly CardDefinition[] = [
  // "At the beginning of your end step, each player gains control of all creatures they own."
  singleFace({
    name: 'SYNTHETIC Mender of Ownership',
    manaCost: ['3', 'G', 'W'],
    types: ['creature'],
    subtypes: ['Angel'],
    colors: ['W', 'G'],
    colorIdentity: ['W', 'G'],
    power: 4,
    toughness: 4,
    oracleText:
      'At the beginning of your end step, each player gains control of all creatures they own.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'endStep', whose: 'you' },
        effect: {
          kind: 'returnControlToOwners',
          objects: { kind: 'each', filter: { types: ['creature'], zone: 'battlefield' } },
        },
      },
    ],
  }),
];
