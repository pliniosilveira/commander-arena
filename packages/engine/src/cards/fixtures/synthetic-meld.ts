/**
 * SYNTHETIC MELD CARDS. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of meld (CR 701.42, 712.4, 712.8g, 712.21, D-991, D-992). Two trios, each two meld cards that form a pair and the combined face
 * they become (`faces[1]` of both cards, the same face, as the card data of a real pair holds it): SYNTHETIC Dusk Squire and SYNTHETIC Dawn Squire meld
 * into SYNTHETIC Twilight Titan, SYNTHETIC Ember Squire and SYNTHETIC Ash Squire into SYNTHETIC Cinder Titan. SYNTHETIC Stray Squire is a meld card whose
 * counterpart is not in any game, for the checks of CR 701.42b. The names start with "SYNTHETIC ", oracleId is null, and the text describes what the AST
 * does; none of this is Oracle text and none of it copies a real card.
 *
 * Dusk Squire and Ember Squire carry the meld ability the way a real front half does (at the beginning of its controller's end step, if they both own
 * and control it and a creature named as its counterpart, exile them, then meld them); their counterparts have none (CR 712.4a: one card of each pair has
 * it). The two trios differ so that a card of one cannot be melded with a card of the other.
 */
import type { Ability, Effect } from '../../ast/types';
import type { CardType, Color, Subtype, Supertype } from '../../characteristics';
import type { CardDefinition, CardFace } from '../definition';
import { singleFace } from './helpers';

interface FaceInput {
  readonly name: string;
  readonly manaCost: readonly string[] | null;
  readonly supertypes?: readonly Supertype[];
  readonly types: readonly CardType[];
  readonly subtypes: readonly Subtype[];
  readonly colors: readonly Color[];
  readonly power: number;
  readonly toughness: number;
  readonly oracleText: string;
  readonly abilities?: readonly Ability[];
}

const face = (input: FaceInput): CardFace => ({
  name: input.name,
  manaCost: input.manaCost,
  supertypes: input.supertypes ?? [],
  types: input.types,
  subtypes: input.subtypes,
  colors: input.colors,
  power: input.power,
  toughness: input.toughness,
  loyalty: null,
  defense: null,
  oracleText: input.oracleText,
  abilities: input.abilities ?? [],
  spell: null,
});

const gainLife = (amount: number): Effect => ({
  kind: 'gainLife',
  player: { kind: 'you' },
  amount,
});

/** The combined face of a pair: a legendary creature with no mana cost (CR 202.3c: its mana value comes from the two front faces). */
const combined = (name: string, colors: readonly Color[]): CardFace =>
  face({
    name,
    manaCost: null,
    supertypes: ['legendary'],
    types: ['creature'],
    subtypes: ['Giant'],
    colors,
    power: 8,
    toughness: 8,
    oracleText:
      'Flying\nWhen this creature enters, you gain 3 life.\nWhen this creature dies, draw a card.',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'flying' } },
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: gainLife(3),
      },
      {
        kind: 'triggered',
        trigger: { kind: 'dies', what: { kind: 'this' } },
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
      },
    ],
  });

/** The meld ability of a front half: "At the beginning of your end step, if you both own and control this creature and a creature named P, exile them, then meld them into R." */
const meldAbility = (partner: string, result: string): Ability => ({
  kind: 'triggered',
  trigger: { kind: 'endStep', whose: 'you' },
  interveningIf: { kind: 'ownsAndControlsNamed', name: partner, type: 'creature' },
  effect: { kind: 'meld', partner, result },
});

const meldCard = (
  front: Omit<FaceInput, 'manaCost' | 'types'> & { readonly manaCost: readonly string[] },
  partner: string,
  back: CardFace,
  colorIdentity: readonly Color[],
): CardDefinition => ({
  oracleId: null,
  name: front.name,
  layout: 'meld',
  faces: [face({ ...front, types: ['creature'] }), back],
  colorIdentity,
  meld: { partner },
  support: 'supported',
});

const TWILIGHT = combined('SYNTHETIC Twilight Titan', ['W', 'B']);
const CINDER = combined('SYNTHETIC Cinder Titan', ['R', 'G']);

