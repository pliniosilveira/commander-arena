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
