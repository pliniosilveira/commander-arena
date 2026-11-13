/**
 * SYNTHETIC CARDS FOR COUNTERS THAT CAN'T BE PUT ON, DOUBLED TOKENS AND DOUBLED DRAWS. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of the Hashaton deck program, group 3 (D-1150 to D-1153, provisional numbers): "Creatures you control can't have -1/-1 counters put on
 * them" (`cantHaveCounters`, in the kinds the engine reads: a group, `this`, `attached`), "If one or more tokens would be created under your control, twice that
 * many of those tokens are created instead" (`tokensInstead` in `double` mode) and "If you would draw a card except the first one you draw in each of your draw
 * steps, draw two cards instead" (`drawInstead`). Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text,
 * and none of these is the definition of a real card.
 */
import type { Ability, Effect, ObjectFilter } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { kw, singleFace } from './helpers';

const YOU = { kind: 'you' } as const;

const SOLDIER: Extract<Effect, { kind: 'createToken' }>['token'] = {
  kind: 'custom',
  definition: {
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
  },
};

const ANGEL: Extract<Effect, { kind: 'createToken' }>['token'] = {
  kind: 'custom',
  definition: {
    name: 'Angel',
    manaCost: null,
    supertypes: [],
    types: ['creature'],
    subtypes: ['Angel'],
    colors: ['W'],
    power: 1,
    toughness: 1,
    loyalty: null,
    defense: null,
    oracleText: '',
    abilities: [kw('flying')],
  },
};

/** A creature whose only text is one static ability (the "ward" cards of the counter tests). */
const warder = (
  name: string,
  cost: readonly string[],
  subtypes: readonly string[],
  words: string,
  ability: Ability,
  artifact = false,
): CardDefinition =>
  singleFace({
    name,
    manaCost: [...cost],
    types: artifact ? ['artifact', 'creature'] : ['creature'],
    subtypes: subtypes as never,
    colors: artifact ? [] : ['W'],
    colorIdentity: artifact ? [] : ['W'],
    power: 2,
    toughness: 2,
    oracleText: words,
    abilities: [ability],
  });

const cantHave = (subject: ObjectFilter, counter: string): Ability => ({
  kind: 'static',
  static: { kind: 'cantHaveCounters', subject: { kind: 'filter', filter: subject }, counter },
});

/** "If you would draw a card except the first one you draw in each of your draw steps, draw two cards instead." */
const DRAW_TWICE: Ability = {
  kind: 'replacement',
  replacement: { kind: 'drawInstead', count: 2, exceptFirstInDrawStep: true },
};

/** "If one or more tokens would be created under your control, twice that many of those tokens are created instead." */
const DOUBLE_TOKENS: Ability = {
  kind: 'replacement',
  replacement: { kind: 'tokensInstead', what: { token: true }, mode: 'double' },
};

const reign = (name: string, words: string, abilities: readonly Ability[]): CardDefinition =>
  singleFace({
    name,
    manaCost: ['4', 'W', 'U'],
    types: ['creature'],
    subtypes: ['Human', 'Noble'] as never,
    colors: ['W', 'U'],
    colorIdentity: ['W', 'U'],
    power: 3,
    toughness: 5,
    oracleText: words,
    abilities: [kw('reach'), kw('vigilance'), ...abilities],
  });

