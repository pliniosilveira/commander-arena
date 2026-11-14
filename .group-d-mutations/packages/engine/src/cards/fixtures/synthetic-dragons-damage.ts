/**
 * SYNTHETIC CARDS FOR THE DAMAGE OF THE DRAGONS SLICE. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-151: "target creature you control deals damage equal to its power to each other creature and each opponent" (the `each`
 * selector with `except`), "deals 4 damage to any target and 3 damage to each of up to two other targets" (`TargetSpec.differentFrom`), and "choose one that
 * hasn't been chosen this turn" after damage dealt to an opponent, with "that opponent" and "each other opponent" (`controller: 'triggerPlayer'`,
 * `eachOtherOpponent`, `ModeChoice.notRepeatedThisTurn`). Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is
 * not Oracle text, and none of these is the definition of a real card.
 */
import type { Effect } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { kw, singleFace } from './helpers';

const T1 = { kind: 'target', id: 't1' } as const;
const NONE: Effect = { kind: 'sequence', effects: [] };

export const SYNTHETIC_DRAGONS_DAMAGE_LIST: readonly CardDefinition[] = [
  // "Target creature you control deals damage equal to its power to each other creature and each opponent."
  singleFace({
    name: 'SYNTHETIC Rolling Ignition',
    manaCost: ['3', 'R', 'R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'Target creature you control deals damage equal to its power to each other creature and each opponent.',
    spell: {
      targets: [
        { id: 't1', what: { kind: 'object', filter: { types: ['creature'], controller: 'you' } } },
      ],
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'dealDamage',
            amount: { kind: 'powerOf', of: T1 },
            from: T1,
            to: { kind: 'each', filter: { types: ['creature'] }, except: T1 },
          },
          {
            kind: 'dealDamage',
            amount: { kind: 'powerOf', of: T1 },
            from: T1,
            to: { kind: 'eachOpponent' },
          },
        ],
      },
    },
  }),
  // "Flying. Whenever this creature attacks, it deals 4 damage to any target and 3 damage to each of up to two other targets."
  singleFace({
    name: 'SYNTHETIC Maw Dragon',
    manaCost: ['4', 'R', 'R', 'R'],
    types: ['creature'],
    subtypes: ['Dragon'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 7,
    toughness: 7,
    oracleText:
      'Flying\nWhenever this creature attacks, it deals 4 damage to any target and 3 damage to each of up to two other targets.',
    abilities: [
      kw('flying'),
      {
        kind: 'triggered',
        trigger: { kind: 'attacks', what: { kind: 'this' } },
        targets: [
          { id: 't1', what: { kind: 'anyTarget' } },
          { id: 't2', what: { kind: 'anyTarget' }, min: 0, max: 2, differentFrom: 't1' },
        ],
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'dealDamage', amount: 4, to: T1 },
            { kind: 'dealDamage', amount: 3, to: { kind: 'target', id: 't2' } },
          ],
        },
      },
    ],
  }),
  // "Flying, double strike. Whenever one or more Dragons you control deal combat damage to an opponent, choose one that hasn't been chosen this turn —
  //  • Destroy target artifact that opponent controls. • This creature deals 4 damage to each other opponent. • Exile the top card of your library.
  //  You may play it this turn." (double strike: two damage events in a turn)
  singleFace({
    name: 'SYNTHETIC Thrashing Wyrm',
    manaCost: ['2', 'R', 'R'],
    types: ['creature'],
    subtypes: ['Dragon'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 4,
    toughness: 3,
    oracleText:
      "Flying, double strike\nWhenever one or more Dragons you control deal combat damage to an opponent, choose one that hasn't been chosen this turn — • Destroy target artifact that opponent controls. • This creature deals 4 damage to each other opponent. • Exile the top card of your library. You may play it this turn.",
    abilities: [
      kw('flying'),
      kw('doubleStrike'),
      {
        kind: 'triggered',
        trigger: {
          kind: 'combatDamageBatch',
          what: { subtypes: ['Dragon'], controller: 'you' },
          to: 'opponent',
        },
        effect: NONE,
        chooseModes: { min: 1, max: 1, notRepeatedThisTurn: true },
        modes: [
          {
            text: 'Destroy target artifact that opponent controls.',
            targets: [
              {
                id: 'art',
                what: {
                  kind: 'object',
                  filter: { types: ['artifact'], controller: 'triggerPlayer' },
                },
              },
            ],
            effect: { kind: 'destroy', objects: { kind: 'target', id: 'art' } },
          },
          {
            text: 'This creature deals 4 damage to each other opponent.',
            effect: { kind: 'dealDamage', amount: 4, to: { kind: 'eachOtherOpponent' } },
          },
          {
            text: 'Exile the top card of your library. You may play it this turn.',
            effect: {
              kind: 'sequence',
              effects: [
                { kind: 'exileTop', count: 1 },
                { kind: 'mayPlay', objects: { kind: 'moved' }, lasts: 'endOfTurn' },
              ],
            },
          },
        ],
      },
    ],
  }),
  // "Flying. When this creature dies, you may pay any amount of {R}. When you do, it deals that much damage to any target."
  singleFace({
    name: 'SYNTHETIC Ember Tyrant',
    manaCost: ['2', 'R', 'R'],
    types: ['creature'],
    subtypes: ['Dragon'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 4,
    toughness: 4,
    oracleText:
      'Flying\nWhen this creature dies, you may pay any amount of {R}. When you do, it deals that much damage to any target.',
    abilities: [
      kw('flying'),
      {
        kind: 'triggered',
        trigger: { kind: 'dies', what: { kind: 'this' } },
        effect: {
          kind: 'payAnyAmount',
          symbol: 'R',
          reflexive: {
            targets: [{ id: 't1', what: { kind: 'anyTarget' } }],
            effect: { kind: 'dealDamage', amount: { kind: 'triggerDamage' }, to: T1 },
          },
        },
      },
    ],
  }),
  // "Flying, haste. Lieutenant - As long as you control your commander, this creature gets +2/+2 and has "Whenever this creature attacks, it deals 7
  //  damage to target creature defending player controls.""
  singleFace({
    name: 'SYNTHETIC Lieutenant Wyrm',
    manaCost: ['5', 'R', 'R'],
    types: ['creature'],
    subtypes: ['Dragon'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 5,
    toughness: 5,
    oracleText:
      'Flying, haste\nLieutenant - As long as you control your commander, this creature gets +2/+2 and has "Whenever this creature attacks, it deals 7 damage to target creature defending player controls."',
    abilities: [
      kw('flying'),
      kw('haste'),
      {
        kind: 'static',
        static: { kind: 'modifyPt', subject: { kind: 'this' }, power: 2, toughness: 2 },
        condition: { kind: 'controlCommander', yours: true },
      },
      {
        kind: 'static',
        static: {
          kind: 'grantAbility',
          subject: { kind: 'this' },
          ability: {
            kind: 'triggered',
            trigger: { kind: 'attacks', what: { kind: 'this' } },
            targets: [
              {
                id: 't1',
                what: {
                  kind: 'object',
                  filter: { types: ['creature'], controller: 'defendingPlayer' },
                },
              },
            ],
            effect: { kind: 'dealDamage', amount: 7, to: T1 },
          },
        },
        condition: { kind: 'controlCommander', yours: true },
      },
    ],
  }),
];
