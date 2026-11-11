/**
 * SYNTHETIC MULTI-FACE CARDS. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of the split (CR 709), Adventure (CR 715) and double-faced (CR 712)
 * layouts. The card name starts with "SYNTHETIC " and is the face names joined by " // " (Scryfall's
 * convention for a card with several faces); oracleId is null. The text describes what the AST
 * does; it is not Oracle text and none of these copies a real card.
 *
 * Split: SYNTHETIC Singe // Mend (two instants), SYNTHETIC Study // Zap (a sorcery and an instant).
 * Adventure: SYNTHETIC Brawler Bear // Chop (the Adventure has a target), SYNTHETIC Wise Owl // Peek
 * (it has none). Modal double-faced: SYNTHETIC Ridge Drake // Ridge Pass (a creature and a land),
 * SYNTHETIC Zeal Charm // Shock Pass (a sorcery and a land that asks to pay 2 life), SYNTHETIC Twin
 * Knight // Twin Wall (two creatures). Transforming: SYNTHETIC Moon Cub // Moon Beast (transforms at
 * each of its controller's upkeeps), SYNTHETIC Squire // Grown Knight (transforms for mana). And one
 * single-faced card: SYNTHETIC Turn Over, an instant that transforms target creature.
 */
import type { Ability, Cost, Effect, SpellText } from '../../ast/types';
import type { CardType, Color, Subtype } from '../../characteristics';
import type { CardDefinition, CardFace, CardLayout } from '../definition';
import { singleFace } from './helpers';

const THIS = { kind: 'this' } as const;
const YOU = { kind: 'you' } as const;
const tap: Cost = { kind: 'tap' };

interface FaceInput {
  readonly name: string;
  readonly manaCost: readonly string[] | null;
  readonly types: readonly CardType[];
  readonly subtypes?: readonly Subtype[];
  readonly colors: readonly Color[];
  readonly power?: number;
  readonly toughness?: number;
  readonly oracleText: string;
  readonly abilities?: readonly Ability[];
  readonly spell?: SpellText;
}

const face = (input: FaceInput): CardFace => ({
  name: input.name,
  manaCost: input.manaCost,
  supertypes: [],
  types: input.types,
  subtypes: input.subtypes ?? [],
  colors: input.colors,
  power: input.power ?? null,
  toughness: input.toughness ?? null,
  loyalty: null,
  defense: null,
  oracleText: input.oracleText,
  abilities: input.abilities ?? [],
  spell: input.spell ?? null,
});

const card = (
  layout: CardLayout,
  faces: readonly [CardFace, CardFace],
  colorIdentity: readonly Color[],
): CardDefinition => ({
  oracleId: null,
  name: `SYNTHETIC ${faces.map((f) => f.name).join(' // ')}`,
  layout,
  faces,
  colorIdentity,
  support: 'supported',
});

const CREATURE_TARGET = {
  id: 't1',
  what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
} as const;
const gain = (amount: number): Effect => ({ kind: 'gainLife', player: YOU, amount });
const draw = (count: number): Effect => ({ kind: 'draw', player: YOU, count });
const damageTarget = (amount: number): SpellText => ({
  targets: [CREATURE_TARGET],
  effect: { kind: 'dealDamage', amount, to: { kind: 'target', id: 't1' } },
});
const transformThis: Effect = { kind: 'transform', objects: THIS };
const landMana = (color: Color): Ability => ({
  kind: 'mana',
  cost: [tap],
  production: { kind: 'fixed', mana: [color] },
});

