/**
 * SYNTHETIC CARDS FOR EXPERIENCE COUNTERS. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of `gainExperience`, `experienceCounters` and `manaValueAtMostAmount` (CR 122.1, 202.3). The wording of a real card, the name replaced:
 * "Whenever another creature you control dies, you get an experience counter. At the beginning of your end step, choose target creature card in your graveyard. If that
 * card's mana value is less than or equal to the number of experience counters you have, return it to the battlefield. Otherwise, put it into your hand.", with creatures of
 * several mana values to return. Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the
 * definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const creature = (name: string, manaCost: readonly string[] | null, power: number) =>
  singleFace({
    name,
    manaCost,
    types: ['creature'],
    subtypes: ['Beast'],
    colors: [],
    colorIdentity: [],
    power,
    toughness: power,
    oracleText: '',
  });

export const SYNTHETIC_EXPERIENCE_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Experienced Shaman',
    manaCost: ['2'],
    types: ['creature'],
    subtypes: ['Human', 'Shaman'],
    colors: [],
    colorIdentity: [],
    power: 3,
    toughness: 4,
    oracleText:
      "Whenever another creature you control dies, you get an experience counter.\nAt the beginning of your end step, choose target creature card in your graveyard. If that card's mana value is less than or equal to the number of experience counters you have, return it to the battlefield. Otherwise, put it into your hand.",
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'dies', what: { types: ['creature'], controller: 'you', other: true } },
        effect: { kind: 'gainExperience', player: { kind: 'you' }, amount: 1 },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'endStep', whose: 'you' },
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: { zone: 'graveyard', types: ['creature'], controller: 'you' },
            },
          },
        ],
        effect: {
          kind: 'conditional',
          condition: {
            kind: 'manaValueAtMostAmount',
            of: { kind: 'target', id: 't1' },
            amount: { kind: 'experienceCounters' },
          },
          effect: { kind: 'moveToZone', objects: { kind: 'target', id: 't1' }, to: 'battlefield' },
          else: { kind: 'moveToZone', objects: { kind: 'target', id: 't1' }, to: 'hand' },
        },
      },
    ],
  }),
  creature('SYNTHETIC Free Beast', null, 1),
  creature('SYNTHETIC Two Beast', ['2'], 2),
  creature('SYNTHETIC Three Beast', ['3'], 3),
  // {X}{1}: a mana value of 1 in a graveyard (CR 202.3e).
  creature('SYNTHETIC X Beast', ['X', '1'], 1),
];
