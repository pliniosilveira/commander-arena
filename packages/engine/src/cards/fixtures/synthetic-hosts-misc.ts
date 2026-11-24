/**
 * SYNTHETIC CARDS FOR SMALL PRIMITIVES OF THE HOSTS OF MORDOR DECK (issue 150). NOT REAL MAGIC CARDS.
 *
 * Invented for the scenario tests of mana in any combination of listed colors, a spell that costs less when its target was dealt damage, a cost
 * reduced by the greatest count among the opponents, damage divided among targets, a hand discarded for as much as the damage dealt to a player,
 * a payment that taps and stuns the opponents' creatures, and a cycling trigger. Names start with "SYNTHETIC "; oracleId is null. The text
 * describes what the AST does; it is not Oracle text.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

export const SYNTHETIC_HOSTS_MISC_LIST: readonly CardDefinition[] = [
  // "{T}: Add two mana in any combination of {U}, {B}, and/or {R}." (CR 106.1b, 605.3b)
  singleFace({
    name: 'SYNTHETIC Tricolor Relic',
    manaCost: ['4'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: '{T}: Add two mana in any combination of {U}, {B}, and/or {R}.',
    abilities: [
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production: { kind: 'anyCombination', count: 2, colors: ['U', 'B', 'R'] },
      },
    ],
  }),
  // "When this enters, you may pay {5}. If you do, tap all creatures your opponents control, then put a stun counter on each of those creatures." (CR 701.26a, 122.1d, 608.2c)
  singleFace({
    name: 'SYNTHETIC Frost Leviathan',
    manaCost: ['4', 'U', 'U'],
    types: ['creature'],
    subtypes: ['Serpent'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 5,
    toughness: 5,
    oracleText:
      'When this enters, you may pay {5}. If you do, tap all creatures your opponents control, then put a stun counter on each of those creatures.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: {
          kind: 'mayPay',
          cost: [{ kind: 'mana', symbols: ['5'] }],
          effect: {
            kind: 'sequence',
            effects: [
              {
                kind: 'tap',
                objects: {
                  kind: 'each',
                  filter: { zone: 'battlefield', types: ['creature'], controller: 'opponent' },
                },
              },
              {
                kind: 'addCounters',
                objects: {
                  kind: 'each',
                  filter: { zone: 'battlefield', types: ['creature'], controller: 'opponent' },
                },
                counter: 'stun',
                count: 1,
              },
            ],
          },
        },
      },
    ],
  }),
  // "Whenever this enters or attacks, it deals 3 damage divided as you choose among one, two, or three targets." (CR 601.2d, 603.3d, 115.4)
  singleFace({
    name: 'SYNTHETIC Ember Colossus',
    manaCost: ['4', 'R', 'R'],
    types: ['creature'],
    subtypes: ['Giant'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 6,
    toughness: 6,
    oracleText:
      'Whenever this enters or attacks, it deals 3 damage divided as you choose among one, two, or three targets.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        targets: [{ id: 't1', what: { kind: 'anyTarget' }, min: 1, max: 3, divide: { total: 3 } }],
        effect: { kind: 'dealDividedDamage', to: { kind: 'target', id: 't1' } },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'attacks', what: { kind: 'this' } },
        targets: [{ id: 't1', what: { kind: 'anyTarget' }, min: 1, max: 3, divide: { total: 3 } }],
        effect: { kind: 'dealDividedDamage', to: { kind: 'target', id: 't1' } },
      },
    ],
  }),
  // "When this enters, you may discard your hand and draw cards equal to the damage dealt to target opponent this turn." (CR 120.3, 608.2d)
  singleFace({
    name: 'SYNTHETIC Hoard Drake',
    manaCost: ['4', 'R', 'R'],
    types: ['creature'],
    subtypes: ['Dragon'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 5,
    toughness: 5,
    oracleText:
      'When this enters, you may discard your hand and draw cards equal to the damage dealt to target opponent this turn.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        targets: [{ id: 't1', what: { kind: 'player', filter: 'opponent' } }],
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'discard',
              player: { kind: 'you' },
              count: { kind: 'countOf', filter: { zone: 'hand', controller: 'you' } },
            },
            {
              kind: 'draw',
              player: { kind: 'you' },
              count: { kind: 'damageDealtToThisTurn', player: { kind: 'target', id: 't1' } },
            },
          ],
        },
        optional: true,
      },
    ],
  }),
  // "This spell costs {3} less to cast if it targets a creature that was dealt damage this turn. Destroy target creature. Its controller loses 2 life." (CR 120.3, 601.2c, 601.2f)
  singleFace({
    name: 'SYNTHETIC Bitter Reckoning',
    manaCost: ['3', 'B'],
    types: ['instant'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText:
      'This spell costs {3} less to cast if it targets a creature that was dealt damage this turn. Destroy target creature. Its controller loses 2 life.',
    abilities: [
      {
        kind: 'static',
        static: { kind: 'costReduction', spells: { kind: 'this' }, amount: 3 },
        condition: {
          kind: 'spellTargets',
          filter: { types: ['creature'], dealtDamageThisTurn: true },
        },
      },
    ],
    spell: {
      targets: [
        {
          id: 't1',
          what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
        },
      ],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
          {
            kind: 'loseLife',
            player: { kind: 'controllerOf', of: { kind: 'target', id: 't1' } },
            amount: 2,
          },
        ],
      },
    },
  }),
  // "This creature costs {X} less to cast, where X is the greatest number of artifacts an opponent controls. Flying, haste. Whenever this creature deals combat damage to a player, you create a
  // Treasure token for each artifact that player controls." (CR 109.4, 601.2f, 603.2c)
  singleFace({
    name: 'SYNTHETIC Hoard Wyrm',
    manaCost: ['7', 'R', 'R'],
    types: ['creature'],
    subtypes: ['Dragon'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 6,
    toughness: 6,
    oracleText:
      'This creature costs {X} less to cast, where X is the greatest number of artifacts an opponent controls. Flying, haste. Whenever this creature deals combat damage to a player, you create a Treasure token for each artifact that player controls.',
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'costReduction',
          spells: { kind: 'this' },
          amount: { kind: 'greatestCountOfAnOpponent', filter: { types: ['artifact'] } },
        },
      },
      { kind: 'keyword', keyword: { kind: 'flying' } },
      { kind: 'keyword', keyword: { kind: 'haste' } },
      {
        kind: 'triggered',
        trigger: { kind: 'dealsCombatDamage', what: { kind: 'this' }, to: 'player' },
        effect: {
          kind: 'createToken',
          token: { kind: 'preset', preset: 'Treasure' },
          count: {
            kind: 'countOf',
            filter: { types: ['artifact'], controlledBy: { kind: 'triggerPlayer' } },
          },
        },
      },
    ],
  }),
  // "Cycling {X}{2}{R}. When you cycle this card, destroy up to X target artifacts." (CR 702.29a, 107.3, 603.3d)
  singleFace({
    name: 'SYNTHETIC Artifact Mammoth',
    manaCost: ['5', 'R', 'R'],
    types: ['creature'],
    subtypes: ['Elephant'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 9,
    toughness: 7,
    oracleText: 'Cycling {X}{2}{R}. When you cycle this card, destroy up to X target artifacts.',
    abilities: [
      {
        kind: 'keyword',
        keyword: { kind: 'cycling', cost: [{ kind: 'mana', symbols: ['X', '2', 'R'] }] },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'cycled' },
        targets: [
          {
            id: 't1',
            what: { kind: 'object', filter: { zone: 'battlefield', types: ['artifact'] } },
            upToTriggerAmount: true,
          },
        ],
        effect: { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
      },
    ],
  }),
];