export const SYNTHETIC_MELD_LIST: readonly CardDefinition[] = [
  meldCard(
    {
      name: 'SYNTHETIC Dusk Squire',
      manaCost: ['2', 'W'],
      colors: ['W'],
      subtypes: ['Human', 'Knight'],
      power: 2,
      toughness: 2,
      oracleText:
        'Vigilance\nAt the beginning of your end step, if you both own and control this creature and a creature named SYNTHETIC Dawn Squire, exile them, then meld them into SYNTHETIC Twilight Titan.',
      abilities: [
        { kind: 'keyword', keyword: { kind: 'vigilance' } },
        meldAbility('SYNTHETIC Dawn Squire', 'SYNTHETIC Twilight Titan'),
      ],
    },
    'SYNTHETIC Dawn Squire',
    TWILIGHT,
    ['W'],
  ),
  meldCard(
    {
      name: 'SYNTHETIC Dawn Squire',
      manaCost: ['1', 'B'],
      colors: ['B'],
      subtypes: ['Human', 'Cleric'],
      power: 1,
      toughness: 3,
      oracleText: '(Melds with SYNTHETIC Dusk Squire.)',
    },
    'SYNTHETIC Dusk Squire',
    TWILIGHT,
    ['B'],
  ),
  meldCard(
    {
      name: 'SYNTHETIC Ember Squire',
      manaCost: ['1', 'R'],
      colors: ['R'],
      subtypes: ['Human', 'Warrior'],
      power: 2,
      toughness: 1,
      oracleText:
        'At the beginning of your end step, if you both own and control this creature and a creature named SYNTHETIC Ash Squire, exile them, then meld them into SYNTHETIC Cinder Titan.',
      abilities: [meldAbility('SYNTHETIC Ash Squire', 'SYNTHETIC Cinder Titan')],
    },
    'SYNTHETIC Ash Squire',
    CINDER,
    ['R'],
  ),
  meldCard(
    {
      name: 'SYNTHETIC Ash Squire',
      manaCost: ['3', 'G'],
      colors: ['G'],
      subtypes: ['Elf', 'Druid'],
      power: 3,
      toughness: 3,
      oracleText: '(Melds with SYNTHETIC Ember Squire.)',
    },
    'SYNTHETIC Ember Squire',
    CINDER,
    ['G'],
  ),
  // A meld card whose counterpart is not in the game (CR 701.42b: "meld cards that don't form a meld pair can't be melded").
  meldCard(
    {
      name: 'SYNTHETIC Stray Squire',
      manaCost: ['W'],
      colors: ['W'],
      subtypes: ['Human'],
      power: 1,
      toughness: 1,
      oracleText: '(Melds with SYNTHETIC Absent Squire.)',
    },
    'SYNTHETIC Absent Squire',
    TWILIGHT,
    ['W'],
  ),
  // ---- Helpers of the tests: what moves a melded permanent, and what watches it.
  singleFace({
    name: 'SYNTHETIC Meld Exile',
    manaCost: ['1'],
    types: ['instant'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Exile target creature.',
    spell: {
      targets: [
        {
          id: 't1',
          what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
        },
      ],
      effect: { kind: 'exile', objects: { kind: 'target', id: 't1' } },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Meld Tuck',
    manaCost: ['1'],
    types: ['instant'],
    colors: [],
    colorIdentity: [],
    oracleText: "Put target creature on top of its owner's library.",
    spell: {
      targets: [
        {
          id: 't1',
          what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
        },
      ],
      effect: {
        kind: 'moveToZone',
        objects: { kind: 'target', id: 't1' },
        to: 'library',
        position: 'top',
      },
    },
  }),
  // Whenever a creature dies, you gain 1 life; whenever a creature leaves the battlefield, you gain 10; whenever a creature enters, you gain 100.
  singleFace({
    name: 'SYNTHETIC Meld Watcher',
    manaCost: ['1', 'W'],
    types: ['enchantment'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText:
      'Whenever a creature dies, you gain 1 life.\nWhenever a creature leaves the battlefield, you gain 10 life.\nWhenever a creature enters, you gain 100 life.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'dies', what: { zone: 'battlefield', types: ['creature'] } },
        effect: gainLife(1),
      },
      {
        kind: 'triggered',
        trigger: { kind: 'leavesBattlefield', what: { zone: 'battlefield', types: ['creature'] } },
        effect: gainLife(10),
      },
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { zone: 'battlefield', types: ['creature'] } },
        effect: gainLife(100),
      },
    ],
  }),
];
