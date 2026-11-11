/**
 * SYNTHETIC CARDS FOR PLAYER EFFECTS WITH AMOUNTS, ONE-SIDED DAMAGE AND DESIGNATION CONDITIONS. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests and the soak games of D-131: several players in one selector ("you and target opponent each
 * draw"), "each player sacrifices N creatures of their choice", what an earlier instruction did ("for each creature
 * sacrificed this way", "for each opponent who drew a card this way"), mill (CR 701.17), a creature that deals damage
 * without taking any back (a "bite", CR 120.3) and the conditions "if you're the monarch" and "if an opponent has more
 * life than you". Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not
 * Oracle text, and none of these is the definition of a real card.
 */
import type {
  Ability,
  Amount,
  Effect,
  ObjectFilter,
  TargetSpec,
  TokenDefinition,
} from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';
import { ZOMBIE_TOKEN } from './synthetic-amounts';

const YOU = { kind: 'you' } as const;
const THIS = { kind: 'this' } as const;
const T1 = { kind: 'target', id: 't1' } as const;
const T2 = { kind: 'target', id: 't2' } as const;
const CREATURES: ObjectFilter = { types: ['creature'] };
const ZOMBIES_YOU: ObjectFilter = { types: ['creature'], subtypes: ['Zombie'], controller: 'you' };

/** "A 4/4 red Dragon creature token with flying." */
const DRAGON_TOKEN: TokenDefinition = {
  name: 'Dragon',
  manaCost: null,
  supertypes: [],
  types: ['creature'],
  subtypes: ['Dragon'],
  colors: ['R'],
  power: 4,
  toughness: 4,
  loyalty: null,
  defense: null,
  oracleText: 'Flying',
  abilities: [{ kind: 'keyword', keyword: { kind: 'flying' } }],
};

/** "A 1/1 white Spirit creature token with flying." */
const SPIRIT_TOKEN: TokenDefinition = {
  name: 'Spirit',
  manaCost: null,
  supertypes: [],
  types: ['creature'],
  subtypes: ['Spirit'],
  colors: ['W'],
  power: 1,
  toughness: 1,
  loyalty: null,
  defense: null,
  oracleText: 'Flying',
  abilities: [{ kind: 'keyword', keyword: { kind: 'flying' } }],
};

/** "A 4/4 white Angel creature token with flying." */
const ANGEL_TOKEN: TokenDefinition = {
  ...SPIRIT_TOKEN,
  name: 'Angel',
  subtypes: ['Angel'],
  power: 4,
  toughness: 4,
};

const spell = (
  name: string,
  manaCost: string[],
  color: 'W' | 'U' | 'B' | 'R' | 'G',
  oracleText: string,
  body: { targets?: TargetSpec[]; effect: Effect },
  type: 'instant' | 'sorcery' = 'sorcery',
): CardDefinition =>
  singleFace({
    name,
    manaCost,
    types: [type],
    colors: [color],
    colorIdentity: [color],
    oracleText,
    spell: body,
  });

const creature = (
  name: string,
  manaCost: string[],
  color: 'W' | 'U' | 'B' | 'R' | 'G',
  subtype: string,
  power: number,
  toughness: number,
  oracleText: string,
  abilities: readonly Ability[],
): CardDefinition =>
  singleFace({
    name,
    manaCost,
    types: ['creature'],
    subtypes: [subtype],
    colors: [color],
    colorIdentity: [color],
    power,
    toughness,
    oracleText,
    abilities,
  });

const enters = (
  effect: Effect,
  interveningIf?: Extract<Ability, { kind: 'triggered' }>['interveningIf'],
): Ability => ({
  kind: 'triggered',
  trigger: { kind: 'entersBattlefield', what: THIS },
  effect,
  ...(interveningIf === undefined ? {} : { interveningIf }),
});

const upkeep = (
  effect: Effect,
  interveningIf?: Extract<Ability, { kind: 'triggered' }>['interveningIf'],
): Ability => ({
  kind: 'triggered',
  trigger: { kind: 'upkeep', whose: 'you' },
  effect,
  ...(interveningIf === undefined ? {} : { interveningIf }),
});