export const SYNTHETIC_LAYOUT_LIST: readonly CardDefinition[] = [
  // A single-faced spell that transforms: it does nothing to what is not a double-faced permanent.
  singleFace({
    name: 'SYNTHETIC Turn Over',
    manaCost: ['1'],
    types: ['instant'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Transform target creature.',
    spell: {
      targets: [CREATURE_TARGET],
      effect: { kind: 'transform', objects: { kind: 'target', id: 't1' } },
    },
  }),
  // ---- Split (CR 709)
  card(
    'split',
    [
      face({
        name: 'Singe',
        manaCost: ['R'],
        types: ['instant'],
        colors: ['R'],
        oracleText: 'Singe deals 2 damage to target creature.',
        spell: damageTarget(2),
      }),
      face({
        name: 'Mend',
        manaCost: ['1', 'W'],
        types: ['instant'],
        colors: ['W'],
        oracleText: 'You gain 4 life.',
        spell: { effect: gain(4) },
      }),
    ],
    ['W', 'R'],
  ),
  card(
    'split',
    [
      face({
        name: 'Study',
        manaCost: ['1', 'U'],
        types: ['sorcery'],
        colors: ['U'],
        oracleText: 'Draw two cards.',
        spell: { effect: draw(2) },
      }),
      face({
        name: 'Zap',
        manaCost: ['R'],
        types: ['instant'],
        colors: ['R'],
        oracleText: 'Zap deals 1 damage to each opponent.',
        spell: { effect: { kind: 'dealDamage', amount: 1, to: { kind: 'eachOpponent' } } },
      }),
    ],
    ['U', 'R'],
  ),
  // ---- Adventure (CR 715): faces[0] the card, faces[1] its Adventure
  card(
    'adventure',
    [
      face({
        name: 'Brawler Bear',
        manaCost: ['1', 'G'],
        types: ['creature'],
        subtypes: ['Bear'],
        colors: ['G'],
        power: 2,
        toughness: 2,
        oracleText: '',
      }),
      face({
        name: 'Chop',
        manaCost: ['R'],
        types: ['instant'],
        subtypes: ['Adventure'],
        colors: ['R'],
        oracleText: 'Chop deals 2 damage to target creature. (Then exile this card.)',
        spell: damageTarget(2),
      }),
    ],
    ['R', 'G'],
  ),
  card(
    'adventure',
    [
      face({
        name: 'Wise Owl',
        manaCost: ['2', 'U'],
        types: ['creature'],
        subtypes: ['Bird'],
        colors: ['U'],
        power: 1,
        toughness: 1,
        oracleText: 'Flying',
        abilities: [{ kind: 'keyword', keyword: { kind: 'flying' } }],
      }),
      face({
        name: 'Peek',
        manaCost: ['U'],
        types: ['sorcery'],
        subtypes: ['Adventure'],
        colors: ['U'],
        oracleText: 'Draw a card. (Then exile this card.)',
        spell: { effect: draw(1) },
      }),
    ],
    ['U'],
  ),
  // ---- Modal double-faced (CR 712.3)
  card(
    'modal_dfc',
    [
      face({
        name: 'Ridge Drake',
        manaCost: ['2', 'R'],
        types: ['creature'],
        subtypes: ['Dragon'],
        colors: ['R'],
        power: 3,
        toughness: 2,
        oracleText: '',
      }),
      face({
        name: 'Ridge Pass',
        manaCost: null,
        types: ['land'],
        colors: [],
        oracleText: '{T}: Add {R}.',
        abilities: [landMana('R')],
      }),
    ],
    ['R'],
  ),
  card(
    'modal_dfc',
    [
      face({
        name: 'Zeal Charm',
        manaCost: ['1', 'B'],
        types: ['sorcery'],
        colors: ['B'],
        oracleText: 'You gain 3 life.',
        spell: { effect: gain(3) },
      }),
      face({
        name: 'Shock Pass',
        manaCost: null,
        types: ['land'],
        colors: [],
        oracleText:
          "As this land enters, you may pay 2 life. If you don't, it enters tapped. {T}: Add {B}.",
        abilities: [
          {
            kind: 'replacement',
            replacement: {
              kind: 'entersTappedUnlessPays',
              cost: [{ kind: 'payLife', amount: 2 }],
            },
          },
          landMana('B'),
        ],
      }),
    ],
    ['B'],
  ),
  card(
    'modal_dfc',
    [
      face({
        name: 'Twin Knight',
        manaCost: ['1', 'W'],
        types: ['creature'],
        subtypes: ['Knight'],
        colors: ['W'],
        power: 2,
        toughness: 1,
        oracleText: 'Vigilance',
        abilities: [{ kind: 'keyword', keyword: { kind: 'vigilance' } }],
      }),
      face({
        name: 'Twin Wall',
        manaCost: ['2', 'W', 'W'],
        types: ['creature'],
        subtypes: ['Wall'],
        colors: ['W'],
        power: 1,
        toughness: 5,
        oracleText: 'Defender',
        abilities: [{ kind: 'keyword', keyword: { kind: 'defender' } }],
      }),
    ],
    ['W'],
  ),
  // ---- Transforming double-faced (CR 712.2)
  card(
    'transform',
    [
      face({
        name: 'Moon Cub',
        manaCost: ['1', 'G'],
        types: ['creature'],
        subtypes: ['Wolf'],
        colors: ['G'],
        power: 2,
        toughness: 2,
        oracleText: 'At the beginning of your upkeep, transform this creature.',
        abilities: [
          { kind: 'triggered', trigger: { kind: 'upkeep', whose: 'you' }, effect: transformThis },
        ],
      }),
      face({
        name: 'Moon Beast',
        manaCost: null,
        types: ['creature'],
        subtypes: ['Wolf', 'Werewolf'],
        colors: ['G'],
        power: 4,
        toughness: 4,
        oracleText: 'Trample. At the beginning of your upkeep, transform this creature.',
        abilities: [
          { kind: 'keyword', keyword: { kind: 'trample' } },
          { kind: 'triggered', trigger: { kind: 'upkeep', whose: 'you' }, effect: transformThis },
        ],
      }),
    ],
    ['G'],
  ),
  card(
    'transform',
    [
      face({
        name: 'Squire',
        manaCost: ['W'],
        types: ['creature'],
        subtypes: ['Human'],
        colors: ['W'],
        power: 1,
        toughness: 1,
        oracleText: '{1}: Transform this creature.',
        abilities: [
          { kind: 'activated', cost: [{ kind: 'mana', symbols: ['1'] }], effect: transformThis },
        ],
      }),
      face({
        name: 'Grown Knight',
        manaCost: null,
        types: ['creature'],
        subtypes: ['Human', 'Knight'],
        colors: ['W'],
        power: 3,
        toughness: 3,
        oracleText: 'First strike. {2}: Transform this creature.',
        abilities: [
          { kind: 'keyword', keyword: { kind: 'firstStrike' } },
          { kind: 'activated', cost: [{ kind: 'mana', symbols: ['2'] }], effect: transformThis },
        ],
      }),
    ],
    ['W'],
  ),
];
