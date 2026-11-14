/**
 * SYNTHETIC CARDS FOR GROUP 2 OF THE GISA DECK (issue 41, D-1410 to D-1417). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of what the real cards of the group need from the engine, written out by hand (the cards package checks that the grammar lowers the real Oracle text to
 * these same nodes): a creature with ward that costs mana and life, a lord of two creature types whose controller makes tokens when they commit a crime (once each turn), a creature
 * card that returns from the graveyard when its controller commits a crime, a creature that drains when its controller creates or sacrifices a token, a creature that draws when others
 * die (once each turn), and two helpers that commit a crime in the other two ways (an activated ability and a triggered ability that target).
 * Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability, ObjectFilter, TokenDefinition } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const YOU = { kind: 'you' } as const;
const THIS = { kind: 'this' } as const;

/** "A 2/2 blue and black Zombie Rogue creature token". */
const ZOMBIE_ROGUE: TokenDefinition = {
  name: 'Zombie Rogue',
  manaCost: null,
  supertypes: [],
  types: ['creature'],
  subtypes: ['Zombie', 'Rogue'],
  colors: ['U', 'B'],
  power: 2,
  toughness: 2,
  loyalty: null,
  defense: null,
  oracleText: '',
  abilities: [],
};

/** "A 1/1 black Rat creature token". */
const RAT: TokenDefinition = {
  name: 'Rat',
  manaCost: null,
  supertypes: [],
  types: ['creature'],
  subtypes: ['Rat'],
  colors: ['B'],
  power: 1,
  toughness: 1,
  loyalty: null,
  defense: null,
  oracleText: '',
  abilities: [],
};

/** "Skeletons and Zombies you control". */
const SKELETONS_AND_ZOMBIES: ObjectFilter = {
  anyOf: [{ subtypes: ['Skeleton'] }, { subtypes: ['Zombie'] }],
  controller: 'you',
};

const CREATURE_TARGET = {
  id: 't1',
  what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
} as const;

const DRAIN: Extract<Ability, { kind: 'triggered' }>['effect'] = {
  kind: 'loseLife',
  player: { kind: 'eachOpponent' },
  amount: 1,
};

