/**
 * SYNTHETIC CARDS THAT REFER TO A TARGET'S CONTROLLER, OWNER AND VALUES. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests and the soak games of D-092: amounts read from a chosen target with
 * last-known information (CR 608.2h), effects that another player performs (a token created and a
 * library searched by "its controller", CR 111.2, 701.23a), cards selected by owner ("target
 * player's graveyard", CR 108.3), "counter target spell unless its controller pays", and "return a
 * land you control to its owner's hand". Names start with "SYNTHETIC "; oracleId is null. The text
 * describes what the AST does; it is not Oracle text, and none of these is the definition of a real
 * card.
 */
import type { Effect, ObjectFilter, TargetSpec } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const YOU = { kind: 'you' } as const;
const T1 = { kind: 'target', id: 't1' } as const;
const CONTROLLER_OF_T1 = { kind: 'controllerOf', of: T1 } as const;
const BASIC_LAND: ObjectFilter = { types: ['land'], supertypes: ['basic'] };

const CREATURE_TARGET: TargetSpec = {
  id: 't1',
  what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
};
const PERMANENT_TARGET: TargetSpec = {
  id: 't1',
  what: { kind: 'object', filter: { zone: 'battlefield' } },
};
const SPELL_TARGET: TargetSpec = {
  id: 't1',
  what: { kind: 'object', filter: { zone: 'stack', stackKind: 'spell' } },
};
const PLAYER_TARGET: TargetSpec = { id: 't1', what: { kind: 'player', filter: 'any' } };

const BEAST_TOKEN = {
  name: 'Beast',
  manaCost: null,
  supertypes: [],
  types: ['creature'],
  subtypes: ['Beast'],
  colors: ['G'],
  power: 3,
  toughness: 3,
  loyalty: null,
  defense: null,
  oracleText: '',
  abilities: [],
} as const;

/** "Search your library for a basic land card, put it onto the battlefield tapped, then shuffle." */
const landSearch = (player: Extract<Effect, { kind: 'search' }>['player'], optional: boolean) =>
  ({
    kind: 'search',
    player,
    ...(optional ? { optional: true as const } : {}),
    filter: BASIC_LAND,
    max: 1,
    destinations: [{ zone: 'battlefield', tapped: true, count: 1 }],
    reveal: false,
    shuffle: true,
  }) satisfies Effect;

