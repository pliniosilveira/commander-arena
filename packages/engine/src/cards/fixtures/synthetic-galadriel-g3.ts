/**
 * SYNTHETIC CARDS FOR GROUP 3 OF THE GALADRIEL DECK (issue 43, D-1620 to D-1629 numbers). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of what the real cards of the group need from the engine, written out by hand (the cards package checks that the grammar lowers the real Oracle text to
 * these same nodes): a modal instant that gives a permanent hexproof and indestructible or makes a Pilot token that counts more for crewing, an enchantment that exchanges control of
 * itself and another permanent, a sorcery that exchanges control of two target creatures, a planeswalker with kicker whose enters trigger makes a non-legendary copy with loyalty 1 and whose
 * 0 ability draws and reveals a card and removes loyalty equal to its mana value, a legendary creature that makes a token each upkeep and sacrifices a Serpent to tap a permanent
 * and stop its activated abilities or to be indestructible, a sorcery with buyback that scries 3, an enchantment that rolls a d4 at upkeep, scries that many and draws on a die's
 * highest natural result, and an instant that puts X counters on a creature and counters a spell unless its controller pays mana equal to the greatest power among creatures. Names
 * start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability, Effect, SpellMode, TargetSpec } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const YOU = { kind: 'you' } as const;
const THIS = { kind: 'this' } as const;
const T1 = { kind: 'target', id: 't1' } as const;

/** "The Pilot": a 1/1 colorless Pilot creature token that crews Vehicles as though its power were 2 greater. */
export const PILOT_TOKEN_TEXT =
  'This creature saddles Mounts and crews Vehicles as though its power were 2 greater.';

/** "Target permanent you control gains hexproof and indestructible until end of turn." */
export const SHIELD_MODE: SpellMode = {
  text: 'Target permanent you control gains hexproof and indestructible until end of turn.',
  targets: [
    {
      id: 't1',
      what: { kind: 'object', filter: { zone: 'battlefield', controller: 'you' } },
    },
  ],
  effect: {
    kind: 'sequence',
    effects: [
      {
        kind: 'grantKeyword',
        objects: T1,
        keyword: { kind: 'hexproof' },
        duration: 'untilEndOfTurn',
      },
      {
        kind: 'grantKeyword',
        objects: T1,
        keyword: { kind: 'indestructible' },
        duration: 'untilEndOfTurn',
      },
    ],
  },
};

/** "Create a 1/1 colorless Pilot creature token with \"This creature saddles Mounts and crews Vehicles as though its power were 2 greater.\"" */
export const PILOT_MODE: SpellMode = {
  text: 'Create a 1/1 colorless Pilot creature token with "This creature saddles Mounts and crews Vehicles as though its power were 2 greater."',
  effect: {
    kind: 'createToken',
    token: {
      kind: 'custom',
      definition: {
        name: 'Pilot',
        manaCost: null,
        supertypes: [],
        types: ['creature'],
        subtypes: ['Pilot'],
        colors: [],
        power: 1,
        toughness: 1,
        loyalty: null,
        defense: null,
        oracleText: PILOT_TOKEN_TEXT,
        abilities: [{ kind: 'static', static: { kind: 'crewSaddleBonus', amount: 2 } }],
      },
    },
    count: 1,
  },
};

/** "{5}{U}: Exchange control of this enchantment and target nonland permanent. Activate only as a sorcery." */
export const EXCHANGE_ABILITY: Ability = {
  kind: 'activated',
  cost: [{ kind: 'mana', symbols: ['5', 'U'] }],
  targets: [
    {
      id: 't1',
      what: { kind: 'object', filter: { zone: 'battlefield', notTypes: ['land'] } },
    },
  ],
  timing: 'sorcery',
  effect: { kind: 'exchangeControl', first: THIS, second: T1 },
};

/** "Kicker {2}. When this enters, if it was kicked, create a token that's a copy of it, except it's not legendary and its starting loyalty is 1." */
export const KICKER_TWO: Ability = {
  kind: 'keyword',
  keyword: { kind: 'kicker', cost: [{ kind: 'mana', symbols: ['2'] }] },
};
export const ENTERS_KICKED_COPY: Ability = {
  kind: 'triggered',
  trigger: { kind: 'entersBattlefield', what: THIS },
  interveningIf: { kind: 'kicked' },
  effect: {
    kind: 'createToken',
    token: { kind: 'copyOf', object: THIS, notLegendary: true, startingLoyalty: 1 },
    count: 1,
  },
};

/** "0: Draw a card and reveal it. Remove a number of loyalty counters equal to that card's mana value from this planeswalker." */
export const DRAW_REVEAL_REMOVE: Ability = {
  kind: 'activated',
  cost: [{ kind: 'loyalty', change: 0 }],
  effect: {
    kind: 'sequence',
    effects: [
      { kind: 'draw', player: YOU, count: 1, reveal: true },
      {
        kind: 'removeCounters',
        objects: THIS,
        counter: 'loyalty',
        count: { kind: 'manaValueOf', of: { kind: 'moved' } },
      },
    ],
  },
};

