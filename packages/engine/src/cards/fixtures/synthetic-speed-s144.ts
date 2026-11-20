/**
 * SYNTHETIC SPEED CARDS. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of speed (CR 702.179, 702.178, 704.5aa): Start your engines!, "max speed" as a condition of an activated or a static ability, "increase your speed",
 * and a requirement that lasts for one combat (CR 508.1d, 506.1). Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text.
 */
import type { Condition, Cost } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { kw, singleFace } from './helpers';

const tap: Cost = { kind: 'tap' };
const MAX_SPEED: Condition = { kind: 'maxSpeed', player: { kind: 'you' } };
const T1 = { kind: 'target', id: 't1' } as const;

export const SYNTHETIC_SPEED_LIST: readonly CardDefinition[] = [
  // Start your engines! on a creature (CR 702.179a).
  singleFace({
    name: 'SYNTHETIC Engine Racer',
    manaCost: ['1', 'R'],
    types: ['creature'],
    subtypes: ['Goblin'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 2,
    toughness: 2,
    oracleText: 'Start your engines!',
    abilities: [kw('startYourEngines')],
  }),
  // The mana ability and the static ability of "Max speed" (CR 702.178a): each only as long as the player's speed is 4.
  singleFace({
    name: 'SYNTHETIC Max Speed Engine',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: ['R'],
    oracleText: 'Max speed — {T}: Add {R}.\nMax speed — Other Goblins you control have haste.',
    abilities: [
      {
        kind: 'mana',
        cost: [tap],
        production: { kind: 'fixed', mana: ['R'] },
        activateOnlyIf: MAX_SPEED,
      },
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: {
            kind: 'filter',
            filter: { subtypes: ['Goblin'], controller: 'you' },
            other: true,
          },
          keyword: { kind: 'haste' },
        },
        condition: MAX_SPEED,
      },
    ],
  }),
  // "Increase your speed by N" (CR 702.179c).
  singleFace({
    name: 'SYNTHETIC Speed Surge',
    manaCost: ['R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Increase your speed by 1.',
    spell: { effect: { kind: 'increaseSpeed', player: { kind: 'you' }, amount: 1 } },
  }),
  singleFace({
    name: 'SYNTHETIC Speed Double Surge',
    manaCost: ['1', 'R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Increase your speed by 2.',
    spell: { effect: { kind: 'increaseSpeed', player: { kind: 'you' }, amount: 2 } },
  }),
  // A requirement that lasts for the combat (CR 508.1d, 506.1).
  singleFace({
    name: 'SYNTHETIC Combat Summons',
    manaCost: ['R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Target creature attacks this combat if able.',
    spell: {
      targets: [
        {
          id: 't1',
          what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
        },
      ],
      effect: {
        kind: 'restrict',
        objects: T1,
        restriction: 'attacksEachCombat',
        duration: 'thisCombat',
      },
    },
  }),
];
