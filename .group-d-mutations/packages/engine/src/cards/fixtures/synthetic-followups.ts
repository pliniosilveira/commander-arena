/**
 * SYNTHETIC CARDS FOR THE INTERVENING "IF", THE HOST TYPE OF AN ATTACHED SUBJECT, AND FOOD AND
 * CLUE. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of the intervening "if" clause of a triggered ability (CR 603.4), of an
 * Aura whose static ability names a type its host may not have ("Enchant permanent" with
 * "Enchanted creature gets +1/+1", CR 303.4, 613) and of the predefined Food and Clue tokens
 * (CR 111.10b, 111.10f). Names start with "SYNTHETIC "; oracleId is null. The text describes what
 * the AST does; it is not Oracle text and none of these copies a real card.
 */
import type { Ability, Condition, Effect, ObjectFilter, StaticEffect } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const THIS = { kind: 'this' } as const;
const YOU = { kind: 'you' } as const;
const CREATURE: ObjectFilter = { types: ['creature'] };
const gain = (amount: number): Effect => ({ kind: 'gainLife', player: YOU, amount });
const counter = (count: number): Effect => ({
  kind: 'addCounters',
  objects: THIS,
  counter: '+1/+1',
  count,
});
const staticAbility = (effect: StaticEffect): Ability => ({ kind: 'static', static: effect });
const enchant = (filter: ObjectFilter): Ability => ({
  kind: 'keyword',
  keyword: { kind: 'enchant', filter },
});

const entersThis = { kind: 'entersBattlefield', what: THIS } as const;
const OTHER_CREATURE: Condition = {
  kind: 'controlsAtLeast',
  filter: { types: ['creature'], other: true },
  count: 1,
};

