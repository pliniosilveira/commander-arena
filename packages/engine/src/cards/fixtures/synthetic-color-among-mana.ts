/**
 * SYNTHETIC CARDS FOR MANA OF A COLOR AMONG CARDS. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of "{T}: Add one mana of any color among legendary creature cards in your graveyard." (the mana production `anyColorAmong`, CR 106.1b, 105.2,
 * 605.3b). Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const creature = (
  name: string,
  colors: readonly ('W' | 'U' | 'B' | 'R' | 'G')[],
  legendary: boolean,
): CardDefinition =>
  singleFace({
    name,
    manaCost: ['1', ...colors],
    types: ['creature'],
    ...(legendary ? { supertypes: ['legendary' as const] } : {}),
    colors: [...colors],
    colorIdentity: [...colors],
    power: 1,
    toughness: 1,
    oracleText: '',
  });

export const SYNTHETIC_COLOR_AMONG_MANA_LIST: readonly CardDefinition[] = [
  // "{T}: Add one mana of any color among legendary creature cards in your graveyard."
  singleFace({
    name: 'SYNTHETIC Graveyard Haven',
    manaCost: null,
    types: ['land'],
    colors: [],
    colorIdentity: [],
    oracleText: '{T}: Add one mana of any color among legendary creature cards in your graveyard.',
    abilities: [
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production: {
          kind: 'anyColorAmong',
          filter: {
            zone: 'graveyard',
            controller: 'you',
            types: ['creature'],
            supertypes: ['legendary'],
          },
        },
      },
    ],
  }),
  creature('SYNTHETIC Legend White', ['W'], true),
  creature('SYNTHETIC Legend Blue Black', ['U', 'B'], true),
  creature('SYNTHETIC Legend Red', ['R'], true),
  creature('SYNTHETIC Plain Green', ['G'], false),
  singleFace({
    name: 'SYNTHETIC Legend Colorless',
    manaCost: ['3'],
    types: ['artifact', 'creature'],
    supertypes: ['legendary'],
    colors: [],
    colorIdentity: [],
    power: 1,
    toughness: 1,
    oracleText: '',
  }),
];