/** The token of the upkeep trigger: a 3/3 blue Serpent creature token named for its maker's coil. */
export const COIL_TOKEN_NAME = 'SYNTHETIC Coil';
const COIL_TOKEN: Effect = {
  kind: 'createToken',
  token: {
    kind: 'custom',
    definition: {
      name: COIL_TOKEN_NAME,
      manaCost: null,
      supertypes: [],
      types: ['creature'],
      subtypes: ['Serpent'],
      colors: ['U'],
      power: 3,
      toughness: 3,
      loyalty: null,
      defense: null,
      oracleText: '',
      abilities: [],
    },
  },
  count: 1,
};

/** "Sacrifice another Serpent: Choose one — • Tap target permanent. Its activated abilities can't be activated this turn. • This creature gains indestructible until end of turn." */
export const SACRIFICE_SERPENT_MODAL: Ability = {
  kind: 'activated',
  cost: [{ kind: 'sacrifice', what: { subtypes: ['Serpent'], other: true } }],
  chooseModes: { min: 1, max: 1 },
  modes: [
    {
      text: "Tap target permanent. Its activated abilities can't be activated this turn.",
      targets: [{ id: 't1', what: { kind: 'object', filter: { zone: 'battlefield' } } }],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'tap', objects: T1 },
          {
            kind: 'restrict',
            objects: T1,
            restriction: 'cantActivateAbilities',
            duration: 'untilEndOfTurn',
          },
        ],
      },
    },
    {
      text: 'This creature gains indestructible until end of turn.',
      effect: {
        kind: 'grantKeyword',
        objects: THIS,
        keyword: { kind: 'indestructible' },
        duration: 'untilEndOfTurn',
      },
    },
  ],
  effect: { kind: 'sequence', effects: [] },
};

/** "At the beginning of your upkeep, roll a d4. Scry X, where X is the result." */
export const UPKEEP_ROLL_SCRY: Ability = {
  kind: 'triggered',
  trigger: { kind: 'upkeep', whose: 'you' },
  effect: {
    kind: 'sequence',
    effects: [
      { kind: 'rollDie', sides: 4 },
      { kind: 'scry', count: { kind: 'dieResult' } },
    ],
  },
};

/** "Whenever you roll a die's highest natural result, draw a card." */
export const HIGHEST_DRAWS: Ability = {
  kind: 'triggered',
  trigger: { kind: 'rollsHighest', who: 'you' },
  effect: { kind: 'draw', player: YOU, count: 1 },
};

/** "Put X +1/+1 counters on target creature you control. Then counter up to one target spell unless its controller pays mana equal to the greatest power among creatures you control." */
export const MUTATION_TARGETS: readonly TargetSpec[] = [
  {
    id: 't1',
    what: {
      kind: 'object',
      filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
    },
  },
  {
    id: 't2',
    what: { kind: 'object', filter: { zone: 'stack', stackKind: 'spell' } },
    min: 0,
    max: 1,
  },
];
export const MUTATION_EFFECT: Effect = {
  kind: 'sequence',
  effects: [
    { kind: 'addCounters', objects: T1, counter: '+1/+1', count: { kind: 'x' } },
    {
      kind: 'counterUnlessPays',
      objects: { kind: 'target', id: 't2' },
      cost: [],
      genericAmount: {
        kind: 'aggregate',
        how: 'greatest',
        stat: 'power',
        filter: { types: ['creature'], controller: 'you' },
      },
    },
  ],
};

