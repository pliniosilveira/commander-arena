/**
 * SYNTHETIC CARDS FOR COUNTED AMOUNTS, "WHERE X IS" AND TOKEN CREATION. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests and the soak games of D-131: the amounts that read the game ("the number of Zombies you
 * control", "half the number of ..., rounded down", "the greatest power among creatures you control", "your devotion
 * to black", "the number of colors in your commander's color identity", "that creature's toughness", "for each +1/+1
 * counter on it", "the number of creatures attacking you", "for each opponent who has more cards in hand than you"),
 * an amount compared with a number ("if creatures you control have total power 8 or greater"), "X is ..." text
 * (CR 107.3c) and tokens that enter tapped. Names start with "SYNTHETIC "; oracleId is null. The text describes what
 * the AST does; it is not Oracle text, and none of these is the definition of a real card.
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

const YOU = { kind: 'you' } as const;
const EACH_OPPONENT = { kind: 'eachOpponent' } as const;
const THIS = { kind: 'this' } as const;
const END = 'untilEndOfTurn' as const;

const ZOMBIES_YOU: ObjectFilter = { types: ['creature'], subtypes: ['Zombie'], controller: 'you' };
const CREATURES_YOU: ObjectFilter = { types: ['creature'], controller: 'you' };
const countOf = (filter: ObjectFilter): Amount => ({ kind: 'countOf', filter });

/** "A 2/2 black Zombie creature token". */
export const ZOMBIE_TOKEN: TokenDefinition = {
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
  abilities: [],
};