export const SYNTHETIC_HASHATON_G3_LIST: readonly CardDefinition[] = [
  // "Creatures you control can't have -1/-1 counters put on them." (Darksteel Angel's line, on an artifact creature of its own)
  warder(
    'SYNTHETIC Counter Ward',
    ['3'],
    ['Construct'],
    "Creatures you control can't have -1/-1 counters put on them.",
    cantHave({ types: ['creature'], controller: 'you' }, '-1/-1'),
    true,
  ),
  // The same for +1/+1 counters.
  warder(
    'SYNTHETIC Growth Ward',
    ['2', 'W'],
    ['Cleric'],
    "Creatures you control can't have +1/+1 counters put on them.",
    cantHave({ types: ['creature'], controller: 'you' }, '+1/+1'),
  ),
  // The same for loyalty counters of planeswalkers.
  warder(
    'SYNTHETIC Loyalty Ward',
    ['2', 'W'],
    ['Cleric'],
    "Planeswalkers you control can't have loyalty counters put on them.",
    cantHave({ types: ['planeswalker'], controller: 'you' }, 'loyalty'),
  ),
  // The same for lore counters of Sagas.
  warder(
    'SYNTHETIC Lore Ward',
    ['2', 'W'],
    ['Cleric'],
    "Sagas you control can't have lore counters put on them.",
    cantHave({ subtypes: ['Saga'], controller: 'you' }, 'lore'),
  ),
  // "Permanents you control can't have age counters put on them." (the counter of cumulative upkeep)
  warder(
    'SYNTHETIC Age Ward',
    ['W'],
    ['Cleric'],
    "Permanents you control can't have age counters put on them.",
    cantHave({ controller: 'you' }, 'age'),
  ),
  // "Artifacts you control can't have page counters put on them." (the counter a cost puts on the artifact)
  warder(
    'SYNTHETIC Page Ward',
    ['W'],
    ['Cleric'],
    "Artifacts you control can't have page counters put on them.",
    cantHave({ types: ['artifact'], controller: 'you' }, 'page'),
  ),
  // "As this artifact enters, you may have it become a copy of any planeswalker on the battlefield." (it enters with the loyalty it copied, CR 306.5b)
  singleFace({
    name: 'SYNTHETIC Walker Mirror',
    manaCost: ['3'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      'As this artifact enters, you may have it become a copy of any planeswalker on the battlefield.',
    abilities: [
      {
        kind: 'replacement',
        replacement: {
          kind: 'entersAsCopy',
          what: { types: ['planeswalker'] },
          optional: true,
          duration: 'permanent',
        },
      },
    ],
  }),
  // "This creature can't have +1/+1 counters put on it." (the subject is the permanent itself)
  warder(
    'SYNTHETIC Lone Ward',
    ['1', 'W'],
    ['Cleric'],
    "This creature can't have +1/+1 counters put on it.",
    {
      kind: 'static',
      static: { kind: 'cantHaveCounters', subject: { kind: 'this' }, counter: '+1/+1' },
    },
  ),
  // "Enchant creature. Enchanted creature can't have +1/+1 counters put on it." (the subject is the permanent the Aura is attached to)
  singleFace({
    name: 'SYNTHETIC Ward Aura',
    manaCost: ['1', 'W'],
    types: ['enchantment'],
    subtypes: ['Aura'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: "Enchant creature. Enchanted creature can't have +1/+1 counters put on it.",
    abilities: [
      { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
      {
        kind: 'static',
        static: {
          kind: 'cantHaveCounters',
          subject: { kind: 'attached', types: ['creature'] },
          counter: '+1/+1',
        },
      },
    ],
  }),
  // "Create two tapped 1/1 white Soldier creature tokens."
  singleFace({
    name: 'SYNTHETIC Muster Call',
    manaCost: ['1', 'W'],
    types: ['sorcery'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'Create two tapped 1/1 white Soldier creature tokens.',
    spell: { effect: { kind: 'createToken', token: SOLDIER, count: 2, tapped: true } },
  }),
  // "Create a 1/1 white Angel creature token with flying."
  singleFace({
    name: 'SYNTHETIC Angel Caller',
    manaCost: ['W'],
    types: ['sorcery'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'Create a 1/1 white Angel creature token with flying.',
    spell: { effect: { kind: 'createToken', token: ANGEL, count: 1 } },
  }),
  // "Draw a card."
  singleFace({
    name: 'SYNTHETIC Quick Study',
    manaCost: ['U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Draw a card.',
    spell: { effect: { kind: 'draw', player: YOU, count: 1 } },
  }),
  // "Draw a card. If you do, you gain 2 life." (the draw is replaced: "if you do" still counts the cards drawn)
  singleFace({
    name: 'SYNTHETIC Careful Study',
    manaCost: ['1', 'U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Draw a card. If you do, you gain 2 life.',
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'draw', player: YOU, count: 1 },
          {
            kind: 'conditional',
            condition: { kind: 'didPrevious' },
            effect: { kind: 'gainLife', player: YOU, amount: 2 },
          },
        ],
      },
    },
  }),
  // "Reach, vigilance. [both replacements]" (the shape of the Hashaton commander)
  reign(
    'SYNTHETIC Twin Reign',
    'Reach, vigilance\nIf you would draw a card except the first one you draw in each of your draw steps, draw two cards instead.\nIf one or more tokens would be created under your control, twice that many of those tokens are created instead.',
    [DRAW_TWICE, DOUBLE_TOKENS],
  ),
  // "Reach, vigilance. [the draw replacement only]"
  reign(
    'SYNTHETIC Draw Reign',
    'Reach, vigilance\nIf you would draw a card except the first one you draw in each of your draw steps, draw two cards instead.',
    [DRAW_TWICE],
  ),
  // "Reach, vigilance. [the token replacement only]"
  reign(
    'SYNTHETIC Token Reign',
    'Reach, vigilance\nIf one or more tokens would be created under your control, twice that many of those tokens are created instead.',
    [DOUBLE_TOKENS],
  ),
];
