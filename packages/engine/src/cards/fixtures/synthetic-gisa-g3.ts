/**
 * SYNTHETIC CARDS FOR GROUP 3 OF THE GISA DECK (issue 41, D-1420 and later). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of what the real cards of the group need from the engine, written out by hand (the cards package checks that the grammar lowers the real Oracle text to
 * these same nodes): a planeswalker whose last ability makes each opponent keep one permanent of each permanent type, a creature that sacrifices X creatures as a cost, a creature that
 * sacrifices two other creatures and has players sacrifice, a card with a "partner with" ability, and an instant with an optional sacrifice of any number of creatures that copies it.
 * Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';
import { loyaltyAbility } from './synthetic-planeswalkers';

const PERMANENT_TYPES = [
  'artifact',
  'battle',
  'creature',
  'enchantment',
  'land',
  'planeswalker',
] as const;

/** "{B}, Sacrifice X creatures: Target player draws X cards and gains X life. Put X +1/+1 counters on ~." (the ability of Krav, the Unredeemed) */
export const SACRIFICE_X_ABILITY: Ability = {
  kind: 'activated',
  cost: [
    { kind: 'mana', symbols: ['B'] },
    { kind: 'sacrifice', what: { types: ['creature'] }, countX: true },
  ],
  targets: [{ id: 't1', what: { kind: 'player', filter: 'any' } }],
  effect: {
    kind: 'sequence',
    effects: [
      { kind: 'draw', player: { kind: 'target', id: 't1' }, count: { kind: 'x' } },
      { kind: 'gainLife', player: { kind: 'target', id: 't1' }, amount: { kind: 'x' } },
      { kind: 'addCounters', objects: { kind: 'this' }, counter: '+1/+1', count: { kind: 'x' } },
    ],
  },
};

export const PARTNER_QUARRY = 'SYNTHETIC Partner Quarry';

/** "When you do, copy ~ for each creature sacrificed this way" (Plumb the Forbidden): the spell's own cast trigger, if a creature was sacrificed for its additional cost. */
export const COPY_FOR_EACH_SACRIFICED: Ability = {
  kind: 'triggered',
  trigger: { kind: 'castSpell', filter: { stackKind: 'spell' }, by: 'you', self: true },
  interveningIf: { kind: 'sacrificedAsCost' },
  effect: {
    kind: 'copySpell',
    spell: { kind: 'triggerSubject' },
    newTargets: 'no',
    count: { kind: 'sacrificedAsCost' },
  },
};

