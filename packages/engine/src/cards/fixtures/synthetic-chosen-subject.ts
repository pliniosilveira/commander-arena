/**
 * SYNTHETIC CARDS FOR "CHOOSE A PLAYER" AND "CHOOSE A NONLAND CARD NAME". NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of the questions a permanent asks as it enters (`asEntersChoose` of `player` and `cardName`, CR 614.12a, 607.2d) that need no card of the corpus: the
 * answers of the AI agents and the engine's own checks. Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text.
 */
import type { Ability } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const CHOOSE_PLAYER: Ability = {
  kind: 'replacement',
  replacement: { kind: 'asEntersChoose', what: 'player' },
};

const CHOOSE_NAME: Ability = {
  kind: 'replacement',
  replacement: { kind: 'asEntersChoose', what: 'cardName' },
};

export const SYNTHETIC_CHOSEN_SUBJECT_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Player Chooser',
    manaCost: ['1', 'B'],
    types: ['enchantment'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'As this enchantment enters, choose a player.',
    abilities: [CHOOSE_PLAYER],
  }),
  singleFace({
    name: 'SYNTHETIC Name Chooser',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      'As this artifact enters, choose a nonland card name. Activated abilities of sources with the chosen name cannot be activated.',
    abilities: [CHOOSE_NAME, { kind: 'static', static: { kind: 'cantActivateChosenName' } }],
  }),
];