export const SYNTHETIC_GISA_G2_LIST: readonly CardDefinition[] = [
  // "Ward—{2}, Pay 2 life.
  //  Skeletons and Zombies you control get +1/+1 and have menace.
  //  Whenever you commit a crime, create two tapped 2/2 blue and black Zombie Rogue creature tokens. This ability triggers only once each turn."
  singleFace({
    name: 'SYNTHETIC Crypt Warlock',
    manaCost: ['3', 'B', 'B'],
    supertypes: ['legendary'],
    types: ['creature'],
    subtypes: ['Human', 'Warlock'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 4,
    toughness: 4,
    oracleText:
      'Ward—{2}, Pay 2 life.\nSkeletons and Zombies you control get +1/+1 and have menace.\nWhenever you commit a crime, create two tapped 2/2 blue and black Zombie Rogue creature tokens. This ability triggers only once each turn.',
    abilities: [
      {
        kind: 'keyword',
        keyword: {
          kind: 'ward',
          cost: [
            { kind: 'mana', symbols: ['2'] },
            { kind: 'payLife', amount: 2 },
          ],
        },
      },
      {
        kind: 'static',
        static: {
          kind: 'modifyPt',
          subject: { kind: 'filter', filter: SKELETONS_AND_ZOMBIES },
          power: 1,
          toughness: 1,
        },
      },
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: { kind: 'filter', filter: SKELETONS_AND_ZOMBIES },
          keyword: { kind: 'menace' },
        },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'crimeCommitted', who: 'you' },
        effect: {
          kind: 'createToken',
          token: { kind: 'custom', definition: ZOMBIE_ROGUE },
          count: 2,
          tapped: true,
        },
        oncePerTurn: true,
      },
    ],
  }),
  // "This creature can't block.
  //  Whenever you commit a crime, you may pay {B}. If you do, return this card from your graveyard to the battlefield."
  singleFace({
    name: 'SYNTHETIC Restless Digger',
    manaCost: ['B'],
    types: ['creature'],
    subtypes: ['Skeleton', 'Rogue'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 2,
    toughness: 2,
    oracleText:
      "This creature can't block.\nWhenever you commit a crime, you may pay {B}. If you do, return this card from your graveyard to the battlefield.",
    abilities: [
      { kind: 'static', static: { kind: 'restriction', subject: THIS, restriction: 'cantBlock' } },
      {
        kind: 'triggered',
        trigger: { kind: 'crimeCommitted', who: 'you' },
        effect: {
          kind: 'mayPay',
          cost: [{ kind: 'mana', symbols: ['B'] }],
          effect: { kind: 'moveToZone', objects: THIS, to: 'battlefield', controller: 'owner' },
        },
        functionsIn: 'graveyard',
      },
    ],
  }),
  // "Flying
  //  Whenever you create or sacrifice a token, each opponent loses 1 life."
  singleFace({
    name: 'SYNTHETIC Token Leech',
    manaCost: ['3', 'B'],
    types: ['creature'],
    subtypes: ['Bat'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 2,
    toughness: 3,
    oracleText: 'Flying\nWhenever you create or sacrifice a token, each opponent loses 1 life.',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'flying' } },
      {
        kind: 'triggered',
        trigger: { kind: 'tokenCreated', who: 'you' },
        effect: DRAIN,
      },
      {
        kind: 'triggered',
        trigger: { kind: 'permanentSacrificed', by: 'you', filter: { token: true } },
        effect: DRAIN,
      },
    ],
  }),
  // "Whenever one or more other creatures die, draw a card. This ability triggers only once each turn."
  singleFace({
    name: 'SYNTHETIC Grave Scholar',
    manaCost: ['2', 'B'],
    types: ['creature'],
    subtypes: ['Human', 'Rogue'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 1,
    toughness: 3,
    oracleText:
      'Whenever one or more other creatures die, draw a card. This ability triggers only once each turn.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'diesBatch', what: { types: ['creature'], other: true } },
        effect: { kind: 'draw', player: YOU, count: 1 },
        oncePerTurn: true,
      },
    ],
  }),
  // "{T}: ~ deals 1 damage to target creature." (an activated ability that targets: a crime when the creature is an opponent's)
  singleFace({
    name: 'SYNTHETIC Needle Rogue',
    manaCost: ['1', 'B'],
    types: ['creature'],
    subtypes: ['Human', 'Rogue'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 1,
    toughness: 1,
    oracleText: '{T}: ~ deals 1 damage to target creature.',
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }],
        targets: [CREATURE_TARGET],
        effect: { kind: 'dealDamage', amount: 1, to: { kind: 'target', id: 't1' } },
      },
    ],
  }),
  // "When this creature enters, ~ deals 1 damage to target creature." (a triggered ability that targets: a crime when the creature is an opponent's)
  singleFace({
    name: 'SYNTHETIC Entry Stinger',
    manaCost: ['2', 'B'],
    types: ['creature'],
    subtypes: ['Insect'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 1,
    toughness: 1,
    oracleText: 'When this creature enters, ~ deals 1 damage to target creature.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: THIS },
        targets: [CREATURE_TARGET],
        effect: { kind: 'dealDamage', amount: 1, to: { kind: 'target', id: 't1' } },
      },
    ],
  }),
  // "Create two 1/1 black Rat creature tokens." (a token maker, for the creation of tokens)
  singleFace({
    name: 'SYNTHETIC Rat Swarm',
    manaCost: ['1', 'B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Create two 1/1 black Rat creature tokens.',
    spell: {
      effect: { kind: 'createToken', token: { kind: 'custom', definition: RAT }, count: 2 },
    },
  }),
  // "Destroy all creatures." (the creatures die together, one event)
  singleFace({
    name: 'SYNTHETIC Grim Sweep',
    manaCost: ['2', 'B', 'B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Destroy all creatures.',
    spell: {
      effect: {
        kind: 'destroy',
        objects: { kind: 'each', filter: { zone: 'battlefield', types: ['creature'] } },
      },
    },
  }),
];