const sacrificeChoose = (
  player: Extract<Effect, { kind: 'sacrifice' }>['player'],
  count: Amount,
  filter: ObjectFilter = CREATURES,
): Effect => ({
  kind: 'sacrifice',
  objects: { kind: 'choose', filter, count },
  ...(player === undefined ? {} : { player }),
});

const OPPONENT_TARGET: TargetSpec = { id: 't1', what: { kind: 'player', filter: 'opponent' } };
const MY_CREATURE: TargetSpec = {
  id: 't1',
  what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'], controller: 'you' } },
};
const THEIR_CREATURE_OR_WALKER: TargetSpec = {
  id: 't2',
  what: {
    kind: 'object',
    filter: {
      zone: 'battlefield',
      controller: 'opponent',
      anyOf: [{ types: ['creature'] }, { types: ['planeswalker'] }],
    },
  },
};
const ANY_TARGET: TargetSpec = { id: 't1', what: { kind: 'anyTarget' } };

const MONARCH_YOU = {
  kind: 'playerHasDesignation',
  player: YOU,
  designation: 'monarch',
} as const;

export const SYNTHETIC_PLAYER_EFFECT_LIST: readonly CardDefinition[] = [
  // ---- Several players in one selector
  // "You and target opponent each draw two cards."
  spell(
    'SYNTHETIC Shared Rendezvous',
    ['2', 'U'],
    'U',
    'You and target opponent each draw two cards.',
    {
      targets: [OPPONENT_TARGET],
      effect: { kind: 'draw', player: { kind: 'all', of: [YOU, T1] }, count: 2 },
    },
  ),
  // "You and each opponent each gain 3 life." (two selectors that name the same player: it acts once)
  spell('SYNTHETIC Overlapping Feast', ['2', 'W'], 'W', 'You and each player each gain 3 life.', {
    effect: {
      kind: 'gainLife',
      player: { kind: 'all', of: [YOU, { kind: 'eachPlayer' }] },
      amount: 3,
    },
  }),
  // "You and target opponent each mill two cards."
  spell(
    'SYNTHETIC Shared Mill',
    ['1', 'U'],
    'U',
    'You and target opponent each mill two cards.',
    {
      targets: [OPPONENT_TARGET],
      effect: { kind: 'mill', player: { kind: 'all', of: [YOU, T1] }, count: 2 },
    },
    'instant',
  ),
  // "You and target opponent each sacrifice a creature."
  spell(
    'SYNTHETIC Shared Sacrifice',
    ['1', 'B'],
    'B',
    'You and target opponent each sacrifice a creature.',
    {
      targets: [OPPONENT_TARGET],
      effect: sacrificeChoose({ kind: 'all', of: [YOU, T1] }, 1),
    },
    'instant',
  ),
  // "Target creature gets +3/+3 until end of turn."
  spell(
    'SYNTHETIC Mighty Pump',
    ['G'],
    'G',
    'Target creature gets +3/+3 until end of turn.',
    {
      targets: [
        {
          id: 't1',
          what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
        },
      ],
      effect: { kind: 'modifyPt', objects: T1, power: 3, toughness: 3, duration: 'untilEndOfTurn' },
    },
    'instant',
  ),
  // "Each opponent draws a card, then you draw a card for each opponent who drew a card this way."
  spell(
    'SYNTHETIC Cut a Deal Cousin',
    ['2', 'W'],
    'W',
    'Each opponent draws a card, then you draw a card for each opponent who drew a card this way.',
    {
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'draw', player: { kind: 'eachOpponent' }, count: 1 },
          { kind: 'draw', player: YOU, count: { kind: 'thisWay', what: 'playersDrew' } },
        ],
      },
    },
  ),

  // "Each opponent draws two cards, then you draw a card for each opponent who drew a card this way."
  spell(
    'SYNTHETIC Double Deal',
    ['3', 'W'],
    'W',
    'Each opponent draws two cards, then you draw a card for each opponent who drew a card this way.',
    {
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'draw', player: { kind: 'eachOpponent' }, count: 2 },
          { kind: 'draw', player: YOU, count: { kind: 'thisWay', what: 'playersDrew' } },
        ],
      },
    },
  ),

  // ---- Each player sacrifices
  // "When ~ enters, each player sacrifices a creature of their choice."
  creature(
    'SYNTHETIC Bag Marauder',
    ['3', 'B'],
    'B',
    'Zombie',
    3,
    3,
    'When this enters, each player sacrifices a creature of their choice.',
    [enters(sacrificeChoose({ kind: 'eachPlayer' }, 1))],
  ),
  // "Each player sacrifices two creatures of their choice. You create a tapped 2/2 black Zombie creature token for each creature sacrificed this way."
  spell(
    'SYNTHETIC Necrotic Sweep',
    ['1', 'B'],
    'B',
    'Each player sacrifices two creatures of their choice. You create a tapped 2/2 black Zombie creature token for each creature sacrificed this way.',
    {
      effect: {
        kind: 'sequence',
        effects: [
          sacrificeChoose({ kind: 'eachPlayer' }, 2),
          {
            kind: 'createToken',
            token: { kind: 'custom', definition: ZOMBIE_TOKEN },
            count: { kind: 'thisWay', what: 'sacrificed' },
            tapped: true,
          },
        ],
      },
    },
  ),
  // "Each other player sacrifices a creature of their choice. You create a 2/2 black Zombie creature token for each creature sacrificed this way."
  spell(
    'SYNTHETIC Siphon Flesh Cousin',
    ['3', 'B'],
    'B',
    'Each other player sacrifices a creature of their choice. You create a 2/2 black Zombie creature token for each creature sacrificed this way.',
    {
      effect: {
        kind: 'sequence',
        effects: [
          sacrificeChoose({ kind: 'eachOpponent' }, 1),
          {
            kind: 'createToken',
            token: { kind: 'custom', definition: ZOMBIE_TOKEN },
            count: { kind: 'thisWay', what: 'sacrificed' },
          },
        ],
      },
    },
  ),
  // "Each opponent sacrifices X creatures of their choice, where X is the number of Zombies you control."
  spell(
    'SYNTHETIC Weighted Toll',
    ['2', 'B'],
    'B',
    'Each opponent sacrifices X creatures of their choice, where X is the number of Zombies you control.',
    {
      effect: sacrificeChoose({ kind: 'eachOpponent' }, { kind: 'countOf', filter: ZOMBIES_YOU }),
    },
  ),
  // "When ~ enters, destroy all Zombies. Put a +1/+1 counter on ~ for each creature destroyed this way."
  creature(
    'SYNTHETIC Hydra Reaper',
    ['3', 'G'],
    'G',
    'Hydra',
    2,
    2,
    'When this enters, destroy all Zombies. Put a +1/+1 counter on this for each creature destroyed this way.',
    [
      enters({
        kind: 'sequence',
        effects: [
          { kind: 'destroy', objects: { kind: 'each', filter: { subtypes: ['Zombie'] } } },
          {
            kind: 'addCounters',
            objects: THIS,
            counter: '+1/+1',
            count: { kind: 'thisWay', what: 'destroyed' },
          },
        ],
      }),
    ],
  ),

  // ---- Mill
  // "When ~ enters, mill two cards and you gain 2 life."
  creature(
    'SYNTHETIC Mire Merfolk',
    ['2', 'U'],
    'U',
    'Merfolk',
    2,
    2,
    'When this enters, mill two cards and you gain 2 life.',
    [
      enters({
        kind: 'sequence',
        effects: [
          { kind: 'mill', player: YOU, count: 2 },
          { kind: 'gainLife', player: YOU, amount: 2 },
        ],
      }),
    ],
  ),
  // "Each player mills X cards, where X is the number of creatures you control."
  spell(
    'SYNTHETIC Tide Mill',
    ['2', 'U'],
    'U',
    'Each player mills X cards, where X is the number of creatures you control.',
    {
      effect: {
        kind: 'mill',
        player: { kind: 'eachPlayer' },
        count: { kind: 'countOf', filter: { types: ['creature'], controller: 'you' } },
      },
    },
  ),

  // ---- One-sided damage from a creature
  // "Target creature you control deals damage equal to its power to target creature or planeswalker you don't control."
  spell(
    'SYNTHETIC Gnash Down',
    ['1', 'G'],
    'G',
    "Target creature you control deals damage equal to its power to target creature or planeswalker you don't control.",
    {
      targets: [MY_CREATURE, THEIR_CREATURE_OR_WALKER],
      effect: {
        kind: 'dealDamage',
        from: T1,
        amount: { kind: 'powerOf', of: T1 },
        to: T2,
      },
    },
  ),
  // "Whenever a creature you control enters, it deals damage equal to its power to any target."
  creature(
    'SYNTHETIC Surge Watcher',
    ['3', 'R'],
    'R',
    'Shaman',
    1,
    4,
    'Whenever a creature you control enters, it deals damage equal to its power to any target.',
    [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { types: ['creature'], controller: 'you' } },
        targets: [ANY_TARGET],
        effect: {
          kind: 'dealDamage',
          from: { kind: 'triggerSubject' },
          amount: { kind: 'powerOf', of: { kind: 'triggerSubject' } },
          to: T1,
        },
      },
    ],
  ),
  // "Whenever this or another Dragon you control enters, it deals X damage to any target, where X is the number of Dragons you control."
  creature(
    'SYNTHETIC Dragon Scourge',
    ['4', 'R', 'R'],
    'R',
    'Dragon',
    4,
    4,
    'Whenever this or another Dragon you control enters, it deals X damage to any target, where X is the number of Dragons you control.',
    [
      {
        kind: 'triggered',
        trigger: {
          kind: 'entersBattlefield',
          what: { types: ['creature'], subtypes: ['Dragon'], controller: 'you' },
        },
        targets: [ANY_TARGET],
        effect: {
          kind: 'dealDamage',
          from: { kind: 'triggerSubject' },
          amount: {
            kind: 'countOf',
            filter: { types: ['creature'], subtypes: ['Dragon'], controller: 'you' },
          },
          to: T1,
        },
      },
    ],
  ),
  // "Target creature you control deals damage equal to its power to itself." (a creature as its own recipient)
  spell(
    'SYNTHETIC Self Strike',
    ['R'],
    'R',
    'Target creature you control deals damage equal to its power to itself.',
    {
      targets: [MY_CREATURE],
      effect: { kind: 'dealDamage', from: T1, amount: { kind: 'powerOf', of: T1 }, to: T1 },
    },
  ),
  creature('SYNTHETIC Lifelink Hound', ['1', 'W'], 'W', 'Hound', 3, 2, 'Lifelink', [
    { kind: 'keyword', keyword: { kind: 'lifelink' } },
  ]),
  creature('SYNTHETIC Deathtouch Viper', ['B'], 'B', 'Snake', 1, 1, 'Deathtouch', [
    { kind: 'keyword', keyword: { kind: 'deathtouch' } },
  ]),
  creature('SYNTHETIC Wither Imp', ['R'], 'R', 'Imp', 2, 1, 'Wither', [
    { kind: 'keyword', keyword: { kind: 'wither' } },
  ]),

  // ---- Conditions about players
  // "At the beginning of your upkeep, if you're the monarch, create a 4/4 red Dragon creature token with flying."
  creature(
    'SYNTHETIC Skyline Tyrant',
    ['3', 'R', 'R'],
    'R',
    'Dragon',
    3,
    3,
    "When this enters, you become the monarch. At the beginning of your upkeep, if you're the monarch, create a 4/4 red Dragon creature token with flying.",
    [
      enters({ kind: 'becomeMonarch', player: YOU }),
      upkeep(
        { kind: 'createToken', token: { kind: 'custom', definition: DRAGON_TOKEN }, count: 1 },
        MONARCH_YOU,
      ),
    ],
  ),
  // "At the beginning of your upkeep, create a 1/1 white Spirit creature token with flying. If you're the monarch, create a 4/4 white Angel creature token with flying instead."
  singleFace({
    name: 'SYNTHETIC Court of Grace Cousin',
    manaCost: ['3', 'W', 'W'],
    types: ['enchantment'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText:
      "When this enters, you become the monarch. At the beginning of your upkeep, create a 1/1 white Spirit creature token with flying. If you're the monarch, create a 4/4 white Angel creature token with flying instead.",
    abilities: [
      enters({ kind: 'becomeMonarch', player: YOU }),
      upkeep({
        kind: 'conditional',
        condition: MONARCH_YOU,
        effect: {
          kind: 'createToken',
          token: { kind: 'custom', definition: ANGEL_TOKEN },
          count: 1,
        },
        else: {
          kind: 'createToken',
          token: { kind: 'custom', definition: SPIRIT_TOKEN },
          count: 1,
        },
      }),
    ],
  }),
  // "When ~ enters, if an opponent is the monarch, draw a card."
  creature(
    'SYNTHETIC Usurper Scout',
    ['1', 'U'],
    'U',
    'Scout',
    1,
    2,
    'When this enters, if an opponent is the monarch, draw a card.',
    [
      enters(
        { kind: 'draw', player: YOU, count: 1 },
        { kind: 'playerHasDesignation', player: { kind: 'eachOpponent' }, designation: 'monarch' },
      ),
    ],
  ),
  // "When ~ enters, if an opponent has more life than you, you gain 4 life."
  creature(
    'SYNTHETIC Envious Cleric',
    ['2', 'W'],
    'W',
    'Cleric',
    2,
    2,
    'When this enters, if an opponent has more life than you, you gain 4 life.',
    [
      enters(
        { kind: 'gainLife', player: YOU, amount: 4 },
        {
          kind: 'amountIs',
          amount: { kind: 'opponentsWithMore', stat: 'life' },
          compare: { cmp: 'atLeast', value: 1 },
        },
      ),
    ],
  ),
  // "When ~ enters, if an opponent controls more creatures than you, create a 4/4 white Angel creature token with flying."
  creature(
    'SYNTHETIC Outnumbered Priest',
    ['3', 'W'],
    'W',
    'Cleric',
    2,
    2,
    'When this enters, if an opponent controls more creatures than you, create a 4/4 white Angel creature token with flying.',
    [
      enters(
        { kind: 'createToken', token: { kind: 'custom', definition: ANGEL_TOKEN }, count: 1 },
        {
          kind: 'amountIs',
          amount: { kind: 'opponentsWithMore', stat: 'creatures' },
          compare: { cmp: 'atLeast', value: 1 },
        },
      ),
    ],
  ),

  // ---- Added for the mutation check of D-131: the selector in every slot that takes a player, in an instant, so that a
  // player who is not the active one can cast it.
  // "Each player sacrifices a creature of their choice." (an instant)
  spell(
    'SYNTHETIC Instant Culling',
    ['1', 'B'],
    'B',
    'Each player sacrifices a creature of their choice.',
    { effect: sacrificeChoose({ kind: 'eachPlayer' }, 1) },
    'instant',
  ),
  // "This spell deals 2 damage to you and target opponent."
  spell(
    'SYNTHETIC Shared Burn',
    ['1', 'R'],
    'R',
    'This spell deals 2 damage to you and target opponent.',
    {
      targets: [OPPONENT_TARGET],
      effect: { kind: 'dealDamage', amount: 2, to: { kind: 'all', of: [YOU, T1] } },
    },
    'instant',
  ),
  // "Prevent all damage that would be dealt to you and target opponent this turn."
  spell(
    'SYNTHETIC Shared Ward',
    ['1', 'W'],
    'W',
    'Prevent all damage that would be dealt to you and target opponent this turn.',
    {
      targets: [OPPONENT_TARGET],
      effect: {
        kind: 'preventDamage',
        scope: 'all',
        amount: 'all',
        to: { kind: 'all', of: [YOU, T1] },
        duration: 'untilEndOfTurn',
      },
    },
    'instant',
  ),
  // "Target creature you control deals 3 damage to target creature you don't control."
  spell(
    'SYNTHETIC Flat Bite',
    ['G'],
    'G',
    "Target creature you control deals 3 damage to target creature you don't control.",
    {
      targets: [MY_CREATURE, THEIR_CREATURE_OR_WALKER],
      effect: { kind: 'dealDamage', from: T1, amount: 3, to: T2 },
    },
    'instant',
  ),
];
