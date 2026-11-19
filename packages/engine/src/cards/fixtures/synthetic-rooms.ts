/**
 * SYNTHETIC ROOMS. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of the split cards with a shared type line (CR 709.5): the names start with "SYNTHETIC " and are the face names joined by " // "; oracleId is null. The text
 * describes what the AST does; it is not Oracle text.
 *
 * - SYNTHETIC Watch Room // Vault Room: Watch ({1}{W}) "Whenever you gain life, each opponent loses 1 life."; Vault ({2}{B}) "When you unlock this door, each opponent loses 2 life."
 * - SYNTHETIC Plain Room // Bare Room: two doors with no ability, the first {W}, the second {1}{U}: the mana value, colors and name of what is unlocked.
 * - SYNTHETIC Mirror Wash: "Target enchantment becomes a copy of another target enchantment until end of turn." (a copy of a Room: the halves are copied, the designations are not).
 * - SYNTHETIC Door Bounce: "Return target enchantment to its owner's hand." (a Room that returns is a new object with no designation).
 */
import type { Ability } from '../../ast/types';
import type { CardDefinition, CardFace } from '../definition';
import { singleFace } from './helpers';

const OPPONENTS = { kind: 'eachOpponent' } as const;

const room = (
  name: string,
  manaCost: readonly string[],
  colors: CardFace['colors'],
  oracleText: string,
  abilities: readonly Ability[],
): CardFace => ({
  name,
  manaCost,
  supertypes: [],
  types: ['enchantment'],
  subtypes: ['Room'],
  colors,
  power: null,
  toughness: null,
  loyalty: null,
  defense: null,
  oracleText,
  abilities,
  spell: null,
});

const card = (left: CardFace, right: CardFace): CardDefinition => ({
  oracleId: null,
  name: `SYNTHETIC ${left.name} // ${right.name}`,
  layout: 'split',
  faces: [left, right],
  colorIdentity: [...new Set([...left.colors, ...right.colors])],
  support: 'supported',
});

const ENCHANTMENT = { zone: 'battlefield', types: ['enchantment'] } as const;

export const SYNTHETIC_ROOM_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Mirror Wash',
    manaCost: ['U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText:
      'Target enchantment becomes a copy of another target enchantment until end of turn.',
    spell: {
      targets: [
        { id: 't1', what: { kind: 'object', filter: ENCHANTMENT } },
        { id: 't2', what: { kind: 'object', filter: ENCHANTMENT } },
      ],
      effect: {
        kind: 'becomeCopy',
        objects: { kind: 'target', id: 't1' },
        of: { kind: 'target', id: 't2' },
        duration: 'untilEndOfTurn',
      },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Door Bounce',
    manaCost: ['U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: "Return target enchantment to its owner's hand.",
    spell: {
      targets: [{ id: 't1', what: { kind: 'object', filter: ENCHANTMENT } }],
      effect: {
        kind: 'moveToZone',
        objects: { kind: 'target', id: 't1' },
        to: 'hand',
      },
    },
  }),
  card(
    room('Watch Room', ['1', 'W'], ['W'], 'Whenever you gain life, each opponent loses 1 life.', [
      {
        kind: 'triggered',
        trigger: { kind: 'lifeGained', who: 'you' },
        effect: { kind: 'loseLife', player: OPPONENTS, amount: 1 },
      },
    ]),
    room(
      'Vault Room',
      ['2', 'B'],
      ['B'],
      'When you unlock this door, each opponent loses 2 life.',
      [
        {
          kind: 'triggered',
          trigger: { kind: 'doorUnlocked', who: 'you', door: 'this' },
          effect: { kind: 'loseLife', player: OPPONENTS, amount: 2 },
        },
      ],
    ),
  ),
  card(room('Plain Room', ['W'], ['W'], '', []), room('Bare Room', ['1', 'U'], ['U'], '', [])),
];
