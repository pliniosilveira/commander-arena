/**
 * SYNTHETIC CARDS FOR STATIC ABILITIES THAT PROTECT A PLAYER OR A PERMANENT, AND FOR "CAN'T CAST". NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-149 (the Angels slice): "You have hexproof" with "Whenever this creature is dealt damage, you gain that much
 * life", "You can't lose the game and your opponents can't win the game", "Prevent all combat damage that would be dealt to this creature"
 * (and all damage), "You can't cast ~ during your first, second, or third turns of the game" (with flash too), and "Activate only if you
 * control three or more lands with the same name". Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it
 * is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability, PreventScope } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { kw, singleFace } from './helpers';

const YOU = { kind: 'you' } as const;
const THIS = { kind: 'this' } as const;

const angel = (
  name: string,
  cost: readonly string[],
  power: number,
  toughness: number,
  abilities: readonly Ability[],
  words: string,
): CardDefinition =>
  singleFace({
    name,
    manaCost: [...cost],
    types: ['creature'],
    subtypes: ['Angel'],
    colors: ['W'],
    colorIdentity: ['W'],
    power,
    toughness,
    oracleText: words,
    abilities: [...abilities],
  });

const shielded = (name: string, scope: PreventScope, words: string): CardDefinition =>
  angel(
    name,
    ['3', 'W'],
    3,
    3,
    [
      kw('flying'),
      { kind: 'static', static: { kind: 'preventDamageToThis', subject: THIS, scope } },
    ],
    words,
  );

/** "You can't cast this creature during your first, second, or third turns of the game." */
const lateCast = (name: string, flash: boolean): CardDefinition =>
  angel(
    name,
    ['W', 'W'],
    3,
    3,
    [
      ...(flash ? [kw('flash')] : []),
      kw('flying'),
      kw('vigilance'),
      {
        kind: 'static',
        static: { kind: 'cantCastThis' },
        condition: { kind: 'ownTurnNumber', compare: { cmp: 'atMost', value: 3 } },
      },
    ],
    `${flash ? 'Flash. ' : ''}You can't cast this creature during your first, second, or third turns of the game. Flying, vigilance`,
  );

export const SYNTHETIC_ANGELS_STATICS_LIST: readonly CardDefinition[] = [
  // "Flying, vigilance. You have hexproof. Whenever this creature is dealt damage, you gain that much life."
  angel(
    'SYNTHETIC Warded Angel',
    ['2', 'W'],
    2,
    3,
    [
      kw('flying'),
      kw('vigilance'),
      { kind: 'static', static: { kind: 'playerHexproof' } },
      {
        kind: 'triggered',
        trigger: { kind: 'dealtDamage', what: THIS },
        effect: { kind: 'gainLife', player: YOU, amount: { kind: 'triggerDamage' } },
      },
    ],
    'Flying, vigilance. You have hexproof. Whenever this creature is dealt damage, you gain that much life.',
  ),
  // "Flash. Flying. You can't lose the game and your opponents can't win the game."
  angel(
    'SYNTHETIC Undying Herald',
    ['4', 'W', 'W', 'W'],
    6,
    6,
    [
      kw('flash'),
      kw('flying'),
      { kind: 'static', static: { kind: 'cantLoseGame' } },
      { kind: 'static', static: { kind: 'opponentsCantWin' } },
    ],
    "Flash. Flying. You can't lose the game and your opponents can't win the game.",
  ),
  shielded(
    'SYNTHETIC Shielded Seraph',
    'combat',
    'Flying. Prevent all combat damage that would be dealt to this creature.',
  ),
  shielded(
    'SYNTHETIC Stone Seraph',
    'all',
    'Flying. Prevent all damage that would be dealt to this creature.',
  ),
  lateCast('SYNTHETIC Late Avenger', false),
  lateCast('SYNTHETIC Quick Avenger', true),
  // "{2}, {T}: Draw a card. Activate only if you control three or more lands with the same name."
  singleFace({
    name: 'SYNTHETIC Land Atlas',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      '{2}, {T}: Draw a card. Activate only if you control three or more lands with the same name.',
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['2'] }, { kind: 'tap' }],
        effect: { kind: 'draw', player: YOU, count: 1 },
        activateOnlyIf: { kind: 'sameNameAtLeast', filter: { types: ['land'] }, count: 3 },
      },
    ],
  }),
  // "Whenever a nontoken creature you control dies, investigate. Clues you control have exalted."
  angel(
    'SYNTHETIC Truth Merchant',
    ['2', 'W', 'W'],
    2,
    5,
    [
      kw('flying'),
      {
        kind: 'triggered',
        trigger: { kind: 'dies', what: { types: ['creature'], controller: 'you', token: false } },
        effect: { kind: 'createToken', token: { kind: 'preset', preset: 'Clue' }, count: 1 },
      },
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: { kind: 'filter', filter: { subtypes: ['Clue'], controller: 'you' } },
          keyword: { kind: 'exalted' },
        },
      },
    ],
    'Flying. Whenever a nontoken creature you control dies, investigate. Clues you control have exalted.',
  ),
  // "Creatures you control have prowess." (the other keyword whose every instance counts) and a printed exalted to add to.
  angel(
    'SYNTHETIC Exalted Lord',
    ['3', 'W'],
    2,
    2,
    [
      kw('exalted'),
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: { kind: 'filter', filter: { types: ['creature'], controller: 'you' } },
          keyword: { kind: 'exalted' },
        },
      },
    ],
    'Exalted. Creatures you control have exalted.',
  ),
  // "Flying. As long as this creature is untapped, creatures can't attack you or planeswalkers you control unless their controller pays {1} for
  //  each of those creatures. As long as this creature is attacking, creatures can't block unless their controller pays {1} for each of those
  //  creatures."
  angel(
    'SYNTHETIC Tithe Angel',
    ['1', 'W', 'W', 'W'],
    3,
    5,
    [
      kw('flying'),
      {
        kind: 'static',
        static: {
          kind: 'attackTax',
          cost: [{ kind: 'mana', symbols: ['1'] }],
          planeswalkers: true,
        },
        condition: { kind: 'thisMatches', filter: { tapped: false } },
      },
      {
        kind: 'static',
        static: {
          kind: 'blockTax',
          cost: [{ kind: 'mana', symbols: ['1'] }],
          whileAttacking: true,
        },
      },
    ],
    "Flying. As long as this creature is untapped, creatures can't attack you or planeswalkers you control unless their controller pays {1} for each of those creatures. As long as this creature is attacking, creatures can't block unless their controller pays {1} for each of those creatures.",
  ),
  // "Creatures can't block unless their controller pays {1} for each of those creatures." (always, not only while attacking)
  singleFace({
    name: 'SYNTHETIC Toll Bridge',
    manaCost: ['2'],
    types: ['enchantment'],
    colors: [],
    colorIdentity: [],
    oracleText:
      "Creatures can't block unless their controller pays {1} for each of those creatures.",
    abilities: [
      {
        kind: 'static',
        static: { kind: 'blockTax', cost: [{ kind: 'mana', symbols: ['1'] }] },
      },
    ],
  }),
];
