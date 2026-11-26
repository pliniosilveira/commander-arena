/**
 * SYNTHETIC MANIFEST CARDS, SECOND SET. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of what the manifest cards ask of the engine beyond `synthetic-manifest.ts` (CR 701.40, 708, 614.1c, 122.6, 603.4): a group of colorless
 * creatures that enter with counters, the intervening "if you control no face-down permanents", "manifest a card from your hand", an ability that gives face-up
 * nontoken creatures a triggered ability, and counters on the permanent a manifest dread made. Names start with "SYNTHETIC ", oracleId is null, and the text
 * describes what the AST does; none of this is Oracle text and none copies a real card.
 */
import type { Ability, Effect } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const YOU = { kind: 'you' } as const;
const THIS = { kind: 'this' } as const;

/** CR 701.62a: look at the top two cards, manifest one, put the rest into the graveyard. */
const manifestDread: Effect = {
  kind: 'lookAtTop',
  count: 2,
  take: { filter: {}, max: 1, min: 1, hidden: true, to: 'manifest' },
  rest: 'graveyard',
};

export const SYNTHETIC_MANIFEST_B_LIST: readonly CardDefinition[] = [
  // "Colorless creatures you control enter with two additional +1/+1 counters on them." (CR 614.1c, 122.6)
  singleFace({
    name: 'SYNTHETIC Colorless Boon',
    manaCost: ['4', 'G', 'G'],
    types: ['creature'],
    subtypes: ['Beast'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 6,
    toughness: 6,
    oracleText: 'Colorless creatures you control enter with two additional +1/+1 counters on them.',
    abilities: [
      {
        kind: 'replacement',
        replacement: {
          kind: 'othersEnterWithCounters',
          what: { types: ['creature'], controller: 'you', colorless: true },
          counter: '+1/+1',
          count: 2,
        },
      },
    ],
  }),
  // "When this creature enters, if you control no face-down permanents, return this creature to its owner's hand and manifest dread."
  singleFace({
    name: 'SYNTHETIC Glitch Reader',
    manaCost: ['2', 'U'],
    types: ['creature'],
    subtypes: ['Human', 'Wizard'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 2,
    toughness: 3,
    oracleText:
      'When this creature enters, if you control no face-down permanents, return this creature to its owner’s hand and manifest dread.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: THIS },
        interveningIf: {
          kind: 'not',
          term: {
            kind: 'controlsAtLeast',
            filter: { facing: 'down' },
            count: 1,
          },
        },
        effect: {
          kind: 'sequence',
          effects: [{ kind: 'moveToZone', objects: THIS, to: 'hand' }, manifestDread],
        },
      },
    ],
  }),
  // "{T}: Manifest a card from your hand."
  singleFace({
    name: 'SYNTHETIC Hand Scroll',
    manaCost: ['3'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: '{T}: Manifest a card from your hand.',
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }],
        effect: {
          kind: 'moveToZone',
          objects: { kind: 'choose', filter: { zone: 'hand', controller: 'you' }, count: 1 },
          to: 'battlefield',
          faceDownAs: 'manifest',
        },
      },
    ],
  }),
  // "Sacrifice this creature: Until end of turn, face-up nontoken creatures you control gain \"When this creature dies, manifest the top card of your library.\""
  singleFace({
    name: 'SYNTHETIC Dread Sacrificer',
    manaCost: ['3', 'G', 'G'],
    types: ['creature'],
    subtypes: ['Elemental'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 4,
    toughness: 4,
    oracleText:
      'Sacrifice this creature: Until end of turn, face-up nontoken creatures you control gain "When this creature dies, manifest the top card of your library."',
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'sacrifice', what: THIS }],
        effect: {
          kind: 'grantAbility',
          objects: {
            kind: 'each',
            filter: {
              zone: 'battlefield',
              types: ['creature'],
              controller: 'you',
              token: false,
              facing: 'up',
            },
          },
          abilities: [
            {
              kind: 'triggered',
              trigger: { kind: 'dies', what: THIS },
              effect: { kind: 'manifest', player: YOU },
            } satisfies Ability,
          ],
          duration: 'untilEndOfTurn',
        },
      },
    ],
  }),
  // "When this creature enters, manifest dread, then put two +1/+1 counters and a trample counter on that creature."
  singleFace({
    name: 'SYNTHETIC Dread Brute',
    manaCost: ['4', 'G'],
    types: ['creature'],
    subtypes: ['Beast'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 3,
    toughness: 3,
    oracleText:
      'When this creature enters, manifest dread, then put two +1/+1 counters and a trample counter on that creature.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: THIS },
        effect: {
          kind: 'sequence',
          effects: [
            manifestDread,
            { kind: 'addCounters', objects: { kind: 'moved' }, counter: '+1/+1', count: 2 },
            { kind: 'addCounters', objects: { kind: 'moved' }, counter: 'trample', count: 1 },
          ],
        },
      },
    ],
  }),
  // "Whenever a creature you control deals combat damage to a player, turn that creature face up or put a +1/+1 counter on it."
  singleFace({
    name: 'SYNTHETIC Unmasking Hall',
    manaCost: ['2', 'G'],
    types: ['enchantment'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText:
      'Whenever a creature you control deals combat damage to a player, turn that creature face up or put a +1/+1 counter on it.',
    abilities: [
      {
        kind: 'triggered',
        trigger: {
          kind: 'dealsCombatDamage',
          what: { types: ['creature'], controller: 'you' },
          to: 'player',
        },
        effect: {
          kind: 'chooseOne',
          options: [
            {
              label: 'turn that creature face up',
              effect: { kind: 'turnFaceUp', objects: { kind: 'triggerSubject' } },
            },
            {
              label: 'put a +1/+1 counter on that creature',
              effect: {
                kind: 'addCounters',
                objects: { kind: 'triggerSubject' },
                counter: '+1/+1',
                count: 1,
              },
            },
          ],
        },
      },
    ],
  }),
  // "Whenever a land you control enters, manifest dread if this is the first time this ability has resolved this turn. Otherwise, you may turn a permanent you control face up."
  singleFace({
    name: 'SYNTHETIC Dread Unraveler',
    manaCost: ['2', 'G', 'U'],
    types: ['creature'],
    subtypes: ['Human', 'Wizard'],
    colors: ['G', 'U'],
    colorIdentity: ['G', 'U'],
    power: 3,
    toughness: 3,
    oracleText:
      'Whenever a land you control enters, manifest dread if this is the first time this ability has resolved this turn. Otherwise, you may turn a permanent you control face up.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'landfall' },
        effect: {
          kind: 'conditional',
          condition: { kind: 'abilityResolvedTimes', times: 1 },
          effect: manifestDread,
          else: {
            kind: 'turnFaceUp',
            objects: {
              kind: 'choose',
              filter: { controller: 'you', facing: 'down' },
              optional: true,
            },
          },
        },
      },
    ],
  }),
];
