/**
 * SYNTHETIC CARD FOR "DESTROY ALL CREATURES WITH POWER GREATER THAN TARGET CREATURE'S POWER". NOT A REAL MAGIC CARD.
 *
 * Invented for the tests of what a real card of that shape needs from the engine: a sorcery that targets a creature and destroys every creature whose power is
 * greater than the power of that target as the spell resolves (the engine's `each` selector with `powerGreaterThan` of the target). Names start with
 * "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and it is not the definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

export const SYNTHETIC_POWER_ABOVE_TARGET_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Humbling Sweep',
    manaCost: ['4', 'W'],
    types: ['sorcery'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: "Destroy all creatures with power greater than target creature's power.",
    spell: {
      targets: [
        {
          id: 't1',
          what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
        },
      ],
      effect: {
        kind: 'destroy',
        objects: {
          kind: 'each',
          filter: {
            zone: 'battlefield',
            types: ['creature'],
            powerGreaterThan: { kind: 'target', id: 't1' },
          },
        },
      },
    },
  }),
];
