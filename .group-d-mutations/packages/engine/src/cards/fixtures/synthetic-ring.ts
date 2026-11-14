/**
 * SYNTHETIC CARDS FOR THE RING. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-196 (the Ring tempts you, CR 701.54, the subsystem of There and Back Again in the Korvold deck).
 * SYNTHETIC There and Back Again has the type line, mana cost and Oracle text of the real card, from the owner's request file of 2026-10-29
 * (`docs/proposals/korvold-deck-analysis.md`); a Saga has no power or toughness, and Smaug's 6/6 with flying and haste and his death trigger are in
 * the card's own text, so nothing in it is invented. It is not the definition of the real card (which the parser reads from its Oracle text,
 * `packages/cards`). The others are invented outright, to test what the Saga does not: the Ring on its own (a sorcery), the trigger "whenever
 * the Ring tempts you" (an enchantment) and the condition "if you control your Ring-bearer" (an instant). Names start with "SYNTHETIC "; oracleId is
 * null; the text of the invented ones describes what the AST does and is not Oracle text.
 */
import type { TokenDefinition } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const YOU = { kind: 'you' } as const;
const T1 = { kind: 'target', id: 't1' } as const;

/** Smaug, "a legendary 6/6 red Dragon creature token with flying, haste, and 'When Smaug dies, create fourteen Treasure tokens.'". */
const SMAUG: TokenDefinition = {
  name: 'Smaug',
  manaCost: null,
  supertypes: ['legendary'],
  types: ['creature'],
  subtypes: ['Dragon'],
  colors: ['R'],
  power: 6,
  toughness: 6,
  loyalty: null,
  defense: null,
  oracleText: 'Flying, haste\nWhen Smaug dies, create fourteen Treasure tokens.',
  abilities: [
    { kind: 'keyword', keyword: { kind: 'flying' } },
    { kind: 'keyword', keyword: { kind: 'haste' } },
    {
      kind: 'triggered',
      trigger: { kind: 'dies', what: { kind: 'this' } },
      effect: {
        kind: 'createToken',
        token: { kind: 'preset', preset: 'Treasure' },
        count: 14,
      },
    },
  ],
};

export const SYNTHETIC_RING_LIST: readonly CardDefinition[] = [
  (() => {
    const base = singleFace({
      name: 'SYNTHETIC There and Back Again',
      manaCost: ['3', 'R', 'R'],
      types: ['enchantment'],
      subtypes: ['Saga'],
      colors: ['R'],
      colorIdentity: ['R'],
      oracleText:
        '(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Up to one target creature can\'t block for as long as you control this Saga. The Ring tempts you.\nII — Search your library for a Mountain card, put it onto the battlefield, then shuffle.\nIII — Create Smaug, a legendary 6/6 red Dragon creature token with flying, haste, and "When Smaug dies, create fourteen Treasure tokens."',
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'chapter', from: 1, to: 1 },
          targets: [
            {
              id: 't1',
              min: 0,
              max: 1,
              what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
            },
          ],
          effect: {
            kind: 'sequence',
            effects: [
              {
                kind: 'restrict',
                objects: T1,
                restriction: 'cantBlock',
                duration: 'forAsLongAsYouControlThis',
              },
              { kind: 'ringTempts' },
            ],
          },
        },
        {
          kind: 'triggered',
          trigger: { kind: 'chapter', from: 2, to: 2 },
          effect: {
            kind: 'search',
            player: YOU,
            filter: { subtypes: ['Mountain'] },
            max: 1,
            destinations: [{ zone: 'battlefield', count: 1 }],
            reveal: false,
            shuffle: true,
          },
        },
        {
          kind: 'triggered',
          trigger: { kind: 'chapter', from: 3, to: 3 },
          effect: {
            kind: 'createToken',
            count: 1,
            token: { kind: 'custom', definition: SMAUG },
          },
        },
      ],
    });
    const face = base.faces[0];
    if (face === undefined) throw new Error('SYNTHETIC There and Back Again has no face');
    return { ...base, layout: 'saga', faces: [{ ...face, finalChapter: 3 }] };
  })(),
  // "The Ring tempts you." (invented: the Ring on its own)
  singleFace({
    name: 'SYNTHETIC Ring Rite',
    manaCost: ['1', 'B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'The Ring tempts you.',
    spell: { effect: { kind: 'ringTempts' } },
  }),
  // "Whenever the Ring tempts you, you gain 1 life." (invented; an enchantment, so it still triggers when the player controls no creature)
  singleFace({
    name: 'SYNTHETIC Ring Watcher',
    manaCost: ['1', 'W'],
    types: ['enchantment'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'Whenever the Ring tempts you, you gain 1 life.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'ringTempted' },
        effect: { kind: 'gainLife', player: YOU, amount: 1 },
      },
    ],
  }),
  // "If you control your Ring-bearer, draw a card." (invented)
  singleFace({
    name: 'SYNTHETIC Bearer Oath',
    manaCost: ['U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'If you control your Ring-bearer, draw a card.',
    spell: {
      effect: {
        kind: 'conditional',
        condition: { kind: 'controlsRingBearer' },
        effect: { kind: 'draw', player: YOU, count: 1 },
      },
    },
  }),
];
