/**
 * SYNTHETIC MANIFEST CARDS. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests and the soak games of manifest and face-down permanents (CR 701.40, 708, D-308 to D-316). Names start with "SYNTHETIC ", oracleId is null,
 * and the text describes what the AST does; none of this is Oracle text and none copies a real card.
 *
 * - The creature cards a manifested card can be (a creature card with a mana cost can be turned face up, CR 701.40b): a vanilla one, one with an {X} in its cost, one
 *   that enters tapped with a counter and a trigger of its own (CR 708.3, 708.8: none of that happens for a face-down entry or a turn face up), a lord, and one
 *   with no mana cost (it can't be turned face up).
 * - The spells and abilities that manifest: the removal of Reality Shift's shape ("Exile target creature. Its controller manifests the top card of their library."),
 *   "manifest the top card of your library", "target opponent's library" and a creature whose enters trigger manifests.
 * - A watcher whose trigger counts creatures entering under its controller's control (a face-down entry is a creature entering).
 */
import type { Ability, Effect } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const YOU = { kind: 'you' } as const;
const T1 = { kind: 'target', id: 't1' } as const;
const CREATURE_TARGET = {
  id: 't1',
  what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
} as const;
const OPPONENT_TARGET = { id: 't1', what: { kind: 'player', filter: 'opponent' } } as const;

const manifestYours: Effect = { kind: 'manifest', player: YOU };

const entersTrigger = (effect: Effect): Ability => ({
  kind: 'triggered',
  trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
  effect,
});

export const SYNTHETIC_MANIFEST_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Manifest Brute',
    manaCost: ['3', 'G'],
    types: ['creature'],
    subtypes: ['Beast'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 4,
    toughness: 4,
    oracleText: '',
  }),
  singleFace({
    name: 'SYNTHETIC Manifest Flier',
    manaCost: ['1', 'W'],
    types: ['creature'],
    subtypes: ['Bird'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 1,
    toughness: 3,
    oracleText: 'Flying',
    abilities: [{ kind: 'keyword', keyword: { kind: 'flying' } }],
  }),
  singleFace({
    name: 'SYNTHETIC Manifest Variable',
    manaCost: ['X', 'G'],
    types: ['creature'],
    subtypes: ['Elemental'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 2,
    toughness: 2,
    oracleText: '',
  }),
  // "This creature enters tapped. This creature enters with a +1/+1 counter on it. When this creature enters, you gain 3 life."
  singleFace({
    name: 'SYNTHETIC Manifest Laggard',
    manaCost: ['2', 'G'],
    types: ['creature'],
    subtypes: ['Beast'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 3,
    toughness: 3,
    oracleText:
      'This creature enters tapped. This creature enters with a +1/+1 counter on it. When this creature enters, you gain 3 life.',
    abilities: [
      { kind: 'replacement', replacement: { kind: 'entersTapped' } },
      {
        kind: 'replacement',
        replacement: { kind: 'entersWithCounters', counter: '+1/+1', count: 1 },
      },
      entersTrigger({ kind: 'gainLife', player: YOU, amount: 3 }),
    ],
  }),
  // "Other creatures you control get +1/+1."
  singleFace({
    name: 'SYNTHETIC Manifest Lord',
    manaCost: ['1', 'W', 'W'],
    types: ['creature'],
    subtypes: ['Soldier'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 2,
    toughness: 2,
    oracleText: 'Other creatures you control get +1/+1.',
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'modifyPt',
          subject: {
            kind: 'filter',
            filter: { types: ['creature'], controller: 'you' },
            other: true,
          },
          power: 1,
          toughness: 1,
        },
      },
    ],
  }),
  // A creature card with no mana cost: it can't be turned face up (CR 701.40b).
  singleFace({
    name: 'SYNTHETIC Manifest Costless',
    manaCost: null,
    types: ['creature'],
    subtypes: ['Spirit'],
    colors: [],
    colorIdentity: [],
    power: 3,
    toughness: 3,
    oracleText: '',
  }),
  // "Whenever another creature enters under your control, you gain 1 life."
  singleFace({
    name: 'SYNTHETIC Manifest Watcher',
    manaCost: ['2', 'U'],
    types: ['creature'],
    subtypes: ['Wizard'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 1,
    toughness: 3,
    oracleText: 'Whenever another creature enters under your control, you gain 1 life.',
    abilities: [
      {
        kind: 'triggered',
        trigger: {
          kind: 'entersBattlefield',
          what: { types: ['creature'], controller: 'you', other: true },
        },
        effect: { kind: 'gainLife', player: YOU, amount: 1 },
      },
    ],
  }),
  // "When this creature enters, manifest the top card of your library."
  singleFace({
    name: 'SYNTHETIC Manifest Maker',
    manaCost: ['3', 'G'],
    types: ['creature'],
    subtypes: ['Druid'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 3,
    toughness: 3,
    oracleText: 'When this creature enters, manifest the top card of your library.',
    abilities: [entersTrigger(manifestYours)],
  }),
  // A card that is not a creature card: it can be manifested but never turned face up.
  singleFace({
    name: 'SYNTHETIC Manifest Bolt',
    manaCost: ['R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'SYNTHETIC Manifest Bolt deals 2 damage to target creature.',
    spell: {
      targets: [CREATURE_TARGET],
      effect: { kind: 'dealDamage', amount: 2, to: T1 },
    },
  }),
  // "Exile target creature. Its controller manifests the top card of their library." (the shape of Reality Shift)
  singleFace({
    name: 'SYNTHETIC Manifest Shift',
    manaCost: ['1', 'U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Exile target creature. Its controller manifests the top card of their library.',
    spell: {
      targets: [CREATURE_TARGET],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'exile', objects: T1 },
          { kind: 'manifest', player: { kind: 'controllerOf', of: T1 } },
        ],
      },
    },
  }),
  // "Manifest the top card of your library."
  singleFace({
    name: 'SYNTHETIC Manifest Self',
    manaCost: ['2', 'G'],
    types: ['sorcery'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'Manifest the top card of your library.',
    spell: { effect: manifestYours },
  }),
  // "You manifest the top card of target opponent's library."
  singleFace({
    name: 'SYNTHETIC Manifest Theft',
    manaCost: ['2', 'B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: "Manifest the top card of target opponent's library.",
    spell: {
      targets: [OPPONENT_TARGET],
      effect: { kind: 'manifest', player: YOU, fromLibraryOf: T1 },
    },
  }),
  // "Each player manifests the top card of their library."
  singleFace({
    name: 'SYNTHETIC Manifest Everyone',
    manaCost: ['3', 'G'],
    types: ['sorcery'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'Each player manifests the top card of their library.',
    spell: { effect: { kind: 'manifest', player: { kind: 'eachPlayer' } } },
  }),
];
