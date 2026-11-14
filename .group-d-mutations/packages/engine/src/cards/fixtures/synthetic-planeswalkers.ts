/**
 * SYNTHETIC PLANESWALKERS (D-200). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of the planeswalker subsystem (loyalty abilities, CR 606; planeswalker tokens, CR 111, 306.5b; emblems
 * are D-201): a walker with a plus, a zero and a minus ability with a target; one with a "[-X]" ability; one whose last ability
 * takes all its loyalty; one with a static and a triggered ability; one that becomes a creature; one whose ability adds mana; and
 * a spell that creates a planeswalker token. Names start with "SYNTHETIC "; oracleId is null. Their text describes what the AST does and is
 * not Oracle text. None is the definition of a real card; the real planeswalkers come from the parser reading their Oracle text.
 */
import type { Ability, Cost, Effect, TokenDefinition } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { JACE_TOKEN } from '../tokens';
import { singleFace } from './helpers';

const YOU = { kind: 'you' } as const;
const THIS = { kind: 'this' } as const;
const T1 = { kind: 'target', id: 't1' } as const;

/** A loyalty ability: [change] with its effect, optionally with targets. */
export const loyaltyAbility = (
  change: number | 'x',
  effect: Effect,
  targets?: Extract<Ability, { kind: 'activated' }>['targets'],
): Ability => ({
  kind: 'activated',
  cost: [{ kind: 'loyalty', change } satisfies Cost],
  effect,
  ...(targets === undefined ? {} : { targets }),
});

const gain = (amount: number): Effect => ({ kind: 'gainLife', player: YOU, amount });
const CREATURE_TARGET = [
  { id: 't1', what: { kind: 'object', filter: { types: ['creature'] } } },
] as const;
const ANY_TARGET = [{ id: 't1', what: { kind: 'anyTarget' } }] as const;

/** A Jace-like planeswalker token: two loyalty abilities that need no target (the shape of CR 701.71a's token, for the token tests). */
export const SYNTHETIC_WALKER_TOKEN: TokenDefinition = {
  name: 'Test Walker',
  manaCost: null,
  supertypes: [],
  types: ['planeswalker'],
  subtypes: ['Dack'],
  colors: ['U'],
  power: null,
  toughness: null,
  loyalty: 3,
  defense: null,
  oracleText: '[-1]: You gain 1 life.\n[-3]: You gain 5 life.',
  abilities: [loyaltyAbility(-1, gain(1)), loyaltyAbility(-3, gain(5))],
};

