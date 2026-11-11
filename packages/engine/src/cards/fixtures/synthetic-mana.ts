/**
 * SYNTHETIC MANA AND LAND CARDS. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of the mana and lands slice: a choice of two colors (CR 605.1a, 605.3b), mana
 * abilities with an extra effect (CR 605.1a) and with a mana cost, "enters tapped unless" lands and
 * the pay-life-or-enter-tapped replacement (CR 614.12), and "no maximum hand size" (CR 402.2).
 * Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is
 * not Oracle text and none of these is a copy of a real card's definition.
 */
import type { Ability, Condition } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const tap = { kind: 'tap' } as const;
const YOU = { kind: 'you' } as const;
const BASIC_LAND = { types: ['land'], supertypes: ['basic'] } as const;

const entersTappedUnless = (unless: Condition): Ability => ({
  kind: 'replacement',
  replacement: { kind: 'entersTapped', unless },
});

export const SYNTHETIC_MANA_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Dual Land',
    manaCost: null,
    types: ['land'],
    colors: [],
    colorIdentity: ['U', 'B'],
    oracleText: '{T}: Add {U} or {B}.',
    abilities: [{ kind: 'mana', cost: [tap], production: { kind: 'oneOf', colors: ['U', 'B'] } }],
  }),
  singleFace({
    name: 'SYNTHETIC Tri Land',
    manaCost: null,
    types: ['land'],
    colors: [],
    colorIdentity: ['W', 'U', 'B'],
    oracleText: '{T}: Add {W}, {U} or {B}.',
    abilities: [
      { kind: 'mana', cost: [tap], production: { kind: 'oneOf', colors: ['W', 'U', 'B'] } },
    ],
  }),
  // A pain land: colorless for free, or a choice of two colors for 1 damage to you.
  singleFace({
    name: 'SYNTHETIC Pain Land',
    manaCost: null,
    types: ['land'],
    colors: [],
    colorIdentity: ['U', 'B'],
    oracleText: '{T}: Add {C}. {T}: Add {U} or {B}. This land deals 1 damage to you.',
    abilities: [
      { kind: 'mana', cost: [tap], production: { kind: 'fixed', mana: ['C'] } },
      {
        kind: 'mana',
        cost: [tap],
        production: { kind: 'oneOf', colors: ['U', 'B'] },
        also: [{ kind: 'dealDamage', amount: 1, to: YOU }],
      },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Gain Land',
    manaCost: null,
    types: ['land'],
    colors: [],
    colorIdentity: ['W'],
    oracleText: '{T}: Add {W}. You gain 1 life.',
    abilities: [
      {
        kind: 'mana',
        cost: [tap],
        production: { kind: 'fixed', mana: ['W'] },
        also: [{ kind: 'gainLife', player: YOU, amount: 1 }],
      },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Drain Land',
    manaCost: null,
    types: ['land'],
    colors: [],
    colorIdentity: ['B'],
    oracleText: '{T}: Add {B}{B}. You lose 2 life.',
    abilities: [
      {
        kind: 'mana',
        cost: [tap],
        production: { kind: 'fixed', mana: ['B', 'B'] },
        also: [{ kind: 'loseLife', player: YOU, amount: 2 }],
      },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Signet',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: ['U', 'B'],
    oracleText: '{1}, {T}: Add {U}{B}.',
    abilities: [
      {
        kind: 'mana',
        cost: [{ kind: 'mana', symbols: ['1'] }, tap],
        production: { kind: 'fixed', mana: ['U', 'B'] },
      },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Green Signet',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: ['W', 'G'],
    oracleText: '{G}, {T}: Add {G}{W}{W}.',
    abilities: [
      {
        kind: 'mana',
        cost: [{ kind: 'mana', symbols: ['G'] }, tap],
        production: { kind: 'fixed', mana: ['G', 'W', 'W'] },
      },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Basic Check Land',
    manaCost: null,
    types: ['land'],
    colors: [],
    colorIdentity: ['W', 'U'],
    oracleText:
      'This land enters tapped unless you control two or more basic lands. {T}: Add {W} or {U}.',
    abilities: [
      entersTappedUnless({ kind: 'controlsAtLeast', filter: BASIC_LAND, count: 2 }),
      { kind: 'mana', cost: [tap], production: { kind: 'oneOf', colors: ['W', 'U'] } },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Other Lands Land',
    manaCost: null,
    types: ['land'],
    colors: [],
    colorIdentity: ['R'],
    oracleText: 'This land enters tapped unless you control two or more other lands. {T}: Add {R}.',
    abilities: [
      entersTappedUnless({
        kind: 'controlsAtLeast',
        filter: { types: ['land'], other: true },
        count: 2,
      }),
      { kind: 'mana', cost: [tap], production: { kind: 'fixed', mana: ['R'] } },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Crowd Land',
    manaCost: null,
    types: ['land'],
    colors: [],
    colorIdentity: ['G'],
    oracleText: 'This land enters tapped unless you have two or more opponents. {T}: Add {G}.',
    abilities: [
      entersTappedUnless({ kind: 'opponentsAtLeast', count: 2 }),
      { kind: 'mana', cost: [tap], production: { kind: 'fixed', mana: ['G'] } },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Shock Land',
    manaCost: null,
    types: ['land'],
    colors: [],
    colorIdentity: ['R', 'G'],
    oracleText:
      "As this land enters, you may pay 2 life. If you don't, it enters tapped. {T}: Add {R} or {G}.",
    abilities: [
      {
        kind: 'replacement',
        replacement: { kind: 'entersTappedUnlessPays', cost: [{ kind: 'payLife', amount: 2 }] },
      },
      { kind: 'mana', cost: [tap], production: { kind: 'oneOf', colors: ['R', 'G'] } },
    ],
  }),
  // A permanent spell with the same replacement: the question comes as the spell resolves.
  singleFace({
    name: 'SYNTHETIC Shock Rock',
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      "As this artifact enters, you may pay 3 life. If you don't, it enters tapped. {T}: Add {C}{C}.",
    abilities: [
      {
        kind: 'replacement',
        replacement: { kind: 'entersTappedUnlessPays', cost: [{ kind: 'payLife', amount: 3 }] },
      },
      { kind: 'mana', cost: [tap], production: { kind: 'fixed', mana: ['C', 'C'] } },
    ],
  }),
  // The sorcery that puts lands from the graveyard onto the battlefield (the effect-move path).
  singleFace({
    name: 'SYNTHETIC Land Recall',
    manaCost: ['1'],
    types: ['sorcery'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Return target land card from your graveyard to the battlefield.',
    spell: {
      targets: [
        {
          id: 't1',
          what: {
            kind: 'object',
            filter: { zone: 'graveyard', types: ['land'], controller: 'you' },
          },
        },
      ],
      effect: {
        kind: 'moveToZone',
        objects: { kind: 'target', id: 't1' },
        to: 'battlefield',
        // CR 110.2a: under the control of the caster (the land comes from their own graveyard).
        controller: 'you',
      },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Reading Hat',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: 'You have no maximum hand size.',
    abilities: [{ kind: 'static', static: { kind: 'noMaximumHandSize' } }],
  }),
];
