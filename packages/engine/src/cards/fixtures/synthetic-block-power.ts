/**
 * SYNTHETIC CARD FOR "CREATURES WITH POWER LESS THAN ~'S POWER CAN'T BLOCK CREATURES YOU CONTROL" (issue 160). NOT A REAL MAGIC CARD.
 *
 * Invented for the tests of what the real card needs from the engine: a creature whose static ability makes the creatures its controller controls unable to be blocked by
 * creatures with less power than it has now (the engine's `cantBeBlockedBy` with `powerLessThanSource` blockers). Names start with "SYNTHETIC "; oracleId is null. The text
 * describes what the AST does; it is not Oracle text, and it is not the definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

export const SYNTHETIC_BLOCK_POWER_LIST: readonly CardDefinition[] = [
  // "Creatures with power less than ~'s power can't block creatures you control."
  singleFace({
    name: 'SYNTHETIC Power Marshal',
    manaCost: ['2', 'G'],
    types: ['creature'],
    subtypes: ['Human', 'Soldier'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 3,
    toughness: 3,
    oracleText: "Creatures with power less than ~'s power can't block creatures you control.",
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'cantBeBlockedBy',
          subject: { kind: 'filter', filter: { types: ['creature'], controller: 'you' } },
          blockers: { types: ['creature'], powerLessThanSource: true },
        },
      },
    ],
  }),
];
