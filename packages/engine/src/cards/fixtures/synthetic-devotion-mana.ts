/**
 * SYNTHETIC CARDS FOR MANA THAT SCALES WITH DEVOTION. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of "{2}, {T}: Choose a color. Add an amount of mana of that color equal to your devotion to that color." (the mana production
 * `anyColorDevotion`, CR 605.3b, 700.5), with permanents whose mana costs carry colored, hybrid, Phyrexian and generic symbols. Names start with "SYNTHETIC ";
 * oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const vanilla = (
  name: string,
  manaCost: readonly string[],
  colors: readonly ('W' | 'U' | 'B' | 'R' | 'G')[],
): CardDefinition =>
  singleFace({
    name,
    manaCost: [...manaCost],
    types: ['creature'],
    colors: [...colors],
    colorIdentity: [...colors],
    power: 1,
    toughness: 1,
    oracleText: '',
  });

export const SYNTHETIC_DEVOTION_MANA_LIST: readonly CardDefinition[] = [
  // "{T}: Add {C}. {2}, {T}: Choose a color. Add an amount of mana of that color equal to your devotion to that color."
  singleFace({
    name: 'SYNTHETIC Devotion Shrine',
    manaCost: null,
    types: ['land'],
    colors: [],
    colorIdentity: [],
    oracleText:
      '{T}: Add {C}. {2}, {T}: Choose a color. Add an amount of mana of that color equal to your devotion to that color.',
    abilities: [
      { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['C'] } },
      {
        kind: 'mana',
        cost: [{ kind: 'mana', symbols: ['2'] }, { kind: 'tap' }],
        production: { kind: 'anyColorDevotion' },
      },
    ],
  }),
  // The same with no mana cost, to see the production alone.
  singleFace({
    name: 'SYNTHETIC Free Devotion Shrine',
    manaCost: null,
    types: ['land'],
    colors: [],
    colorIdentity: [],
    oracleText:
      '{T}: Choose a color. Add an amount of mana of that color equal to your devotion to that color.',
    abilities: [
      { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'anyColorDevotion' } },
    ],
  }),
  // Permanents with symbols in their mana costs (a 1/1 creature each).
  vanilla('SYNTHETIC Green Triple', ['G', 'G', 'G'], ['G']),
  vanilla('SYNTHETIC Green Single', ['2', 'G'], ['G']),
  vanilla('SYNTHETIC White Single', ['1', 'W'], ['W']),
  // A hybrid symbol counts for each of its colors that is asked about (CR 700.5: "mana symbols of that color").
  vanilla('SYNTHETIC Hybrid Pair', ['G/W', 'G/W'], ['W', 'G']),
  // A Phyrexian symbol counts for its color; a generic one for none.
  vanilla('SYNTHETIC Phyrexian Dabbler', ['1', 'B/P'], ['B']),
];