/** "A 1/2 green Spider creature token with reach". */
export const SPIDER_TOKEN: TokenDefinition = {
  name: 'Spider',
  manaCost: null,
  supertypes: [],
  types: ['creature'],
  subtypes: ['Spider'],
  colors: ['G'],
  power: 1,
  toughness: 2,
  loyalty: null,
  defense: null,
  oracleText: 'Reach',
  abilities: [{ kind: 'keyword', keyword: { kind: 'reach' } }],
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

const upkeep = (effect: Effect): Ability => ({
  kind: 'triggered',
  trigger: { kind: 'upkeep', whose: 'you' },
  effect,
});

export const SYNTHETIC_AMOUNT_LIST: readonly CardDefinition[] = [
  // A two-color commander for the color identity.
  singleFace({
    name: 'SYNTHETIC Czar of Two Colors',
    manaCost: ['1', 'W', 'U'],
    supertypes: ['legendary'],
    types: ['creature'],
    subtypes: ['Sphinx'],
    colors: ['W', 'U'],
    colorIdentity: ['W', 'U'],
    power: 3,
    toughness: 3,
    oracleText: 'A commander with two colors.',
  }),
  // A plain Zombie to count.
  singleFace({
    name: 'SYNTHETIC Plain Zombie',
    manaCost: ['1', 'B'],
    types: ['creature'],
    subtypes: ['Zombie'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 2,
    toughness: 2,
    oracleText: '',
  }),
  // ---- "X is ...": X defined by the text (CR 107.3c), written by putting the definition in each place X is read.
  // "At the beginning of your upkeep, you draw X cards and lose X life, where X is the number of Zombies you control."
  singleFace({
    name: 'SYNTHETIC Zombie Mourner',
    manaCost: ['1', 'B'],
    types: ['creature'],
    subtypes: ['Zombie'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 2,
    toughness: 2,
    oracleText:
      'At the beginning of your upkeep, you draw X cards and lose X life, where X is the number of Zombies you control.',
    abilities: [
      upkeep({
        kind: 'sequence',
        effects: [
          { kind: 'draw', player: YOU, count: countOf(ZOMBIES_YOU) },
          { kind: 'loseLife', player: YOU, amount: countOf(ZOMBIES_YOU) },
        ],
      }),
    ],
  }),
  // "Sacrifice a Zombie. Then you draw X cards, where X is the number of Zombies you control." (X is read after the
  // sacrifice, as the draw runs: CR 107.3c, "the value of X may change while that spell or ability is on the stack".)
  spell(
    'SYNTHETIC Zombie Toll',
    ['B'],
    'B',
    'Sacrifice a Zombie. Then draw X cards, where X is the number of Zombies you control.',
    {
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'sacrifice',
            objects: { kind: 'choose', filter: { types: ['creature'], subtypes: ['Zombie'] } },
          },
          { kind: 'draw', player: YOU, count: countOf(ZOMBIES_YOU) },
        ],
      },
    },
  ),
  // "~ deals X damage to target creature and you gain X life, where X is the number of Swamps you control."
  spell(
    'SYNTHETIC Swamp Siphon',
    ['2', 'B'],
    'B',
    'Deals X damage to target creature and you gain X life, where X is the number of Swamps you control.',
    {
      targets: [
        {
          id: 't1',
          what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
        },
      ],
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'dealDamage',
            amount: countOf({ types: ['land'], subtypes: ['Swamp'], controller: 'you' }),
            to: { kind: 'target', id: 't1' },
          },
          {
            kind: 'gainLife',
            player: YOU,
            amount: countOf({ types: ['land'], subtypes: ['Swamp'], controller: 'you' }),
          },
        ],
      },
    },
  ),
  // "~ deals X damage to each creature, where X is the number of creatures on the battlefield."
  spell(
    'SYNTHETIC Chain Reaction',
    ['2', 'R', 'R'],
    'R',
    'Deals X damage to each creature, where X is the number of creatures on the battlefield.',
    {
      effect: {
        kind: 'dealDamage',
        amount: countOf({ types: ['creature'] }),
        to: { kind: 'each', filter: { types: ['creature'] } },
      },
    },
  ),
  // "All creatures get -1/-1 until end of turn for each Swamp you control."
  spell(
    'SYNTHETIC Swamp Blight',
    ['2', 'B'],
    'B',
    'All creatures get -1/-1 until end of turn for each Swamp you control.',
    {
      effect: {
        kind: 'modifyPt',
        objects: { kind: 'each', filter: { types: ['creature'] } },
        power: {
          kind: 'times',
          factor: -1,
          of: countOf({ types: ['land'], subtypes: ['Swamp'], controller: 'you' }),
        },
        toughness: {
          kind: 'times',
          factor: -1,
          of: countOf({ types: ['land'], subtypes: ['Swamp'], controller: 'you' }),
        },
        duration: END,
      },
    },
  ),
  // "~ enters with a +1/+1 counter on it for each Zombie card in your graveyard."
  singleFace({
    name: 'SYNTHETIC Grave Swell',
    manaCost: ['2', 'B'],
    types: ['creature'],
    subtypes: ['Zombie'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 1,
    toughness: 1,
    oracleText: 'Enters with a +1/+1 counter on it for each Zombie card in your graveyard.',
    abilities: [
      {
        kind: 'replacement',
        replacement: {
          kind: 'entersWithCounters',
          counter: '+1/+1',
          count: countOf({
            zone: 'graveyard',
            types: ['creature'],
            subtypes: ['Zombie'],
            controller: 'you',
          }) as Extract<Amount, { kind: 'countOf' }>,
        },
      },
    ],
  }),

  // ---- Half, rounded down; multiples; sums
  // "At the beginning of your upkeep, create X 2/2 black Zombie creature tokens, where X is half the number of
  // Zombies you control, rounded down."
  singleFace({
    name: 'SYNTHETIC Rank Raiser',
    manaCost: ['2', 'B', 'B'],
    types: ['enchantment'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText:
      'At the beginning of your upkeep, create X 2/2 black Zombie creature tokens, where X is half the number of Zombies you control, rounded down.',
    abilities: [
      upkeep({
        kind: 'createToken',
        token: { kind: 'custom', definition: ZOMBIE_TOKEN },
        count: { kind: 'half', of: countOf(ZOMBIES_YOU), round: 'down' },
      }),
    ],
  }),
  // "You gain life equal to the number of creatures you control plus the number of lands you control."
  spell(
    'SYNTHETIC Twin Tithe',
    ['2', 'W'],
    'W',
    'You gain life equal to the number of creatures you control plus the number of lands you control.',
    {
      effect: {
        kind: 'gainLife',
        player: YOU,
        amount: {
          kind: 'sum',
          of: [countOf(CREATURES_YOU), countOf({ types: ['land'], controller: 'you' })],
        },
      },
    },
  ),
  // "You gain 2 life for each creature you control with power 4 or greater."
  spell(
    'SYNTHETIC Mighty Feast',
    ['2', 'G'],
    'G',
    'You gain 2 life for each creature you control with power 4 or greater.',
    {
      effect: {
        kind: 'gainLife',
        player: YOU,
        amount: {
          kind: 'multiple',
          factor: 2,
          of: countOf({ ...CREATURES_YOU, power: { cmp: 'atLeast', value: 4 } }),
        },
      },
    },
  ),
  // "~'s power and toughness are each equal to the number of Zombies on the battlefield plus the number of Zombie
  // cards in all graveyards."
  singleFace({
    name: 'SYNTHETIC Grave Horde',
    manaCost: ['3', 'B'],
    types: ['creature'],
    subtypes: ['Zombie'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: '*',
    toughness: '*',
    oracleText:
      "Grave Horde's power and toughness are each equal to the number of Zombies on the battlefield plus the number of Zombie cards in all graveyards.",
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'characteristicPt',
          power: {
            kind: 'sum',
            of: [
              { kind: 'countOf', filter: { types: ['creature'], subtypes: ['Zombie'] } },
              { kind: 'countOf', filter: { zone: 'graveyard', subtypes: ['Zombie'] } },
            ],
          },
          toughness: {
            kind: 'sum',
            of: [
              { kind: 'countOf', filter: { types: ['creature'], subtypes: ['Zombie'] } },
              { kind: 'countOf', filter: { zone: 'graveyard', subtypes: ['Zombie'] } },
            ],
          },
        },
      },
    ],
  }),

  // ---- The greatest and the total of a stat
  // "Until end of turn, creatures you control gain trample and get +X/+X, where X is the greatest power among
  // creatures you control."
  spell(
    'SYNTHETIC Stampede Call',
    ['3', 'G'],
    'G',
    'Until end of turn, creatures you control gain trample and get +X/+X, where X is the greatest power among creatures you control.',
    {
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'grantKeyword',
            objects: { kind: 'each', filter: CREATURES_YOU },
            keyword: { kind: 'trample' },
            duration: END,
          },
          {
            kind: 'modifyPt',
            objects: { kind: 'each', filter: CREATURES_YOU },
            power: { kind: 'aggregate', how: 'greatest', stat: 'power', filter: CREATURES_YOU },
            toughness: { kind: 'aggregate', how: 'greatest', stat: 'power', filter: CREATURES_YOU },
            duration: END,
          },
        ],
      },
    },
  ),
  // "Draw cards equal to the greatest power among creatures you control."
  spell(
    'SYNTHETIC Stalwart Study',
    ['2', 'U'],
    'U',
    'Draw cards equal to the greatest power among creatures you control.',
    {
      effect: {
        kind: 'draw',
        player: YOU,
        count: { kind: 'aggregate', how: 'greatest', stat: 'power', filter: CREATURES_YOU },
      },
    },
  ),
  // "You gain life equal to the total toughness of creatures you control."
  spell(
    'SYNTHETIC Wall Tithe',
    ['1', 'W'],
    'W',
    'You gain life equal to the total toughness of creatures you control.',
    {
      effect: {
        kind: 'gainLife',
        player: YOU,
        amount: { kind: 'aggregate', how: 'total', stat: 'toughness', filter: CREATURES_YOU },
      },
    },
  ),
  // "You gain life equal to the greatest mana value among artifacts you control."
  spell(
    'SYNTHETIC Relic Tithe',
    ['1', 'W'],
    'W',
    'You gain life equal to the greatest mana value among artifacts you control.',
    {
      effect: {
        kind: 'gainLife',
        player: YOU,
        amount: {
          kind: 'aggregate',
          how: 'greatest',
          stat: 'manaValue',
          filter: { types: ['artifact'], controller: 'you' },
        },
      },
    },
  ),
  // "{X} less to cast, where X is the total power of creatures you control." (a self cost reduction)
  singleFace({
    name: 'SYNTHETIC Mighty Colossus',
    manaCost: ['7', 'G', 'G'],
    types: ['creature'],
    subtypes: ['Dinosaur'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 12,
    toughness: 8,
    oracleText:
      'This spell costs {X} less to cast, where X is the total power of creatures you control.',
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'costReduction',
          spells: { kind: 'this' },
          amount: { kind: 'aggregate', how: 'total', stat: 'power', filter: CREATURES_YOU },
        },
      },
    ],
  }),

  // ---- Devotion and the commanders' colors
  // "When ~ enters, each opponent loses X life, where X is your devotion to black. You gain life equal to the life lost this way."
  singleFace({
    name: 'SYNTHETIC Dark Merchant',
    manaCost: ['3', 'B', 'B'],
    types: ['creature'],
    subtypes: ['Zombie'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 2,
    toughness: 4,
    oracleText:
      'When this enters, each opponent loses X life, where X is your devotion to black. You gain life equal to the life lost this way.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: THIS },
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'loseLife',
              player: EACH_OPPONENT,
              amount: { kind: 'devotion', colors: ['B'] },
            },
            { kind: 'gainLife', player: YOU, amount: { kind: 'lifeLostThisWay' } },
          ],
        },
      },
    ],
  }),
  // "You gain life equal to your devotion to black and red."
  singleFace({
    name: 'SYNTHETIC Blood Devotion',
    manaCost: ['B', 'R'],
    types: ['sorcery'],
    colors: ['B', 'R'],
    colorIdentity: ['B', 'R'],
    oracleText: 'You gain life equal to your devotion to black and red.',
    spell: {
      effect: { kind: 'gainLife', player: YOU, amount: { kind: 'devotion', colors: ['B', 'R'] } },
    },
  }),
  // "You gain life equal to the number of colors in your commander's color identity."
  spell(
    'SYNTHETIC Identity Tithe',
    ['W'],
    'W',
    "You gain life equal to the number of colors in your commander's color identity.",
    { effect: { kind: 'gainLife', player: YOU, amount: { kind: 'commanderColors' } } },
  ),
  // An artifact with a black symbol, a hybrid one, a monocolored hybrid one, a Phyrexian one and a generic one, for devotion counting.
  singleFace({
    name: 'SYNTHETIC Hybrid Idol',
    manaCost: ['B', 'B/R', '2/B', 'G/P', '1'],
    types: ['artifact'],
    colors: ['B', 'R', 'G'],
    colorIdentity: ['B', 'R', 'G'],
    oracleText: 'A permanent with several kinds of mana symbols in its cost.',
  }),

  // ---- An object's own numbers
  // "Whenever another creature you control enters, you gain life equal to that creature's toughness."
  singleFace({
    name: 'SYNTHETIC Hearty Host',
    manaCost: ['3', 'W'],
    types: ['creature'],
    subtypes: ['Angel'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 3,
    toughness: 3,
    oracleText:
      "Whenever another creature you control enters, you gain life equal to that creature's toughness.",
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { ...CREATURES_YOU, other: true } },
        effect: {
          kind: 'gainLife',
          player: YOU,
          amount: { kind: 'toughnessOf', of: { kind: 'triggerSubject' } },
        },
      },
    ],
  }),
  // "Spells you cast cost {1} less to cast for each +1/+1 counter on ~." (a permanent's static ability)
  singleFace({
    name: 'SYNTHETIC Herald of Counters',
    manaCost: ['2', 'W'],
    types: ['creature'],
    subtypes: ['Angel'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 2,
    toughness: 2,
    oracleText:
      'Angel spells you cast cost {1} less to cast for each +1/+1 counter on this creature.',
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'costReduction',
          spells: { subtypes: ['Angel'], controller: 'you' },
          amount: { kind: 'countersOn', of: THIS, counter: '+1/+1' },
        },
      },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Costly Angel',
    manaCost: ['4', 'W'],
    types: ['creature'],
    subtypes: ['Angel'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 4,
    toughness: 4,
    oracleText: 'Flying',
    abilities: [{ kind: 'keyword', keyword: { kind: 'flying' } }],
  }),

  // ---- An amount compared with a number
  // "When ~ enters, if creatures you control have total power 8 or greater, draw a card."
  singleFace({
    name: 'SYNTHETIC Power Scout',
    manaCost: ['1', 'G'],
    types: ['creature'],
    subtypes: ['Scout'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 1,
    toughness: 1,
    oracleText:
      'When this enters, if creatures you control have total power 8 or greater, draw a card.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: THIS },
        interveningIf: {
          kind: 'amountIs',
          amount: { kind: 'aggregate', how: 'total', stat: 'power', filter: CREATURES_YOU },
          compare: { cmp: 'atLeast', value: 8 },
        },
        effect: { kind: 'draw', player: YOU, count: 1 },
      },
    ],
  }),
  // "If you have three or more creature cards in your graveyard, you gain 5 life. Otherwise you lose 1 life." (a conditional effect)
  spell(
    'SYNTHETIC Graveyard Count',
    ['B'],
    'B',
    'If you have three or more creature cards in your graveyard, you gain 5 life. Otherwise you lose 1 life.',
    {
      effect: {
        kind: 'conditional',
        condition: {
          kind: 'amountIs',
          amount: countOf({ zone: 'graveyard', types: ['creature'], controller: 'you' }),
          compare: { cmp: 'atLeast', value: 3 },
        },
        effect: { kind: 'gainLife', player: YOU, amount: 5 },
        else: { kind: 'loseLife', player: YOU, amount: 1 },
      },
    },
  ),

  // ---- Attacking you; opponents with more
  // "Create X 1/2 green Spider creature tokens with reach, where X is the number of creatures attacking you."
  spell(
    'SYNTHETIC Web Swarm',
    ['2', 'G'],
    'G',
    'Create X 1/2 green Spider creature tokens with reach, where X is the number of creatures attacking you.',
    {
      effect: {
        kind: 'createToken',
        token: { kind: 'custom', definition: SPIDER_TOKEN },
        count: countOf({ types: ['creature'], attackingYou: true }),
      },
    },
    'instant',
  ),
  // "At the beginning of your upkeep, create a Clue token for each opponent who has more cards in hand than you."
  singleFace({
    name: 'SYNTHETIC Hand Detective',
    manaCost: ['2', 'W'],
    types: ['creature'],
    subtypes: ['Human'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 1,
    toughness: 3,
    oracleText:
      'At the beginning of your upkeep, investigate once for each opponent who has more cards in hand than you.',
    abilities: [
      upkeep({
        kind: 'createToken',
        token: { kind: 'preset', preset: 'Clue' },
        count: { kind: 'opponentsWithMore', stat: 'cardsInHand' },
      }),
    ],
  }),

  // ---- Tokens that enter tapped
  // "Create thirteen tapped 2/2 black Zombie creature tokens."
  spell(
    'SYNTHETIC Army Muster',
    ['5', 'B', 'B'],
    'B',
    'Create thirteen tapped 2/2 black Zombie creature tokens.',
    {
      effect: {
        kind: 'createToken',
        token: { kind: 'custom', definition: ZOMBIE_TOKEN },
        count: 13,
        tapped: true,
      },
    },
  ),
  // "Create X tapped Treasure tokens, where X is the number of Zombies you control."
  spell(
    'SYNTHETIC Tapped Hoard',
    ['2', 'B'],
    'B',
    'Create a number of tapped Treasure tokens equal to the number of Zombies you control.',
    {
      effect: {
        kind: 'createToken',
        token: { kind: 'preset', preset: 'Treasure' },
        count: countOf(ZOMBIES_YOU),
        tapped: true,
      },
    },
  ),

  // ---- Added for the mutation check of D-131
  // "Create a tapped token that's a copy of target creature you control." (the token may ask its own question as it
  // enters, CR 614.12, so this is the path that creates it one at a time)
  spell(
    'SYNTHETIC Tapped Twin',
    ['1', 'U'],
    'U',
    "Create a tapped token that's a copy of target creature you control.",
    {
      targets: [
        { id: 't1', what: { kind: 'object', filter: { types: ['creature'], controller: 'you' } } },
      ],
      effect: {
        kind: 'createToken',
        token: { kind: 'copyOf', object: { kind: 'target', id: 't1' } },
        count: 1,
        tapped: true,
      },
    },
    'instant',
  ),
  // "Return X creatures you control to their owner's hand, where X is the number of Zombies you control."
  spell(
    'SYNTHETIC Zombie Recall',
    ['1', 'U'],
    'U',
    "Return X creatures you control to their owner's hand, where X is the number of Zombies you control.",
    {
      effect: {
        kind: 'moveToZone',
        objects: { kind: 'choose', filter: CREATURES_YOU, count: countOf(ZOMBIES_YOU) },
        to: 'hand',
      },
    },
  ),
];