export const SYNTHETIC_FOLLOWUP_LIST: readonly CardDefinition[] = [
  // ---- The intervening "if" (CR 603.4)
  // "if it was kicked": no trigger at all for an unkicked creature, unlike the `conditional`
  // effect of SYNTHETIC Kicker Bear, whose trigger goes on the stack and then does nothing.
  singleFace({
    name: 'SYNTHETIC Kicker Warden',
    manaCost: ['1', 'G'],
    types: ['creature'],
    subtypes: ['Bear'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 2,
    toughness: 2,
    oracleText:
      'Kicker {2}. When this creature enters, if it was kicked, put two +1/+1 counters on it.',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'kicker', cost: [{ kind: 'mana', symbols: ['2'] }] } },
      {
        kind: 'triggered',
        trigger: entersThis,
        interveningIf: { kind: 'kicked' },
        effect: counter(2),
      },
    ],
  }),
  // A condition that can be true when the event happens and false when the ability resolves.
  singleFace({
    name: 'SYNTHETIC Crowd Pleaser',
    manaCost: ['1', 'W'],
    types: ['creature'],
    subtypes: ['Soldier'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 1,
    toughness: 1,
    oracleText:
      'Whenever you cast a spell, if you control two or more creatures and you have an opponent, you gain 2 life.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'castSpell', filter: { stackKind: 'spell' }, by: 'you' },
        interveningIf: {
          kind: 'and',
          terms: [
            { kind: 'controlsAtLeast', filter: CREATURE, count: 2 },
            { kind: 'opponentsAtLeast', count: 1 },
          ],
        },
        effect: gain(2),
      },
    ],
  }),
  // "other" and "not": the creature itself is on the battlefield when the ability checks.
  singleFace({
    name: 'SYNTHETIC Lone Wolf',
    manaCost: ['1', 'G'],
    types: ['creature'],
    subtypes: ['Wolf'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 2,
    toughness: 1,
    oracleText:
      'When this creature enters, if you control no other creatures, put a +1/+1 counter on it.',
    abilities: [
      {
        kind: 'triggered',
        trigger: entersThis,
        interveningIf: { kind: 'not', term: OTHER_CREATURE },
        effect: counter(1),
      },
    ],
  }),
  // Two triggers of one event: the sacrifice, resolving first, can make the other's condition false.
  singleFace({
    name: 'SYNTHETIC Fickle Host',
    manaCost: ['2', 'W'],
    types: ['creature'],
    subtypes: ['Soldier'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 2,
    toughness: 2,
    oracleText:
      'At the beginning of your end step, sacrifice another creature. ' +
      'At the beginning of your end step, if you control two or more creatures, you gain 3 life.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'endStep', whose: 'you' },
        effect: {
          kind: 'sacrifice',
          objects: { kind: 'choose', filter: { types: ['creature'], other: true } },
        },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'endStep', whose: 'you' },
        interveningIf: { kind: 'controlsAtLeast', filter: CREATURE, count: 2 },
        effect: gain(3),
      },
    ],
  }),
  // An opponent count no two-player game can reach: it never triggers.
  singleFace({
    name: 'SYNTHETIC Table Talker',
    manaCost: ['2', 'U'],
    types: ['creature'],
    subtypes: ['Wizard'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 1,
    toughness: 3,
    oracleText: 'When this creature enters, if you have two or more opponents, draw a card.',
    abilities: [
      {
        kind: 'triggered',
        trigger: entersThis,
        interveningIf: { kind: 'opponentsAtLeast', count: 2 },
        effect: { kind: 'draw', player: YOU, count: 1 },
      },
    ],
  }),
  // ---- The host type of an attached subject (CR 303.4, 613)
  singleFace({
    name: 'SYNTHETIC Growth Aura',
    manaCost: ['1', 'G'],
    types: ['enchantment'],
    subtypes: ['Aura'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'Enchant permanent. Enchanted creature gets +1/+1.',
    abilities: [
      enchant({}),
      staticAbility({
        kind: 'modifyPt',
        subject: { kind: 'attached', types: ['creature'] },
        power: 1,
        toughness: 1,
      }),
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Land Ward Aura',
    manaCost: ['W'],
    types: ['enchantment'],
    subtypes: ['Aura'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'Enchant permanent. Enchanted land has hexproof. Enchanted creature gets +0/+1.',
    abilities: [
      enchant({}),
      staticAbility({
        kind: 'grantKeyword',
        subject: { kind: 'attached', types: ['land'] },
        keyword: { kind: 'hexproof' },
      }),
      staticAbility({
        kind: 'modifyPt',
        subject: { kind: 'attached', types: ['creature'] },
        power: 0,
        toughness: 1,
      }),
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Legend Aura',
    manaCost: ['2', 'B'],
    types: ['enchantment'],
    subtypes: ['Aura'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Enchant permanent. Enchanted legendary creature gets +2/+2.',
    abilities: [
      enchant({}),
      staticAbility({
        kind: 'modifyPt',
        subject: { kind: 'attached', types: ['creature'], supertypes: ['legendary'] },
        power: 2,
        toughness: 2,
      }),
    ],
  }),
  // ---- Clue (CR 111.10f); SYNTHETIC Food Maker, in synthetic-triggers.ts, makes Food.
  singleFace({
    name: 'SYNTHETIC Clue Maker',
    manaCost: ['1', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Create a Clue token.',
    spell: {
      effect: { kind: 'createToken', token: { kind: 'preset', preset: 'Clue' }, count: 1 },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Feast Scout',
    manaCost: ['1', 'G'],
    types: ['creature'],
    subtypes: ['Construct'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 2,
    toughness: 1,
    oracleText: 'When this creature enters, create a Food token.',
    abilities: [
      {
        kind: 'triggered',
        trigger: entersThis,
        effect: { kind: 'createToken', token: { kind: 'preset', preset: 'Food' }, count: 1 },
      },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Clue Scout',
    manaCost: ['1', 'U'],
    types: ['creature'],
    subtypes: ['Construct'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 1,
    toughness: 2,
    oracleText: 'When this creature enters, create a Clue token.',
    abilities: [
      {
        kind: 'triggered',
        trigger: entersThis,
        effect: { kind: 'createToken', token: { kind: 'preset', preset: 'Clue' }, count: 1 },
      },
    ],
  }),
];
