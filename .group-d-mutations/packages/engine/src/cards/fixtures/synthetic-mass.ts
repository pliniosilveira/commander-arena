/**
 * SYNTHETIC CARDS FOR MASS EFFECTS OVER A FILTER, THE KINDRED TYPE AND A COUNT OF COLORS. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-139 (the Artifacts slice): "return all attacking creatures to their owners' hands" (a mass move with a
 * combat-state filter), "destroy all artifacts, creatures and enchantments" (a union of types, indestructible and regeneration
 * honored), "exile each opponent's graveyard", and "each player sacrifices all permanents they control that are N or more colors"
 * on a Kindred card (the type of CR 308). Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does;
 * it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability, Effect, NumberComparison, ObjectFilter } from '../../ast/types';
import type { CardType, Color } from '../../characteristics';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const activated = (
  cost: Extract<Ability, { kind: 'activated' }>['cost'],
  effect: Effect,
): Ability => ({ kind: 'activated', cost, effect });

/** "Return all attacking creatures to their owners' hands." */
const bounceAttackers = (name: string): CardDefinition =>
  singleFace({
    name,
    manaCost: ['2', 'U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: "Return all attacking creatures to their owners' hands.",
    spell: {
      effect: {
        kind: 'moveToZone',
        objects: { kind: 'each', filter: { types: ['creature'], attacking: true } },
        to: 'hand',
      },
    },
  });

/** "{1}, {T}: Destroy all [types]." over a union of card types. */
const disk = (name: string, types: readonly CardType[], oracle: string): CardDefinition =>
  singleFace({
    name,
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: `{1}, {T}: Destroy all ${oracle}.`,
    abilities: [
      activated([{ kind: 'mana', symbols: ['1'] }, { kind: 'tap' }], {
        kind: 'destroy',
        objects: {
          kind: 'each',
          filter: { anyOf: types.map((t): ObjectFilter => ({ types: [t] })) },
        },
      }),
    ],
  });

/** "{T}, Sacrifice this artifact: Exile each [opponent's | player's] graveyard." */
const lantern = (name: string, who: 'eachOpponent' | 'eachPlayer', words: string): CardDefinition =>
  singleFace({
    name,
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: `{T}, Sacrifice this artifact: Exile each ${words} graveyard.`,
    abilities: [
      activated([{ kind: 'tap' }, { kind: 'sacrifice', what: { kind: 'this' } }], {
        kind: 'exile',
        objects: { kind: 'each', filter: { zone: 'graveyard', owner: { kind: who } } },
      }),
    ],
  });

/** "Each player sacrifices all permanents they control that are [a count of colors]." */
const purge = (
  name: string,
  types: readonly CardType[],
  colors: NumberComparison,
  words: string,
): CardDefinition =>
  singleFace({
    name,
    manaCost: ['3', 'B'],
    types,
    subtypes: types.includes('kindred') ? ['Eldrazi'] : [],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: `Each player sacrifices all permanents they control that are ${words}.`,
    spell: {
      effect: {
        kind: 'sacrifice',
        objects: { kind: 'each', filter: { colorCount: colors } },
      },
    },
  });

const COLORLESS_IDOL = (name: string, colors: readonly Color[]): CardDefinition =>
  singleFace({
    name,
    manaCost: colors.length === 0 ? ['2'] : ['1', ...colors],
    types: ['kindred', 'artifact'],
    subtypes: ['Eldrazi'],
    colors,
    colorIdentity: colors,
    oracleText: '',
  });

/** A 2/2 creature of the given colors and creature type, with no text (the targets of the mass effects above). */
const cub = (
  name: string,
  colors: readonly Color[],
  type: string,
  types: readonly CardType[] = ['creature'],
): CardDefinition =>
  singleFace({
    name,
    manaCost: colors.length === 0 ? ['2'] : ['1', ...colors],
    types,
    subtypes: [type],
    colors,
    colorIdentity: colors,
    power: 2,
    toughness: 2,
    oracleText: '',
  });

export const SYNTHETIC_MASS_LIST: readonly CardDefinition[] = [
  bounceAttackers('SYNTHETIC Recoil Wave'),
  disk(
    'SYNTHETIC Wipe Disk',
    ['artifact', 'creature', 'enchantment'],
    'artifacts, creatures and enchantments',
  ),
  disk('SYNTHETIC Rust Disk', ['artifact', 'land'], 'artifacts and lands'),
  lantern('SYNTHETIC Quiet Lantern', 'eachOpponent', "opponent's"),
  lantern('SYNTHETIC Hollow Lantern', 'eachPlayer', "player's"),
  // A sorcery with the Kindred type (CR 308: a kindred card has another card type, here a sorcery).
  purge(
    'SYNTHETIC Prism Purge',
    ['kindred', 'sorcery'],
    { cmp: 'atLeast', value: 2 },
    'two or more colors',
  ),
  purge('SYNTHETIC Mono Purge', ['sorcery'], { cmp: 'equal', value: 1 }, 'exactly one color'),
  purge('SYNTHETIC Hue Purge', ['sorcery'], { cmp: 'atLeast', value: 1 }, 'one or more colors'),
  COLORLESS_IDOL('SYNTHETIC Grey Idol', []),
  COLORLESS_IDOL('SYNTHETIC Red Idol', ['R']),
  COLORLESS_IDOL('SYNTHETIC Dual Idol', ['R', 'G']),
  cub('SYNTHETIC Colorless Drone', [], 'Construct', ['artifact', 'creature']),
  cub('SYNTHETIC Red Cub', ['R'], 'Goblin'),
  cub('SYNTHETIC Gruul Cub', ['R', 'G'], 'Ogre'),
  singleFace({
    name: 'SYNTHETIC Dull Ward',
    manaCost: ['1', 'W'],
    types: ['enchantment'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: '',
  }),
];
