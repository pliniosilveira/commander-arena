/**
 * SYNTHETIC CARDS FOR EVOKE GIVEN BY A STATIC ABILITY. NOT REAL MAGIC CARDS.
 *
 * Invented for the scenario tests of the permanent that gives the spells its controller casts from the hand an evoke cost as they are cast (`grantAlternativeCostToSpells`, CR 702.74a,
 * 118.9) and of the sacrifice-and-copy trigger a card with it may have (`unlessPays` in a `delayedTrigger`, CR 603.7, 118.12a). Names start with "SYNTHETIC "; oracleId is null; the text
 * describes what the AST does, it is not Oracle text, and none of these is the definition of a real card (the real ones are read from their Oracle text by `packages/cards`).
 */
import type { Ability, Cost, ObjectFilter } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const FOUR: readonly Cost[] = [{ kind: 'mana', symbols: ['4'] }];

/** "Elemental permanent spells you cast from your hand": an Elemental spell of a permanent type. */
const ELEMENTAL_PERMANENT_SPELLS: ObjectFilter = {
  controller: 'you',
  subtypes: ['Elemental'],
  anyOf: [
    { types: ['artifact'] },
    { types: ['creature'] },
    { types: ['enchantment'] },
    { types: ['planeswalker'] },
    { types: ['battle'] },
  ],
};

const GRANT: Ability = {
  kind: 'static',
  static: {
    kind: 'grantAlternativeCostToSpells',
    what: ELEMENTAL_PERMANENT_SPELLS,
    from: 'hand',
    alt: { kind: 'evoke', cost: FOUR },
  },
};

/** "Whenever you sacrifice a nontoken Elemental, create a token that's a copy of it. The token gains haste until end of turn. At the beginning of your next end step, sacrifice it unless you pay {W}{U}{B}{R}{G}." */
const COPY_TRIGGER: Ability = {
  kind: 'triggered',
  trigger: {
    kind: 'permanentSacrificed',
    by: 'you',
    filter: { subtypes: ['Elemental'], token: false },
  },
  effect: {
    kind: 'sequence',
    effects: [
      {
        kind: 'createToken',
        token: { kind: 'copyOf', object: { kind: 'triggerSubject' } },
        count: 1,
      },
      {
        kind: 'grantKeyword',
        objects: { kind: 'moved' },
        keyword: { kind: 'haste' },
        duration: 'untilEndOfTurn',
      },
      {
        kind: 'delayedTrigger',
        at: { step: 'endStep', whose: 'you' },
        effect: {
          kind: 'unlessPays',
          player: { kind: 'you' },
          cost: [{ kind: 'mana', symbols: ['W', 'U', 'B', 'R', 'G'] }],
          effect: { kind: 'sacrifice', objects: { kind: 'moved' } },
        },
      },
    ],
  },
};

const GAIN_TWO_ON_ENTER: Ability = {
  kind: 'triggered',
  trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
  effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 2 },
};

export const SYNTHETIC_EVOKE_GRANT_LIST: readonly CardDefinition[] = [
  // "Elemental permanent spells you cast from your hand gain evoke {4} as you cast them."
  singleFace({
    name: 'SYNTHETIC Evoke Granter',
    manaCost: ['2', 'R'],
    types: ['creature'],
    subtypes: ['Elemental', 'Sorcerer'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 4,
    toughness: 4,
    oracleText:
      'Elemental permanent spells you cast from your hand gain evoke {4} as you cast them.',
    abilities: [GRANT],
  }),
  // The same grant and the copy trigger of the real card, on one permanent.
  singleFace({
    name: 'SYNTHETIC Evoke Copier',
    manaCost: ['2', 'R'],
    types: ['creature'],
    subtypes: ['Elemental', 'Sorcerer'],
    colors: ['R'],
    colorIdentity: ['W', 'U', 'B', 'R', 'G'],
    power: 4,
    toughness: 4,
    oracleText:
      "Elemental permanent spells you cast from your hand gain evoke {4} as you cast them.\nWhenever you sacrifice a nontoken Elemental, create a token that's a copy of it. The token gains haste until end of turn. At the beginning of your next end step, sacrifice it unless you pay {W}{U}{B}{R}{G}.",
    abilities: [GRANT, COPY_TRIGGER],
  }),
  // Only the copy trigger.
  singleFace({
    name: 'SYNTHETIC Elemental Echo',
    manaCost: ['1', 'R'],
    types: ['creature'],
    subtypes: ['Elemental'],
    colors: ['R'],
    colorIdentity: ['W', 'U', 'B', 'R', 'G'],
    power: 2,
    toughness: 2,
    oracleText:
      "Whenever you sacrifice a nontoken Elemental, create a token that's a copy of it. The token gains haste until end of turn. At the beginning of your next end step, sacrifice it unless you pay {W}{U}{B}{R}{G}.",
    abilities: [COPY_TRIGGER],
  }),
  // An Elemental that costs more than the granted evoke.
  singleFace({
    name: 'SYNTHETIC Heavy Elemental',
    manaCost: ['5', 'G'],
    types: ['creature'],
    subtypes: ['Elemental'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 5,
    toughness: 5,
    oracleText: 'When this creature enters, you gain 2 life.',
    abilities: [GAIN_TWO_ON_ENTER],
  }),
  // The same, not an Elemental.
  singleFace({
    name: 'SYNTHETIC Heavy Beast',
    manaCost: ['5', 'G'],
    types: ['creature'],
    subtypes: ['Beast'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 5,
    toughness: 5,
    oracleText: 'When this creature enters, you gain 2 life.',
    abilities: [GAIN_TWO_ON_ENTER],
  }),
  // An Elemental with an evoke cost of its own, {1}: the printed cost is the one used.
  singleFace({
    name: 'SYNTHETIC Cheap Evoker',
    manaCost: ['5', 'G'],
    types: ['creature'],
    subtypes: ['Elemental'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 3,
    toughness: 3,
    oracleText: 'Evoke {1}.',
    alternativeCosts: [{ kind: 'evoke', cost: [{ kind: 'mana', symbols: ['1'] }] }],
    abilities: [],
  }),
];
