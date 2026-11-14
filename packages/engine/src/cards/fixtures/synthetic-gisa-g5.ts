/**
 * SYNTHETIC CARDS FOR GROUP 5 OF THE GISA DECK (ISSUE 41, D-1440 TO D-1449 NUMBERS). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of what the group added to the engine: Decayed (CR 702.147: "can't block" and "when this creature attacks, sacrifice it at end of combat"), as a printed
 * keyword, as a keyword of a token, as a granted keyword and as a keyword counter (CR 122.1b), a token for each counter on the permanent that was sacrificed to pay the cost
 * (CR 113.7a), an intervening "if you control no creatures with decayed" (CR 603.4), a creature with cycling whose trigger counts the Zombies on the battlefield (CR 702.29c) and
 * a creature with escape that "escapes with two +1/+1 counters on it" (CR 702.138c). Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is
 * not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability, ObjectFilter, TokenDefinition } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { kw, singleFace } from './helpers';

const DECAYED_ZOMBIE: TokenDefinition = {
  name: 'Zombie',
  manaCost: null,
  supertypes: [],
  types: ['creature'],
  subtypes: ['Zombie'],
  colors: ['B'],
  power: 2,
  toughness: 2,
  loyalty: null,
  defense: null,
  oracleText: '',
  abilities: [kw('decayed')],
};

const T1 = { kind: 'target', id: 't1' } as const;
const CREATURE_TARGET = {
  id: 't1',
  what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
} as const;
const DECAYED_CREATURES: ObjectFilter = { types: ['creature'], keywords: ['decayed'] };

/** "{T}: Add {B}." and "Whenever a creature you control dies, put a corpse counter on this artifact." */
const CORPSE_ABILITIES: readonly Ability[] = [
  { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['B'] } },
  {
    kind: 'triggered',
    trigger: { kind: 'dies', what: { types: ['creature'], controller: 'you' } },
    effect: { kind: 'addCounters', objects: { kind: 'this' }, counter: 'corpse', count: 1 },
  },
];

export const SYNTHETIC_GISA_G5_LIST: readonly CardDefinition[] = [
  // "Decayed" (printed): a 2/2 Zombie.
  singleFace({
    name: 'SYNTHETIC Decayed Husk',
    manaCost: ['1', 'B'],
    types: ['creature'],
    subtypes: ['Zombie'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 2,
    toughness: 2,
    oracleText: 'Decayed',
    abilities: [kw('decayed')],
  }),
  // "Target creature gains decayed until end of turn."
  singleFace({
    name: 'SYNTHETIC Rot Touch',
    manaCost: ['B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Target creature gains decayed until end of turn.',
    spell: {
      targets: [CREATURE_TARGET],
      effect: {
        kind: 'grantKeyword',
        objects: T1,
        keyword: { kind: 'decayed' },
        duration: 'untilEndOfTurn',
      },
    },
  }),
  // "Put a decayed counter on target creature."
  singleFace({
    name: 'SYNTHETIC Rot Seed',
    manaCost: ['B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Put a decayed counter on target creature.',
    spell: {
      targets: [CREATURE_TARGET],
      effect: { kind: 'addCounters', objects: T1, counter: 'decayed', count: 1 },
    },
  }),
  // "{T}: Add {B}. Whenever a creature you control dies, put a corpse counter on this artifact. {1}{B}, {T}, Sacrifice this artifact: Create a 2/2 black Zombie creature token with
  // decayed for each corpse counter on this artifact."
  singleFace({
    name: 'SYNTHETIC Corpse Vault',
    manaCost: ['1', 'B'],
    types: ['artifact'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText:
      '{T}: Add {B}. Whenever a creature you control dies, put a corpse counter on this artifact. {1}{B}, {T}, Sacrifice this artifact: Create a 2/2 black Zombie creature token with decayed for each corpse counter on this artifact.',
    abilities: [
      ...CORPSE_ABILITIES,
      {
        kind: 'activated',
        cost: [
          { kind: 'mana', symbols: ['1', 'B'] },
          { kind: 'tap' },
          { kind: 'sacrifice', what: { kind: 'this' } },
        ],
        effect: {
          kind: 'createToken',
          token: { kind: 'custom', definition: DECAYED_ZOMBIE },
          count: { kind: 'countersOn', of: { kind: 'this' }, counter: 'corpse' },
        },
      },
    ],
  }),
  // "At the beginning of your end step, if you control no creatures with decayed, create a 2/2 black Zombie creature token with decayed."
  singleFace({
    name: 'SYNTHETIC Husk Raiser',
    manaCost: ['1', 'B'],
    types: ['creature'],
    subtypes: ['Human', 'Wizard'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 1,
    toughness: 1,
    oracleText:
      'At the beginning of your end step, if you control no creatures with decayed, create a 2/2 black Zombie creature token with decayed.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'endStep', whose: 'you' },
        interveningIf: {
          kind: 'not',
          term: {
            kind: 'controlsAtLeast',
            filter: DECAYED_CREATURES,
            count: 1,
          },
        },
        effect: {
          kind: 'createToken',
          token: { kind: 'custom', definition: DECAYED_ZOMBIE },
          count: 1,
        },
      },
    ],
  }),
  // "Cycling {B}{B}. When you cycle this card, you may have target player lose life equal to the number of Zombies on the battlefield."
  singleFace({
    name: 'SYNTHETIC Rot Cycler',
    manaCost: ['4', 'B'],
    types: ['creature'],
    subtypes: ['Zombie'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 4,
    toughness: 3,
    oracleText:
      'Cycling {B}{B}. When you cycle this card, you may have target player lose life equal to the number of Zombies on the battlefield.',
    abilities: [
      {
        kind: 'keyword',
        keyword: { kind: 'cycling', cost: [{ kind: 'mana', symbols: ['B', 'B'] }] },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'cycled' },
        targets: [{ id: 't1', what: { kind: 'player', filter: 'any' } }],
        effect: {
          kind: 'loseLife',
          player: T1,
          amount: { kind: 'countOf', filter: { subtypes: ['Zombie'] } },
        },
        optional: true,
      },
    ],
  }),
  // "Escape—{1}{B}, Exile two other cards from your graveyard. This creature escapes with two +1/+1 counters on it."
  singleFace({
    name: 'SYNTHETIC Grave Strider',
    manaCost: ['2', 'B'],
    types: ['creature'],
    subtypes: ['Horror'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 3,
    toughness: 2,
    oracleText:
      'Escape—{1}{B}, Exile two other cards from your graveyard. This creature escapes with two +1/+1 counters on it.',
    alternativeCosts: [{ kind: 'escape', cost: [{ kind: 'mana', symbols: ['1', 'B'] }], exile: 2 }],
    abilities: [
      {
        kind: 'replacement',
        replacement: { kind: 'entersWithCounters', counter: '+1/+1', count: 2, ifEscaped: true },
      },
    ],
  }),
];
