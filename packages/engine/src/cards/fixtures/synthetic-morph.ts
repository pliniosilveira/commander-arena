/**
 * SYNTHETIC MORPH CARDS. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of Morph (CR 702.37, 708): casting a card face down for {3}, and turning it face up for its morph cost. Names start with "SYNTHETIC ", oracleId is null,
 * and the text describes what the AST does; none of this is Oracle text. The morph cost is the `morph` alternative cost of the face (`AlternativeCost`): the {3} and the special
 * action are the engine's.
 */
import type { Ability, Cost, StaticSubject } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const mana = (...symbols: string[]): Cost => ({ kind: 'mana', symbols });
const THIS: StaticSubject = { kind: 'this' };

export const SYNTHETIC_MORPH_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Morph Bear',
    manaCost: ['2', 'G', 'G'],
    types: ['creature'],
    subtypes: ['Bear'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 4,
    toughness: 4,
    oracleText: 'Morph {1}{G}',
    alternativeCosts: [{ kind: 'morph', cost: [mana('1', 'G')] }],
  }),
  singleFace({
    name: 'SYNTHETIC Morph Flier',
    manaCost: ['3', 'U'],
    types: ['creature'],
    subtypes: ['Bird'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 1,
    toughness: 3,
    oracleText: 'Flying\nMorph {U}',
    abilities: [{ kind: 'keyword', keyword: { kind: 'flying' } }],
    alternativeCosts: [{ kind: 'morph', cost: [mana('U')] }],
  }),
  // "When this creature enters, you gain 3 life." A face-down entry and a turn face up do not trigger it (CR 708.3, 702.37e); a face-up cast does.
  singleFace({
    name: 'SYNTHETIC Morph Giver',
    manaCost: ['2', 'W'],
    types: ['creature'],
    subtypes: ['Cleric'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 1,
    toughness: 1,
    oracleText: 'When this creature enters, you gain 3 life.\nMorph {W}',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 3 },
      },
    ],
    alternativeCosts: [{ kind: 'morph', cost: [mana('W')] }],
  }),
  // "This spell can't be countered." A face-down spell has no text, so it can be countered (CR 708.4).
  singleFace({
    name: 'SYNTHETIC Morph Stubborn',
    manaCost: ['4', 'R'],
    types: ['creature'],
    subtypes: ['Dragon'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 5,
    toughness: 5,
    oracleText: "This spell can't be countered.\nMorph {R}",
    abilities: [
      {
        kind: 'static',
        static: { kind: 'restriction', subject: THIS, restriction: 'cantBeCountered' },
      } satisfies Ability,
    ],
    alternativeCosts: [{ kind: 'morph', cost: [mana('R')] }],
  }),
];