export const SYNTHETIC_GALADRIEL_G3_LIST: readonly CardDefinition[] = [
  // "Choose one — • Target permanent you control gains hexproof and indestructible until end of turn. • Create a 1/1 colorless Pilot creature token with ..."
  singleFace({
    name: 'SYNTHETIC Rider Shield',
    manaCost: ['G'],
    types: ['instant'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: `Choose one —\n• ${SHIELD_MODE.text}\n• ${PILOT_MODE.text}`,
    spell: { chooseModes: { min: 1, max: 1 }, modes: [SHIELD_MODE, PILOT_MODE] },
  }),
  // "At the beginning of your upkeep, scry 1. {5}{U}: Exchange control of this enchantment and target nonland permanent. Activate only as a sorcery."
  singleFace({
    name: 'SYNTHETIC Swap Eyes',
    manaCost: ['2', 'U'],
    types: ['enchantment'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText:
      'At the beginning of your upkeep, scry 1.\n{5}{U}: Exchange control of this enchantment and target nonland permanent. Activate only as a sorcery.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'upkeep', whose: 'you' },
        effect: { kind: 'scry', count: 1 },
      },
      EXCHANGE_ABILITY,
    ],
  }),
  // "Exchange control of two target creatures."
  singleFace({
    name: 'SYNTHETIC Swap Pair',
    manaCost: ['3', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Exchange control of two target creatures.',
    spell: {
      targets: [
        {
          id: 't1',
          what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
        },
        {
          id: 't2',
          what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
        },
      ],
      effect: { kind: 'exchangeControl', first: T1, second: { kind: 'target', id: 't2' } },
    },
  }),
  // "Kicker {2}. When this planeswalker enters, if it was kicked, create a token that's a copy of it, except it's not legendary and its starting loyalty is 1. +1: Scry 2.
  // 0: Draw a card and reveal it. Remove a number of loyalty counters equal to that card's mana value from this planeswalker."
  singleFace({
    name: 'SYNTHETIC Mirror Walker',
    manaCost: ['1', 'U', 'U'],
    supertypes: ['legendary'],
    types: ['planeswalker'],
    subtypes: ['Jace'],
    colors: ['U'],
    colorIdentity: ['U'],
    loyalty: 4,
    oracleText:
      "Kicker {2}\nWhen this planeswalker enters, if it was kicked, create a token that's a copy of it, except it's not legendary and its starting loyalty is 1.\n+1: Scry 2.\n0: Draw a card and reveal it. Remove a number of loyalty counters equal to that card's mana value from this planeswalker.",
    abilities: [
      KICKER_TWO,
      ENTERS_KICKED_COPY,
      {
        kind: 'activated',
        cost: [{ kind: 'loyalty', change: 1 }],
        effect: { kind: 'scry', count: 2 },
      },
      DRAW_REVEAL_REMOVE,
    ],
  }),
  // "This spell can't be countered. At the beginning of each upkeep, create a 3/3 blue Serpent creature token. Sacrifice another Serpent: Choose one — ..."
  singleFace({
    name: 'SYNTHETIC Coil Titan',
    manaCost: ['3', 'G', 'G', 'U', 'U'],
    supertypes: ['legendary'],
    types: ['creature'],
    subtypes: ['Serpent'],
    colors: ['U', 'G'],
    colorIdentity: ['U', 'G'],
    power: 6,
    toughness: 6,
    oracleText: `This spell can't be countered.\nAt the beginning of each upkeep, create ${COIL_TOKEN_NAME}, a 3/3 blue Serpent creature token.\nSacrifice another Serpent: Choose one —\n• ${SACRIFICE_SERPENT_MODAL.modes?.[0]?.text ?? ''}\n• ${SACRIFICE_SERPENT_MODAL.modes?.[1]?.text ?? ''}`,
    abilities: [
      {
        kind: 'static',
        static: { kind: 'restriction', subject: THIS, restriction: 'cantBeCountered' },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'upkeep', whose: 'each' },
        effect: COIL_TOKEN,
      },
      SACRIFICE_SERPENT_MODAL,
    ],
  }),
  // "Buyback {2}. Scry 3."
  singleFace({
    name: 'SYNTHETIC Buyback Peek',
    manaCost: ['U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Buyback {2}\nScry 3.',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'buyback', cost: [{ kind: 'mana', symbols: ['2'] }] } },
    ],
    spell: { effect: { kind: 'scry', count: 3 } },
  }),
  // "At the beginning of your upkeep, roll a d4. Scry X, where X is the result. Whenever you roll a die's highest natural result, draw a card."
  singleFace({
    name: 'SYNTHETIC Die Ward',
    manaCost: ['3', 'U'],
    types: ['enchantment'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText:
      "At the beginning of your upkeep, roll a d4. Scry X, where X is the result.\nWhenever you roll a die's highest natural result, draw a card.",
    abilities: [UPKEEP_ROLL_SCRY, HIGHEST_DRAWS],
  }),
  // "Destroy target enchantment." (what the tests answer an ability of an enchantment with)
  singleFace({
    name: 'SYNTHETIC Break Enchantment',
    manaCost: ['R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Destroy target enchantment.',
    spell: {
      targets: [
        {
          id: 't1',
          what: { kind: 'object', filter: { zone: 'battlefield', types: ['enchantment'] } },
        },
      ],
      effect: { kind: 'destroy', objects: T1 },
    },
  }),
  // A Serpent for the tests to sacrifice.
  singleFace({
    name: 'SYNTHETIC Garden Serpent',
    manaCost: ['1', 'U'],
    types: ['creature'],
    subtypes: ['Serpent'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 2,
    toughness: 2,
    oracleText: '',
  }),
  // "Target permanent's activated abilities can't be activated this turn." (the second half of the first mode of the Serpent, with no tap)
  singleFace({
    name: 'SYNTHETIC Lock Abilities',
    manaCost: ['U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: "Target permanent's activated abilities can't be activated this turn.",
    spell: {
      targets: [{ id: 't1', what: { kind: 'object', filter: { zone: 'battlefield' } } }],
      effect: {
        kind: 'restrict',
        objects: T1,
        restriction: 'cantActivateAbilities',
        duration: 'untilEndOfTurn',
      },
    },
  }),
  // "Put X +1/+1 counters on target creature you control. Then counter up to one target spell unless its controller pays mana equal to the greatest power among creatures you control."
  singleFace({
    name: 'SYNTHETIC Mutation Counter',
    manaCost: ['X', 'G', 'U'],
    types: ['instant'],
    colors: ['U', 'G'],
    colorIdentity: ['U', 'G'],
    oracleText:
      'Put X +1/+1 counters on target creature you control. Then counter up to one target spell unless its controller pays mana equal to the greatest power among creatures you control.',
    spell: { x: true, targets: MUTATION_TARGETS, effect: MUTATION_EFFECT },
  }),
];
