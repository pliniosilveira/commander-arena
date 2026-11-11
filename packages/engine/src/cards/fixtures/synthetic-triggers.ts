/**
 * SYNTHETIC TRIGGER, SACRIFICE AND TOKEN CARDS. NOT REAL MAGIC CARDS.
 *
 * Invented for the M5 tests of triggered abilities (CR 603), the sacrifice action (CR 701.21) and
 * tokens (CR 111). Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST
 * does; it is not Oracle text. None of them is a copy of a real card's definition: the real cards
 * arrive through the parser.
 */
import type { Ability, Effect, ObjectFilter } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { kw, singleFace } from './helpers';

const THIS = { kind: 'this' } as const;
const YOU = { kind: 'you' } as const;

const triggered = (
  trigger: Extract<Ability, { kind: 'triggered' }>['trigger'],
  effect: Effect,
  optional?: boolean,
): Ability => ({
  kind: 'triggered',
  trigger,
  effect,
  ...(optional ? { optional } : {}),
});

const gainOne: Effect = { kind: 'gainLife', player: YOU, amount: 1 };
const drawOne: Effect = { kind: 'draw', player: YOU, count: 1 };
const sacrificeAnother: Effect = {
  kind: 'sacrifice',
  objects: { kind: 'choose', filter: { other: true } },
};

const CREATURE: ObjectFilter = { types: ['creature'] };

const SOLDIER_TOKEN = {
  name: 'Soldier',
  manaCost: null,
  supertypes: [],
  types: ['creature'],
  subtypes: ['Soldier'],
  colors: ['W'],
  power: 1,
  toughness: 1,
  loyalty: null,
  defense: null,
  oracleText: '',
  abilities: [],
} as const;