export const SYNTHETIC_GISA_G3_LIST: readonly CardDefinition[] = [
  // "{B}, Sacrifice X creatures: Target player draws X cards and gains X life. Put X +1/+1 counters on ~."
  singleFace({
    name: 'SYNTHETIC Sacrifice Demon',
    manaCost: ['4', 'B'],
    supertypes: ['legendary'],
    types: ['creature'],
    subtypes: ['Demon'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 3,
    toughness: 3,
    oracleText:
      '{B}, Sacrifice X creatures: Target player draws X cards and gains X life. Put X +1/+1 counters on this creature.',
    abilities: [SACRIFICE_X_ABILITY],
  }),
  // "Partner with SYNTHETIC Partner Quarry" (CR 702.124j: when it enters, target player may search their library for the named card, reveal it, put it into their hand, then shuffle).
  singleFace({
    name: 'SYNTHETIC Partner Seeker',
    manaCost: ['2', 'B'],
    supertypes: ['legendary'],
    types: ['creature'],
    subtypes: ['Human', 'Cleric'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 2,
    toughness: 2,
    oracleText: 'Partner with SYNTHETIC Partner Quarry',
    abilities: [{ kind: 'keyword', keyword: { kind: 'partnerWith', name: PARTNER_QUARRY } }],
  }),
  singleFace({
    name: PARTNER_QUARRY,
    manaCost: ['3', 'B'],
    supertypes: ['legendary'],
    types: ['creature'],
    subtypes: ['Human', 'Cleric'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 3,
    toughness: 3,
    oracleText: 'Partner with SYNTHETIC Partner Seeker',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'partnerWith', name: 'SYNTHETIC Partner Seeker' } },
    ],
  }),
  // "−9: Each opponent chooses a permanent they control of each permanent type and sacrifices the rest."
  singleFace({
    name: 'SYNTHETIC Culling Walker',
    manaCost: ['5', 'B', 'B'],
    supertypes: ['legendary'],
    types: ['planeswalker'],
    subtypes: ['Liliana'],
    colors: ['B'],
    colorIdentity: ['B'],
    loyalty: 9,
    oracleText:
      '−9: Each opponent chooses a permanent they control of each permanent type and sacrifices the rest.',
    abilities: [
      loyaltyAbility(-9, {
        kind: 'sparePermanents',
        types: PERMANENT_TYPES,
        own: { players: { kind: 'eachOpponent' } },
      }),
    ],
  }),
  // The same for each player, as a sorcery (the choice of each player in turn order).
  singleFace({
    name: 'SYNTHETIC Culling Rite',
    manaCost: ['3', 'B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText:
      'Each player chooses a permanent they control of each permanent type and sacrifices the rest.',
    spell: {
      effect: {
        kind: 'sparePermanents',
        types: PERMANENT_TYPES,
        own: { players: { kind: 'eachPlayer' } },
      },
    },
  }),
  // "{T}, Sacrifice two other creatures: Any number of target players each lose 2 life and sacrifice a creature of their choice. You add {B}{B} and draw a card."
  singleFace({
    name: 'SYNTHETIC Sacrifice Priest',
    manaCost: ['1', 'B'],
    types: ['creature'],
    subtypes: ['Human', 'Cleric'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 1,
    toughness: 2,
    oracleText:
      '{T}, Sacrifice two other creatures: Any number of target players each lose 2 life and sacrifice a creature of their choice. You add {B}{B} and draw a card.',
    abilities: [
      {
        kind: 'activated',
        cost: [
          { kind: 'tap' },
          { kind: 'sacrifice', what: { types: ['creature'], other: true }, count: 2 },
        ],
        targets: [{ id: 't1', what: { kind: 'player', filter: 'any' }, anyNumber: true }],
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'loseLife', player: { kind: 'target', id: 't1' }, amount: 2 },
            {
              kind: 'sacrifice',
              objects: { kind: 'choose', filter: { types: ['creature'] } },
              player: { kind: 'target', id: 't1' },
            },
            { kind: 'addMana', mana: { kind: 'fixed', mana: ['B', 'B'] } },
            { kind: 'draw', player: { kind: 'you' }, count: 1 },
          ],
        },
      },
    ],
  }),
  // "As an additional cost to cast this spell, you may sacrifice one or more creatures. When you do, copy this spell for each creature sacrificed this way. You draw a card and lose 1 life."
  singleFace({
    name: 'SYNTHETIC Forbidden Rite',
    manaCost: ['1', 'B'],
    types: ['instant'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText:
      'As an additional cost to cast this spell, you may sacrifice one or more creatures. When you do, copy this spell for each creature sacrificed this way.\nYou draw a card and lose 1 life.',
    additionalCosts: [{ kind: 'sacrifice', what: { types: ['creature'] }, anyNumber: true }],
    abilities: [COPY_FOR_EACH_SACRIFICED],
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'draw', player: { kind: 'you' }, count: 1 },
          { kind: 'loseLife', player: { kind: 'you' }, amount: 1 },
        ],
      },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Gisa Relic',
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: '',
  }),
  singleFace({
    name: 'SYNTHETIC Gisa Golem',
    manaCost: ['3'],
    types: ['artifact', 'creature'],
    subtypes: ['Golem'],
    colors: [],
    colorIdentity: [],
    power: 3,
    toughness: 3,
    oracleText: '',
  }),
  singleFace({
    name: 'SYNTHETIC Gisa Ward',
    manaCost: ['1', 'W'],
    types: ['enchantment'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: '',
  }),
];