export const SYNTHETIC_REFERENCE_LIST: readonly CardDefinition[] = [
  // Amounts that read a target (primitive 1).
  singleFace({
    name: 'SYNTHETIC Exile Gain Power',
    manaCost: ['1', 'W'],
    types: ['instant'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'Exile target creature. Its controller gains life equal to its power.',
    spell: {
      targets: [CREATURE_TARGET],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'exile', objects: T1 },
          {
            kind: 'gainLife',
            player: CONTROLLER_OF_T1,
            amount: { kind: 'powerOf', of: T1 },
          },
        ],
      },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Weigh Creature',
    manaCost: ['1', 'B'],
    types: ['instant'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText:
      'Target creature’s controller loses life equal to its power and gains life equal to its mana value.',
    spell: {
      targets: [CREATURE_TARGET],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'loseLife', player: CONTROLLER_OF_T1, amount: { kind: 'powerOf', of: T1 } },
          { kind: 'gainLife', player: CONTROLLER_OF_T1, amount: { kind: 'manaValueOf', of: T1 } },
        ],
      },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Reanimate Pay Life',
    manaCost: ['1', 'B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText:
      'Return target creature card from your graveyard to the battlefield. You lose life equal to that card’s mana value.',
    spell: {
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
        kind: 'sequence',
        effects: [
          { kind: 'moveToZone', objects: T1, to: 'battlefield' },
          { kind: 'loseLife', player: YOU, amount: { kind: 'manaValueOf', of: T1 } },
        ],
      },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Costly Counter',
    manaCost: ['U', 'U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Counter target spell. Its controller loses life equal to its mana value.',
    spell: {
      targets: [SPELL_TARGET],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'counter', objects: T1 },
          {
            kind: 'loseLife',
            player: CONTROLLER_OF_T1,
            amount: { kind: 'manaValueOf', of: T1 },
          },
        ],
      },
    },
  }),
  // Effects another player performs (primitive 2).
  singleFace({
    name: 'SYNTHETIC Banish Seek Land',
    manaCost: ['W'],
    types: ['instant'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText:
      'Exile target creature. Its controller may search their library for a basic land card, put that card onto the battlefield tapped, then shuffle.',
    spell: {
      targets: [CREATURE_TARGET],
      effect: {
        kind: 'sequence',
        effects: [{ kind: 'exile', objects: T1 }, landSearch(CONTROLLER_OF_T1, true)],
      },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Wild Transform',
    manaCost: ['2', 'G'],
    types: ['instant'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText:
      'Destroy target permanent. Its controller creates a 3/3 green Beast creature token.',
    spell: {
      targets: [PERMANENT_TARGET],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'destroy', objects: T1 },
          {
            kind: 'createToken',
            token: { kind: 'custom', definition: BEAST_TOKEN },
            count: 1,
            controller: CONTROLLER_OF_T1,
          },
        ],
      },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Optional Land Fetch',
    manaCost: ['1', 'G'],
    types: ['sorcery'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText:
      'You may search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.',
    spell: { effect: landSearch(YOU, true) },
  }),
  singleFace({
    name: 'SYNTHETIC Seek And Shuffle',
    manaCost: ['1', 'U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Return target creature to its owner’s hand. Its owner shuffles their library.',
    spell: {
      targets: [CREATURE_TARGET],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'moveToZone', objects: T1, to: 'hand' },
          { kind: 'shuffle', player: { kind: 'ownerOf', of: T1 } },
        ],
      },
    },
  }),
  // Cards selected by owner (primitive 3).
  singleFace({
    name: 'SYNTHETIC Graveyard Wipe',
    manaCost: ['1', 'B'],
    types: ['instant'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Exile target player’s graveyard.',
    spell: {
      targets: [PLAYER_TARGET],
      effect: {
        kind: 'exile',
        objects: {
          kind: 'each',
          filter: { zone: 'graveyard', owner: { kind: 'target', id: 't1' } },
        },
      },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Graveyard Watcher',
    manaCost: ['2', 'B'],
    types: ['creature'],
    subtypes: ['Specter'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 2,
    toughness: 2,
    oracleText: 'When this creature enters, exile target player’s graveyard.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        targets: [PLAYER_TARGET],
        effect: {
          kind: 'exile',
          objects: {
            kind: 'each',
            filter: { zone: 'graveyard', owner: { kind: 'target', id: 't1' } },
          },
        },
      },
    ],
  }),
  // "Counter target spell unless its controller pays" (primitive 4).
  singleFace({
    name: 'SYNTHETIC Soft Counter',
    manaCost: ['1', 'U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Counter target spell unless its controller pays {3}.',
    spell: {
      targets: [SPELL_TARGET],
      effect: {
        kind: 'counterUnlessPays',
        objects: T1,
        cost: [{ kind: 'mana', symbols: ['3'] }],
      },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Toll Counter',
    manaCost: ['U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Counter target spell unless its controller pays 2 life.',
    spell: {
      targets: [SPELL_TARGET],
      effect: { kind: 'counterUnlessPays', objects: T1, cost: [{ kind: 'payLife', amount: 2 }] },
    },
  }),
  // "Return a land you control to its owner's hand" (primitive 5).
  singleFace({
    name: 'SYNTHETIC Bounce Land',
    manaCost: null,
    types: ['land'],
    colors: [],
    colorIdentity: ['U', 'G'],
    oracleText:
      'This land enters tapped. When this land enters, return a land you control to its owner’s hand. {T}: Add {G}{U}.',
    abilities: [
      { kind: 'replacement', replacement: { kind: 'entersTapped' } },
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: {
          kind: 'moveToZone',
          objects: { kind: 'choose', filter: { types: ['land'], controller: 'you' } },
          to: 'hand',
        },
      },
      { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['G', 'U'] } },
    ],
  }),
];
