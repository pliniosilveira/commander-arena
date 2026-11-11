/**
 * SYNTHETIC CARDS FOR ADDITIONAL COSTS, COST REDUCTIONS, COUNTED AMOUNTS AND FREE CASTS. NOT REAL
 * MAGIC CARDS.
 *
 * Invented for the tests and the soak games of D-095: "for each creature on the battlefield" and "the
 * number of lands you control" amounts (`countOf`), "as an additional cost to cast this spell,
 * sacrifice a creature / discard a card" (CR 118.8, 601.2f-h), "this spell costs {1} less to cast for
 * each creature on the battlefield" and "artifact spells you cast cost {1} less to cast" (CR 118.7,
 * 601.2f), "if you control a commander, you may cast this spell without paying its mana cost" (CR
 * 118.9, 903.3d) and Ward and activated abilities with a discard cost. Names start with "SYNTHETIC ";
 * oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is
 * the definition of a real card.
 */
import type {
  Ability,
  AlternativeCost,
  Condition,
  Cost,
  ObjectFilter,
  StaticEffect,
  TargetSpec,
} from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const YOU = { kind: 'you' } as const;
const T1 = { kind: 'target', id: 't1' } as const;
const CREATURES: ObjectFilter = { types: ['creature'] };
const MY_LANDS: ObjectFilter = { types: ['land'], controller: 'you' };
const MY_HAND: ObjectFilter = { zone: 'hand', controller: 'you' };

const CREATURE_TARGET: TargetSpec = {
  id: 't1',
  what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
};
const SPELL_TARGET: TargetSpec = {
  id: 't1',
  what: { kind: 'object', filter: { zone: 'stack', stackKind: 'spell' } },
};
const PLAYER_TARGET: TargetSpec = { id: 't1', what: { kind: 'player', filter: 'any' } };
const ANY_TARGET: TargetSpec = { id: 't1', what: { kind: 'anyTarget' } };

const SACRIFICE_CREATURE: Cost = { kind: 'sacrifice', what: CREATURES };
const DISCARD_ONE: Cost = { kind: 'discard', count: 1 };

const CONTROL_COMMANDER: Condition = { kind: 'controlCommander' };
const FREE_WITH_COMMANDER: readonly AlternativeCost[] = [
  { kind: 'free', condition: CONTROL_COMMANDER },
];

type Reduction = Extract<StaticEffect, { kind: 'costReduction' }>;

const reduction = (spells: Reduction['spells'], amount: Reduction['amount']): Ability => ({
  kind: 'static',
  static: { kind: 'costReduction', spells, amount },
});

