/**
 * SYNTHETIC CARDS FOR THE ATTACK AND BLOCK LIMITS OF THE AHOY MATEYS DECK (group 6). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of what three real cards need from the engine: "can't be blocked by creatures the monarch controls" (`cantBeBlockedBy` with `controller: 'monarch'`),
 * "can't be blocked except by Spirits" as a static ability and as an effect of a turn (`restrict` with `blockers`), and "can't attack a player it has already attacked this turn"
 * (the restriction `cantAttackPlayersAlreadyAttacked`) with an additional combat phase. Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is
 * not Oracle text, and none of these is the definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const NOT_SPIRIT = { types: ['creature'], notSubtypes: ['Spirit'] } as const;

export const SYNTHETIC_EVASION_LIMITS_LIST: readonly CardDefinition[] = [
  // A vanilla Spirit, the one creature that may block what can't be blocked except by Spirits.
  singleFace({
    name: 'SYNTHETIC Plain Spirit',
    manaCost: ['1', 'W'],
    types: ['creature'],
    subtypes: ['Spirit'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 1,
    toughness: 1,
    oracleText: '',
  }),
  // "This creature can't be blocked by creatures the monarch controls."
  singleFace({
    name: 'SYNTHETIC Monarch Dodger',
    manaCost: ['3', 'U'],
    types: ['creature'],
    subtypes: ['Human', 'Pirate'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 3,
    toughness: 3,
    oracleText: "This creature can't be blocked by creatures the monarch controls.",
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'cantBeBlockedBy',
          subject: { kind: 'this' },
          blockers: { types: ['creature'], controller: 'monarch' },
        },
      },
    ],
  }),
  // "This creature can't be blocked except by Spirits. {3}{U}: Another target creature you control can't be blocked this turn except by Spirits."
  singleFace({
    name: 'SYNTHETIC Spirit Escort',
    manaCost: ['1', 'U'],
    types: ['creature'],
    subtypes: ['Spirit', 'Pirate'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 2,
    toughness: 2,
    oracleText:
      "This creature can't be blocked except by Spirits.\n{3}{U}: Another target creature you control can't be blocked this turn except by Spirits.",
    abilities: [
      {
        kind: 'static',
        static: { kind: 'cantBeBlockedBy', subject: { kind: 'this' }, blockers: NOT_SPIRIT },
      },
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['3', 'U'] }],
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: { zone: 'battlefield', types: ['creature'], controller: 'you', other: true },
            },
          },
        ],
        effect: {
          kind: 'restrict',
          objects: { kind: 'target', id: 't1' },
          restriction: 'cantBeBlocked',
          blockers: NOT_SPIRIT,
          duration: 'untilEndOfTurn',
        },
      },
    ],
  }),
  // "Whenever this creature deals combat damage to a player, untap each creature you control. After this phase, there is an additional combat phase.
  //  This creature can't attack a player it has already attacked this turn."
  singleFace({
    name: 'SYNTHETIC Raid Captain',
    manaCost: ['3', 'R', 'R'],
    types: ['creature'],
    subtypes: ['Orc', 'Pirate'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 4,
    toughness: 4,
    oracleText:
      "Whenever this creature deals combat damage to a player, untap each creature you control. After this phase, there is an additional combat phase.\nThis creature can't attack a player it has already attacked this turn.",
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'dealsCombatDamage', what: { kind: 'this' }, to: 'player' },
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'untap',
              objects: { kind: 'each', filter: { types: ['creature'], controller: 'you' } },
            },
            { kind: 'extraCombat' },
          ],
        },
      },
      {
        kind: 'static',
        static: {
          kind: 'restriction',
          subject: { kind: 'this' },
          restriction: 'cantAttackPlayersAlreadyAttacked',
        },
      },
    ],
  }),
];
