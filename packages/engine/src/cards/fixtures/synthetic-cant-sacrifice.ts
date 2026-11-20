/**
 * SYNTHETIC CARDS FOR "THIS PERMANENT CAN'T BE SACRIFICED" AND "THE PLAYER TO YOUR RIGHT". NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of the static ability `cantBeSacrificed` (CR 701.21a, 101.2) and the player selector `playerToYourRight`. Names start with "SYNTHETIC ";
 * oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability, Cost } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const THIS = { kind: 'this' } as const;
const YOU = { kind: 'you' } as const;
const CANT: Ability = { kind: 'static', static: { kind: 'cantBeSacrificed' } };
const tap: Cost = { kind: 'tap' };

export const SYNTHETIC_CANT_SACRIFICE_LIST: readonly CardDefinition[] = [
  // "This creature can't be sacrificed." on an artifact creature, so that every cost and effect that sacrifices a creature meets it.
  singleFace({
    name: 'SYNTHETIC Anchored Golem',
    manaCost: ['2'],
    types: ['artifact', 'creature'],
    subtypes: ['Golem'],
    colors: [],
    colorIdentity: [],
    power: 1,
    toughness: 1,
    oracleText: "This creature can't be sacrificed.",
    abilities: [CANT],
  }),
  // "This artifact can't be sacrificed. {2}, {T}, Sacrifice this artifact: You gain 3 life."
  singleFace({
    name: 'SYNTHETIC Anchored Snack',
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      "This artifact can't be sacrificed.\n{2}, {T}, Sacrifice this artifact: You gain 3 life.",
    abilities: [
      CANT,
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['2'] }, tap, { kind: 'sacrifice', what: THIS }],
        effect: { kind: 'gainLife', player: YOU, amount: 3 },
      },
    ],
  }),
  // "This artifact can't be sacrificed. Sacrifice this artifact: Add {C}."
  singleFace({
    name: 'SYNTHETIC Anchored Spark',
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: "This artifact can't be sacrificed.\nSacrifice this artifact: Add {C}.",
    abilities: [
      CANT,
      {
        kind: 'mana',
        cost: [{ kind: 'sacrifice', what: THIS }],
        production: { kind: 'fixed', mana: ['C'] },
      },
    ],
  }),
  // "{T}: The player to your right gains control of this artifact."
  singleFace({
    name: 'SYNTHETIC Passing Relic',
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: '{T}: The player to your right gains control of this artifact.',
    abilities: [
      {
        kind: 'activated',
        cost: [tap],
        effect: {
          kind: 'gainControl',
          objects: THIS,
          player: { kind: 'playerToYourRight' },
          duration: 'permanent',
        },
      },
    ],
  }),
];
