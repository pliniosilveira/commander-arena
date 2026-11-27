/**
 * SYNTHETIC CARDS for "Once during each of your turns, you may cast a spell ... for an alternative cost" (`castOnceEachTurn`, CR 118.9, 601.2b). NOT REAL MAGIC CARDS: the names start
 * with "SYNTHETIC ", oracleId is null, and the text describes what the AST does; it is not Oracle text.
 *
 * - SYNTHETIC Fate Demon: "Once during each of your turns, you may cast an enchantment spell by paying life equal to its mana value rather than paying its mana cost."
 * - SYNTHETIC Vent Room // Maze Room: Vent ({3}{B}) "When you unlock this door, this Room deals 6 damage to target creature an opponent controls. You gain life equal to the excess
 *   damage dealt this way."; Maze ({5}{B}{B}) "Once during each of your turns, you may cast a spell from your hand by paying life equal to its mana value rather than paying its mana
 *   cost."
 * - SYNTHETIC Multiverse Pact: "You may look at the top card of your library any time. You may play lands and cast spells from the top of your library. Once during each of your turns,
 *   you may cast a spell from your hand or the top of your library without paying its mana cost."
 * - SYNTHETIC Plain Shrine ({2}{W}), SYNTHETIC X Shrine ({X}{B}), SYNTHETIC Toll Shrine ({1}{W}, "As an additional cost to cast this spell, discard a card."): enchantments to cast.
 * - SYNTHETIC Deathtouch Lender: "Enchantments you control have deathtouch."
 */
import type { Ability } from '../../ast/types';
import type { CardDefinition, CardFace } from '../definition';
import { singleFace } from './helpers';

const room = (
  name: string,
  manaCost: readonly string[],
  oracleText: string,
  abilities: readonly Ability[],
): CardFace => ({
  name,
  manaCost,
  supertypes: [],
  types: ['enchantment'],
  subtypes: ['Room'],
  colors: ['B'],
  power: null,
  toughness: null,
  loyalty: null,
  defense: null,
  oracleText,
  abilities,
  spell: null,
});

const shrine = (
  name: string,
  manaCost: readonly string[],
  color: 'W' | 'B',
  oracleText: string,
  extra: Partial<Parameters<typeof singleFace>[0]> = {},
): CardDefinition =>
  singleFace({
    name,
    manaCost,
    types: ['enchantment'],
    colors: [color],
    colorIdentity: [color],
    oracleText,
    ...extra,
  });

export const SYNTHETIC_CAST_ONCE_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Fate Demon',
    manaCost: ['4', 'B', 'B'],
    types: ['enchantment', 'creature'],
    subtypes: ['Demon'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 6,
    toughness: 6,
    oracleText:
      'Once during each of your turns, you may cast an enchantment spell by paying life equal to its mana value rather than paying its mana cost.',
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'castOnceEachTurn',
          spells: { types: ['enchantment'] },
          alternative: 'lifeForMana',
        },
      },
    ],
  }),
  {
    oracleId: null,
    name: 'SYNTHETIC Vent Room // Maze Room',
    layout: 'split',
    faces: [
      room(
        'Vent Room',
        ['3', 'B'],
        'When you unlock this door, this Room deals 6 damage to target creature an opponent controls. You gain life equal to the excess damage dealt this way.',
        [
          {
            kind: 'triggered',
            trigger: { kind: 'doorUnlocked', who: 'you', door: 'this' },
            targets: [
              {
                id: 't1',
                what: {
                  kind: 'object',
                  filter: { zone: 'battlefield', types: ['creature'], controller: 'opponent' },
                },
              },
            ],
            effect: {
              kind: 'sequence',
              effects: [
                { kind: 'dealDamage', amount: 6, to: { kind: 'target', id: 't1' } },
                {
                  kind: 'gainLife',
                  player: { kind: 'you' },
                  amount: { kind: 'thisWay', what: 'excessDamageDealt' },
                },
              ],
            },
          },
        ],
      ),
      room(
        'Maze Room',
        ['5', 'B', 'B'],
        'Once during each of your turns, you may cast a spell from your hand by paying life equal to its mana value rather than paying its mana cost.',
        [
          {
            kind: 'static',
            static: {
              kind: 'castOnceEachTurn',
              spells: {},
              from: ['hand'],
              alternative: 'lifeForMana',
            },
          },
        ],
      ),
    ],
    colorIdentity: ['B'],
    support: 'supported',
  },
  singleFace({
    name: 'SYNTHETIC Multiverse Pact',
    manaCost: ['6', 'U', 'U'],
    types: ['enchantment'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText:
      'You may look at the top card of your library any time. You may play lands and cast spells from the top of your library. Once during each of your turns, you may cast a spell from your hand or the top of your library without paying its mana cost.',
    abilities: [
      { kind: 'static', static: { kind: 'lookAtTopOfLibrary' } },
      { kind: 'static', static: { kind: 'playLandsFromTopOfLibrary' } },
      { kind: 'static', static: { kind: 'castFromTopOfLibrary', spells: {} } },
      {
        kind: 'static',
        static: {
          kind: 'castOnceEachTurn',
          spells: {},
          from: ['hand', 'libraryTop'],
          alternative: 'free',
        },
      },
    ],
  }),
  shrine('SYNTHETIC Plain Shrine', ['2', 'W'], 'W', ''),
  shrine('SYNTHETIC X Shrine', ['X', 'B'], 'B', ''),
  shrine(
    'SYNTHETIC Toll Shrine',
    ['1', 'W'],
    'W',
    'As an additional cost to cast this spell, discard a card.',
    { additionalCosts: [{ kind: 'discard', count: 1 }] },
  ),
  shrine('SYNTHETIC Deathtouch Lender', ['B'], 'B', 'Enchantments you control have deathtouch.', {
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: { kind: 'filter', filter: { types: ['enchantment'], controller: 'you' } },
          keyword: { kind: 'deathtouch' },
        },
      },
    ],
  }),
];