export const SYNTHETIC_TRIGGER_LIST: readonly CardDefinition[] = [
  // The text of a sacrifice engine: two "enters or attacks" abilities and a sacrifice watcher.
  singleFace({
    name: 'SYNTHETIC Sacrifice Dragon',
    manaCost: ['3', 'B'],
    types: ['creature'],
    subtypes: ['Dragon'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 4,
    toughness: 4,
    oracleText:
      'Flying. Whenever this creature enters or attacks, sacrifice another permanent. ' +
      'Whenever you sacrifice a permanent, put a +1/+1 counter on this creature and draw a card.',
    abilities: [
      kw('flying'),
      triggered({ kind: 'entersBattlefield', what: THIS }, sacrificeAnother),
      triggered({ kind: 'attacks', what: THIS }, sacrificeAnother),
      triggered(
        { kind: 'permanentSacrificed', by: 'you' },
        {
          kind: 'sequence',
          effects: [{ kind: 'addCounters', objects: THIS, counter: '+1/+1', count: 1 }, drawOne],
        },
      ),
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Dies Treasure Creature',
    manaCost: ['1', 'B'],
    types: ['creature'],
    subtypes: ['Construct'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 2,
    toughness: 2,
    oracleText: 'When this creature dies, create a Treasure token.',
    abilities: [
      triggered(
        { kind: 'dies', what: THIS },
        { kind: 'createToken', token: { kind: 'preset', preset: 'Treasure' }, count: 1 },
      ),
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Enters Draw Creature',
    manaCost: ['1', 'U'],
    types: ['creature'],
    subtypes: ['Construct'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 1,
    toughness: 1,
    oracleText: 'When this creature enters, draw a card.',
    abilities: [triggered({ kind: 'entersBattlefield', what: THIS }, drawOne)],
  }),
  singleFace({
    name: 'SYNTHETIC May Draw Creature',
    manaCost: ['2', 'U'],
    types: ['creature'],
    subtypes: ['Construct'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 1,
    toughness: 2,
    oracleText: 'When this creature enters, you may draw a card.',
    abilities: [triggered({ kind: 'entersBattlefield', what: THIS }, drawOne, true)],
  }),
  singleFace({
    name: 'SYNTHETIC Landfall Tokenmaker',
    manaCost: ['2', 'G'],
    types: ['enchantment'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText:
      'Whenever a land enters under your control, create a 1/1 white Soldier creature token.',
    abilities: [
      triggered(
        { kind: 'landfall' },
        {
          kind: 'createToken',
          token: { kind: 'custom', definition: SOLDIER_TOKEN },
          count: 1,
        },
      ),
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Make Treasures',
    manaCost: ['1', 'R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Create two Treasure tokens.',
    spell: {
      effect: {
        kind: 'createToken',
        token: { kind: 'preset', preset: 'Treasure' },
        count: 2,
      },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Edict',
    manaCost: ['1', 'B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Sacrifice a creature.',
    spell: {
      effect: { kind: 'sacrifice', objects: { kind: 'choose', filter: CREATURE } },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Land Edict',
    manaCost: ['B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Sacrifice two lands.',
    spell: {
      effect: {
        kind: 'sacrifice',
        objects: { kind: 'choose', filter: { types: ['land'] }, count: 2 },
      },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Fleeting Spirit',
    manaCost: ['W'],
    types: ['creature'],
    subtypes: ['Spirit'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 2,
    toughness: 1,
    oracleText: 'At the beginning of your end step, sacrifice this creature.',
    abilities: [triggered({ kind: 'endStep', whose: 'you' }, { kind: 'sacrifice', objects: THIS })],
  }),
  singleFace({
    name: 'SYNTHETIC Sacrifice Lifegainer',
    manaCost: ['1', 'W'],
    types: ['enchantment'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'Whenever a player sacrifices a permanent, you gain 1 life.',
    abilities: [triggered({ kind: 'permanentSacrificed', by: 'any' }, gainOne)],
  }),
  singleFace({
    name: 'SYNTHETIC Sacrifice Reader',
    manaCost: ['1', 'U'],
    types: ['enchantment'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Whenever a player sacrifices a permanent, you draw a card.',
    abilities: [triggered({ kind: 'permanentSacrificed', by: 'any' }, drawOne)],
  }),
  singleFace({
    name: 'SYNTHETIC Creature Sacrifice Watcher',
    manaCost: ['B'],
    types: ['enchantment'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Whenever you sacrifice a creature, you gain 1 life.',
    abilities: [triggered({ kind: 'permanentSacrificed', by: 'you', filter: CREATURE }, gainOne)],
  }),
  singleFace({
    name: 'SYNTHETIC Mourner',
    manaCost: ['2', 'B'],
    types: ['creature'],
    subtypes: ['Construct'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 1,
    toughness: 1,
    oracleText: 'Whenever another creature dies, you gain 1 life.',
    abilities: [triggered({ kind: 'dies', what: { other: true, types: ['creature'] } }, gainOne)],
  }),
  singleFace({
    name: 'SYNTHETIC Welcome Committee',
    manaCost: ['1', 'W'],
    types: ['enchantment'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'Whenever another creature enters under your control, you gain 1 life.',
    abilities: [
      triggered(
        {
          kind: 'entersBattlefield',
          what: { other: true, types: ['creature'], controller: 'you' },
        },
        gainOne,
      ),
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Dragon Roost',
    manaCost: ['2', 'R'],
    types: ['enchantment'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Whenever a Dragon enters under your control, you gain 1 life.',
    abilities: [
      triggered(
        { kind: 'entersBattlefield', what: { subtypes: ['Dragon'], controller: 'you' } },
        gainOne,
      ),
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Spite Watcher',
    manaCost: ['B'],
    types: ['enchantment'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Whenever a creature an opponent controls dies, you gain 1 life.',
    abilities: [
      triggered({ kind: 'dies', what: { types: ['creature'], controller: 'opponent' } }, gainOne),
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Upkeep Reader',
    manaCost: ['1', 'U'],
    types: ['enchantment'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'At the beginning of your upkeep, draw a card.',
    abilities: [triggered({ kind: 'upkeep', whose: 'you' }, drawOne)],
  }),
  singleFace({
    name: 'SYNTHETIC Each Upkeep Lifegainer',
    manaCost: ['1', 'W'],
    types: ['enchantment'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'At the beginning of each upkeep, you gain 1 life.',
    abilities: [triggered({ kind: 'upkeep', whose: 'each' }, gainOne)],
  }),
  singleFace({
    name: 'SYNTHETIC End Step Reader',
    manaCost: ['1', 'U'],
    types: ['enchantment'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'At the beginning of each end step, draw a card.',
    abilities: [triggered({ kind: 'endStep', whose: 'each' }, drawOne)],
  }),
  singleFace({
    name: 'SYNTHETIC Banner Bearer',
    manaCost: ['1', 'W'],
    types: ['creature'],
    subtypes: ['Construct'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 1,
    toughness: 3,
    oracleText: 'Whenever another creature you control attacks, you gain 1 life.',
    abilities: [
      triggered(
        { kind: 'attacks', what: { other: true, types: ['creature'], controller: 'you' } },
        gainOne,
      ),
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Spell Watcher',
    manaCost: ['1', 'U'],
    types: ['enchantment'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Whenever you cast a spell, you gain 1 life.',
    abilities: [
      triggered({ kind: 'castSpell', filter: { stackKind: 'spell' }, by: 'you' }, gainOne),
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Tap Watcher',
    manaCost: ['1', 'W'],
    types: ['creature'],
    subtypes: ['Construct'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 2,
    toughness: 2,
    oracleText: 'Whenever this creature becomes tapped, you gain 1 life.',
    abilities: [triggered({ kind: 'becomesTapped', what: THIS }, gainOne)],
  }),
  singleFace({
    name: 'SYNTHETIC Treasure Land',
    manaCost: null,
    types: ['land'],
    colors: [],
    colorIdentity: [],
    oracleText: 'When this land enters, create a Treasure token.',
    abilities: [
      { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['C'] } },
      triggered(
        { kind: 'entersBattlefield', what: THIS },
        { kind: 'createToken', token: { kind: 'preset', preset: 'Treasure' }, count: 1 },
      ),
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Food Maker',
    manaCost: ['1', 'G'],
    types: ['sorcery'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'Create a Food token.',
    spell: {
      effect: { kind: 'createToken', token: { kind: 'preset', preset: 'Food' }, count: 1 },
    },
  }),
];