export const SYNTHETIC_COST_LIST: readonly CardDefinition[] = [
  // ---- Counted amounts: "for each", "equal to the number of".
  singleFace({
    name: 'SYNTHETIC Crowd Burn',
    manaCost: ['R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'Deals damage to target player equal to the number of creatures on the battlefield.',
    spell: {
      targets: [PLAYER_TARGET],
      effect: {
        kind: 'dealDamage',
        amount: { kind: 'countOf', filter: CREATURES },
        to: T1,
      },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Land Tithe',
    manaCost: ['1', 'G'],
    types: ['instant'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'You gain life equal to the number of lands you control.',
    spell: {
      effect: { kind: 'gainLife', player: YOU, amount: { kind: 'countOf', filter: MY_LANDS } },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Hand Refill',
    manaCost: ['2', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Draw a card for each card in your hand.',
    spell: {
      effect: { kind: 'draw', player: YOU, count: { kind: 'countOf', filter: MY_HAND } },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Grave Growth',
    manaCost: ['1', 'G'],
    types: ['sorcery'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'Put a +1/+1 counter on target creature for each creature card in your graveyard.',
    spell: {
      targets: [CREATURE_TARGET],
      effect: {
        kind: 'addCounters',
        objects: T1,
        counter: '+1/+1',
        count: {
          kind: 'countOf',
          filter: { zone: 'graveyard', types: ['creature'], controller: 'you' },
        },
      },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Rally Bear',
    manaCost: ['2', 'W'],
    types: ['creature'],
    subtypes: ['Bear'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 2,
    toughness: 2,
    oracleText: 'When this creature enters, you gain 1 life for each other creature you control.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: {
          kind: 'gainLife',
          player: YOU,
          amount: {
            kind: 'countOf',
            filter: { types: ['creature'], controller: 'you', other: true },
          },
        },
      },
    ],
  }),
  // A body that dies for a trigger, for the creature a sacrifice cost gives up.
  singleFace({
    name: 'SYNTHETIC Doomed Scout',
    manaCost: ['1'],
    types: ['artifact', 'creature'],
    subtypes: ['Construct'],
    colors: [],
    colorIdentity: [],
    power: 1,
    toughness: 1,
    oracleText: 'When this creature dies, you gain 2 life.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'dies', what: { kind: 'this' } },
        effect: { kind: 'gainLife', player: YOU, amount: 2 },
      },
    ],
  }),

  // ---- Additional costs.
  singleFace({
    name: 'SYNTHETIC Sacrifice Draw',
    manaCost: ['B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'As an additional cost to cast this spell, sacrifice a creature. Draw two cards.',
    additionalCosts: [SACRIFICE_CREATURE],
    spell: { effect: { kind: 'draw', player: YOU, count: 2 } },
  }),
  singleFace({
    name: 'SYNTHETIC Offering Bolt',
    manaCost: ['1', 'R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'As an additional cost to cast this spell, sacrifice an artifact or creature. It deals 4 damage to target creature.',
    additionalCosts: [
      {
        kind: 'sacrifice',
        what: { anyOf: [{ types: ['artifact'] }, { types: ['creature'] }] },
      },
    ],
    spell: {
      targets: [CREATURE_TARGET],
      effect: { kind: 'dealDamage', amount: 4, to: T1 },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Land Offering',
    manaCost: ['2', 'G'],
    types: ['sorcery'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'As an additional cost to cast this spell, sacrifice a land. You gain 6 life.',
    additionalCosts: [{ kind: 'sacrifice', what: { types: ['land'] } }],
    spell: { effect: { kind: 'gainLife', player: YOU, amount: 6 } },
  }),
  singleFace({
    name: 'SYNTHETIC Discard Burn',
    manaCost: ['R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'As an additional cost to cast this spell, discard a card. It deals 3 damage to any target.',
    additionalCosts: [DISCARD_ONE],
    spell: {
      targets: [ANY_TARGET],
      effect: { kind: 'dealDamage', amount: 3, to: T1 },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Double Toll',
    manaCost: ['1', 'B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText:
      'As an additional cost to cast this spell, sacrifice a creature and discard a card. Each opponent loses 5 life.',
    additionalCosts: [SACRIFICE_CREATURE, DISCARD_ONE],
    spell: { effect: { kind: 'loseLife', player: { kind: 'eachOpponent' }, amount: 5 } },
  }),
  singleFace({
    name: 'SYNTHETIC Blood Price',
    manaCost: ['B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'As an additional cost to cast this spell, pay 3 life. Draw two cards.',
    additionalCosts: [{ kind: 'payLife', amount: 3 }],
    spell: { effect: { kind: 'draw', player: YOU, count: 2 } },
  }),
  singleFace({
    name: 'SYNTHETIC Extra Mana Tax',
    manaCost: ['R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'As an additional cost to cast this spell, pay {1}. Draw a card.',
    additionalCosts: [{ kind: 'mana', symbols: ['1'] }],
    spell: { effect: { kind: 'draw', player: YOU, count: 1 } },
  }),
  singleFace({
    name: 'SYNTHETIC Sacrifice Kicker',
    manaCost: ['R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'Kicker {2}. As an additional cost to cast this spell, sacrifice a creature. It deals 2 damage to target player, or 5 if it was kicked.',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'kicker', cost: [{ kind: 'mana', symbols: ['2'] }] } },
    ],
    additionalCosts: [SACRIFICE_CREATURE],
    spell: {
      targets: [PLAYER_TARGET],
      effect: {
        kind: 'conditional',
        condition: { kind: 'kicked' },
        effect: { kind: 'dealDamage', amount: 5, to: T1 },
        else: { kind: 'dealDamage', amount: 2, to: T1 },
      },
    },
  }),

  // ---- Discard as the cost of Ward and of an activated ability.
  singleFace({
    name: 'SYNTHETIC Tithe Warded Guard',
    manaCost: ['1', 'W'],
    types: ['creature'],
    subtypes: ['Soldier'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 2,
    toughness: 2,
    oracleText: 'Ward—Discard a card.',
    abilities: [{ kind: 'keyword', keyword: { kind: 'ward', cost: [DISCARD_ONE] } }],
  }),
  singleFace({
    name: 'SYNTHETIC Scavenger Bear',
    manaCost: ['1', 'G'],
    types: ['creature'],
    subtypes: ['Bear'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 2,
    toughness: 2,
    oracleText: 'Discard a card: This creature gets +1/+1 until end of turn.',
    abilities: [
      {
        kind: 'activated',
        cost: [DISCARD_ONE],
        effect: {
          kind: 'modifyPt',
          objects: { kind: 'this' },
          power: 1,
          toughness: 1,
          duration: 'untilEndOfTurn',
        },
      },
    ],
  }),

  // ---- Cost reductions.
  singleFace({
    name: 'SYNTHETIC Wrath of Many',
    manaCost: ['8', 'R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'This spell costs {1} less to cast for each creature on the battlefield. It deals 13 damage to each creature.',
    abilities: [reduction({ kind: 'this' }, { kind: 'countOf', filter: CREATURES })],
    spell: {
      effect: {
        kind: 'dealDamage',
        amount: 13,
        to: { kind: 'each', filter: { types: ['creature'] } },
      },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Tinker Bench',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Artifact spells you cast cost {1} less to cast.',
    abilities: [reduction({ types: ['artifact'], controller: 'you' }, 1)],
  }),
  singleFace({
    name: 'SYNTHETIC Spell Chant',
    manaCost: ['2', 'U'],
    types: ['enchantment'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Instant and sorcery spells you cast cost {1} less to cast.',
    abilities: [
      reduction({ anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }], controller: 'you' }, 1),
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Giant Discount',
    manaCost: ['2', 'G'],
    types: ['enchantment'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'Creature spells you cast cost {2} less to cast.',
    abilities: [reduction({ types: ['creature'], controller: 'you' }, 2)],
  }),
  singleFace({
    name: 'SYNTHETIC Market Haze',
    manaCost: ['3', 'U'],
    types: ['enchantment'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Spells cost {1} less to cast for each land you control.',
    abilities: [reduction({}, { kind: 'countOf', filter: MY_LANDS })],
  }),
  singleFace({
    name: 'SYNTHETIC Sacrifice Rite',
    manaCost: ['4', 'B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText:
      'This spell costs {1} less to cast for each creature on the battlefield. As an additional cost to cast this spell, sacrifice a creature. Draw three cards.',
    abilities: [reduction({ kind: 'this' }, { kind: 'countOf', filter: CREATURES })],
    additionalCosts: [SACRIFICE_CREATURE],
    spell: { effect: { kind: 'draw', player: YOU, count: 3 } },
  }),

  // ---- Free casts.
  singleFace({
    name: 'SYNTHETIC Free Counter',
    manaCost: ['2', 'U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText:
      'If you control a commander, you may cast this spell without paying its mana cost. Counter target spell.',
    alternativeCosts: FREE_WITH_COMMANDER,
    spell: { targets: [SPELL_TARGET], effect: { kind: 'counter', objects: T1 } },
  }),
  singleFace({
    name: 'SYNTHETIC Free Exile',
    manaCost: ['3', 'B'],
    types: ['instant'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText:
      'If you control a commander, you may cast this spell without paying its mana cost. Exile target creature.',
    alternativeCosts: FREE_WITH_COMMANDER,
    spell: { targets: [CREATURE_TARGET], effect: { kind: 'exile', objects: T1 } },
  }),
  singleFace({
    name: 'SYNTHETIC Free Offering',
    manaCost: ['4', 'B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText:
      'As an additional cost to cast this spell, sacrifice a creature. If you control a commander, you may cast this spell without paying its mana cost. Draw three cards.',
    additionalCosts: [SACRIFICE_CREATURE],
    alternativeCosts: FREE_WITH_COMMANDER,
    spell: { effect: { kind: 'draw', player: YOU, count: 3 } },
  }),
  singleFace({
    name: 'SYNTHETIC Always Free',
    manaCost: ['5'],
    types: ['instant'],
    colors: [],
    colorIdentity: [],
    oracleText: 'You may cast this spell without paying its mana cost. You gain 3 life.',
    alternativeCosts: [{ kind: 'free' }],
    spell: { effect: { kind: 'gainLife', player: YOU, amount: 3 } },
  }),
  singleFace({
    name: 'SYNTHETIC Free Colossus',
    manaCost: ['5', 'G', 'G'],
    types: ['creature'],
    subtypes: ['Giant'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 7,
    toughness: 7,
    oracleText: 'If you control a commander, you may cast this spell without paying its mana cost.',
    alternativeCosts: FREE_WITH_COMMANDER,
  }),
];
