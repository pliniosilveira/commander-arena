/**
 * SYNTHETIC CARDS FOR "CHOOSE A PLANESWALKER TYPE". NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of the choice of a planeswalker type (`asEntersChoose` of `planeswalkerType`, CR 205.3j, 614.12a), "planeswalkers you control of the
 * chosen type" (`ObjectFilter.chosenPlaneswalkerType`, CR 607.2d) and the replacement `keepOneLoyalty` (CR 614.1a, 120.3c). Names start with "SYNTHETIC "; oracleId
 * is null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const CHOSEN_WALKERS = {
  types: ['planeswalker'],
  controller: 'you',
  chosenPlaneswalkerType: true,
} as const;

export const CHOOSE_PLANESWALKER_TYPE: Ability = {
  kind: 'replacement',
  replacement: { kind: 'asEntersChoose', what: 'planeswalkerType' },
};

/** "Planeswalkers you control of the chosen type have hexproof." */
export const CHOSEN_WALKERS_HEXPROOF: Ability = {
  kind: 'static',
  static: {
    kind: 'grantKeyword',
    subject: { kind: 'filter', filter: CHOSEN_WALKERS },
    keyword: { kind: 'hexproof' },
  },
};

/** "As long as you control a creature, if damage dealt to a planeswalker you control of the chosen type would result in all loyalty counters on it being removed, instead all but one ... are removed." */
export const KEEP_ONE_LOYALTY: Ability = {
  kind: 'replacement',
  replacement: {
    kind: 'keepOneLoyalty',
    planeswalkers: CHOSEN_WALKERS,
    while: { kind: 'controlsAtLeast', filter: { types: ['creature'] }, count: 1 },
  },
};

const walker = (name: string, subtype: string): CardDefinition =>
  singleFace({
    name,
    manaCost: ['3', 'W'],
    types: ['planeswalker'],
    subtypes: [subtype],
    colors: ['W'],
    colorIdentity: ['W'],
    loyalty: 3,
    oracleText: '',
    abilities: [],
  });

export const SYNTHETIC_CHOSEN_WALKER_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Walker Ward',
    manaCost: ['2', 'W', 'W'],
    types: ['enchantment'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText:
      'As this enchantment enters, choose a planeswalker type. Planeswalkers you control of the chosen type have hexproof. As long as you control a creature, if damage dealt to a planeswalker you control of the chosen type would result in all loyalty counters on it being removed, instead all but one of those counters are removed.',
    abilities: [CHOOSE_PLANESWALKER_TYPE, CHOSEN_WALKERS_HEXPROOF, KEEP_ONE_LOYALTY],
  }),
  walker('SYNTHETIC Dack Walker', 'Dack'),
  walker('SYNTHETIC Ajani Walker', 'Ajani'),
];