export const SYNTHETIC_PLANESWALKER_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Loyalty Walker',
    manaCost: ['2', 'U'],
    supertypes: ['legendary'],
    types: ['planeswalker'],
    subtypes: ['Dack'],
    colors: ['U'],
    colorIdentity: ['U'],
    loyalty: 4,
    oracleText:
      '+1: You gain 2 life.\n0: Draw a card.\n−2: SYNTHETIC Loyalty Walker deals 3 damage to target creature.',
    abilities: [
      loyaltyAbility(1, gain(2)),
      loyaltyAbility(0, { kind: 'draw', player: YOU, count: 1 }),
      loyaltyAbility(-2, { kind: 'dealDamage', amount: 3, to: T1 }, CREATURE_TARGET),
    ],
  }),
  singleFace({
    name: 'SYNTHETIC X Walker',
    manaCost: ['3', 'R'],
    types: ['planeswalker'],
    subtypes: ['Dack'],
    colors: ['R'],
    colorIdentity: ['R'],
    loyalty: 3,
    oracleText: '+1: You gain 1 life.\n−X: SYNTHETIC X Walker deals X damage to any target.',
    abilities: [
      loyaltyAbility(1, gain(1)),
      loyaltyAbility('x', { kind: 'dealDamage', amount: { kind: 'x' }, to: T1 }, ANY_TARGET),
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Ultimate Walker',
    manaCost: ['4', 'B'],
    types: ['planeswalker'],
    subtypes: ['Dack'],
    colors: ['B'],
    colorIdentity: ['B'],
    loyalty: 3,
    oracleText:
      '+1: You gain 1 life.\n−3: SYNTHETIC Ultimate Walker deals 3 damage to each opponent.',
    abilities: [
      loyaltyAbility(1, gain(1)),
      loyaltyAbility(-3, {
        kind: 'dealDamage',
        amount: 3,
        to: { kind: 'eachOpponent' },
      }),
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Static Walker',
    manaCost: ['3', 'G'],
    types: ['planeswalker'],
    subtypes: ['Dack'],
    colors: ['G'],
    colorIdentity: ['G'],
    loyalty: 5,
    oracleText:
      'Creatures you control get +1/+1.\nWhenever a creature you control dies, you gain 1 life.\n+1: You gain 1 life.',
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'modifyPt',
          subject: { kind: 'filter', filter: { types: ['creature'], controller: 'you' } },
          power: 1,
          toughness: 1,
        },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'dies', what: { types: ['creature'], controller: 'you' } },
        effect: gain(1),
      },
      loyaltyAbility(1, gain(1)),
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Animate Walker',
    manaCost: ['2', 'W', 'W'],
    types: ['planeswalker'],
    subtypes: ['Dack'],
    colors: ['W'],
    colorIdentity: ['W'],
    loyalty: 4,
    oracleText:
      '+1: Until end of turn, SYNTHETIC Animate Walker becomes a 4/4 Human Soldier creature that is still a planeswalker.',
    abilities: [
      loyaltyAbility(1, {
        kind: 'sequence',
        effects: [
          {
            kind: 'setTypes',
            objects: THIS,
            types: ['creature'],
            subtypes: ['Human', 'Soldier'],
            additive: true,
            duration: 'untilEndOfTurn',
          },
          {
            kind: 'setPt',
            objects: THIS,
            power: 4,
            toughness: 4,
            duration: 'untilEndOfTurn',
          },
        ],
      }),
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Mana Walker',
    manaCost: ['2', 'R', 'R'],
    types: ['planeswalker'],
    subtypes: ['Dack'],
    colors: ['R'],
    colorIdentity: ['R'],
    loyalty: 4,
    oracleText: '+1: Add {R}{R}.',
    abilities: [loyaltyAbility(1, { kind: 'addMana', mana: { kind: 'fixed', mana: ['R', 'R'] } })],
  }),
  singleFace({
    name: 'SYNTHETIC Walker Maker',
    manaCost: ['3', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Create a Test Walker planeswalker token.',
    spell: {
      effect: {
        kind: 'createToken',
        token: { kind: 'custom', definition: SYNTHETIC_WALKER_TOKEN },
        count: 1,
      },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Walker Twin',
    manaCost: ['4', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: "Create a token that's a copy of target planeswalker.",
    spell: {
      targets: [{ id: 't1', what: { kind: 'object', filter: { types: ['planeswalker'] } } }],
      effect: { kind: 'createToken', token: { kind: 'copyOf', object: T1 }, count: 1 },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Walker Burn',
    manaCost: ['2', 'R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      "SYNTHETIC Walker Burn deals 3 damage to target player or planeswalker and each creature that player or that planeswalker's controller controls.",
    spell: {
      targets: [
        {
          id: 't1',
          what: { kind: 'playerOrObject', player: 'any', filter: { types: ['planeswalker'] } },
        },
      ],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'dealDamage', amount: 3, to: T1 },
          {
            kind: 'dealDamage',
            amount: 3,
            to: {
              kind: 'each',
              filter: {
                zone: 'battlefield',
                types: ['creature'],
                controlledBy: {
                  kind: 'all',
                  of: [T1, { kind: 'controllerOf', of: T1 }],
                },
              },
            },
          },
        ],
      },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Empower Rite',
    manaCost: ['3', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Empower Jace 6. Draw a card.',
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'empowerJace', amount: 6 },
          { kind: 'draw', player: YOU, count: 1 },
        ],
      },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Empower Keeper',
    manaCost: ['3'],
    types: ['artifact', 'creature'],
    subtypes: ['Chimera'],
    colors: [],
    colorIdentity: [],
    power: 2,
    toughness: 2,
    oracleText: 'When this creature enters, empower Jace 2.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: THIS },
        effect: { kind: 'empowerJace', amount: 2 },
      },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Double Jace Rite',
    manaCost: ['4', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Create two Jace planeswalker tokens. Empower Jace 6.',
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'createToken', token: { kind: 'custom', definition: JACE_TOKEN }, count: 2 },
          { kind: 'empowerJace', amount: 6 },
        ],
      },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Anthem Emblem Rite',
    manaCost: ['2', 'W'],
    types: ['sorcery'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'You get an emblem with "Creatures you control get +2/+2 and have flying."',
    spell: {
      effect: {
        kind: 'createEmblem',
        text: 'Creatures you control get +2/+2 and have flying.',
        abilities: [
          {
            kind: 'static',
            static: {
              kind: 'modifyPt',
              subject: { kind: 'filter', filter: { types: ['creature'], controller: 'you' } },
              power: 2,
              toughness: 2,
            },
          },
          {
            kind: 'static',
            static: {
              kind: 'grantKeyword',
              subject: { kind: 'filter', filter: { types: ['creature'], controller: 'you' } },
              keyword: { kind: 'flying' },
            },
          },
        ],
      },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Burn Emblem Rite',
    manaCost: ['2', 'R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'You get an emblem with "Whenever you cast a spell, this emblem deals 2 damage to any target."',
    spell: {
      effect: {
        kind: 'createEmblem',
        text: 'Whenever you cast a spell, this emblem deals 2 damage to any target.',
        abilities: [
          {
            kind: 'triggered',
            trigger: { kind: 'castSpell', filter: { stackKind: 'spell' }, by: 'you' },
            targets: [{ id: 't1', what: { kind: 'anyTarget' } }],
            effect: { kind: 'dealDamage', amount: 2, to: T1 },
          },
        ],
      },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Life Setter',
    manaCost: ['B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: "Target player's life total becomes 1.",
    spell: {
      targets: [{ id: 't1', what: { kind: 'player', filter: 'any' } }],
      effect: { kind: 'setLifeTotal', player: T1, amount: 1 },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Life Raiser',
    manaCost: ['W'],
    types: ['sorcery'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'Your life total becomes 60.',
    spell: { effect: { kind: 'setLifeTotal', player: YOU, amount: 60 } },
  }),
  singleFace({
    name: 'SYNTHETIC Walker Theft',
    manaCost: ['2', 'U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Gain control of target planeswalker until end of turn.',
    spell: {
      targets: [{ id: 't1', what: { kind: 'object', filter: { types: ['planeswalker'] } } }],
      effect: { kind: 'gainControl', objects: T1, duration: 'untilEndOfTurn' },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Type Wipe',
    manaCost: ['1', 'U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText:
      'Until end of turn, target planeswalker becomes an artifact (it is no longer a planeswalker).',
    spell: {
      targets: [{ id: 't1', what: { kind: 'object', filter: { types: ['planeswalker'] } } }],
      effect: { kind: 'setTypes', objects: T1, types: ['artifact'], duration: 'untilEndOfTurn' },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Walker Commander',
    manaCost: ['2', 'G', 'G'],
    supertypes: ['legendary'],
    types: ['planeswalker'],
    subtypes: ['Dack'],
    colors: ['G'],
    colorIdentity: ['G'],
    loyalty: 4,
    oracleText:
      '+1: You gain 1 life.\n0: Until end of turn, SYNTHETIC Walker Commander becomes a 6/6 Human Soldier creature that is still a planeswalker.\nSYNTHETIC Walker Commander can be your commander.',
    abilities: [
      loyaltyAbility(1, gain(1)),
      loyaltyAbility(0, {
        kind: 'sequence',
        effects: [
          {
            kind: 'setTypes',
            objects: THIS,
            types: ['creature'],
            subtypes: ['Human', 'Soldier'],
            additive: true,
            duration: 'untilEndOfTurn',
          },
          { kind: 'setPt', objects: THIS, power: 6, toughness: 6, duration: 'untilEndOfTurn' },
        ],
      }),
      { kind: 'keyword', keyword: { kind: 'canBeCommander' } },
    ],
  }),
];
