/**
 * SYNTHETIC CARDS FOR THE TRIGGER "WHENEVER A PLAYER ACTIVATES AN ABILITY OF A PERMANENT THAT ISN'T A MANA ABILITY" (issue 104, CR 602.2, 605.1a). NOT REAL MAGIC CARDS.
 *
 * Written out by hand for the engine tests (the cards package checks that the grammar lowers the real Oracle text of Wizened Mentor to these same nodes). Names start with
 * "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text.
 */
import type { TokenDefinition } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

/** "A 1/1 white Zombie creature token". */
const ZOMBIE: TokenDefinition = {
  name: 'Zombie',
  manaCost: null,
  supertypes: [],
  types: ['creature'],
  subtypes: ['Zombie'],
  colors: ['W'],
  power: 1,
  toughness: 1,
  loyalty: null,
  defense: null,
  oracleText: '',
  abilities: [],
};

export const SYNTHETIC_ACTIVATES_ABILITY_LIST: readonly CardDefinition[] = [
  // "Whenever an opponent activates an ability of a permanent that isn't a mana ability, you create a 1/1 white Zombie creature token. This ability triggers only once each turn."
  singleFace({
    name: 'SYNTHETIC Ability Watcher',
    manaCost: ['1', 'W'],
    types: ['creature'],
    subtypes: ['Zombie', 'Cleric'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 2,
    toughness: 2,
    oracleText:
      "Whenever an opponent activates an ability of a permanent that isn't a mana ability, you create a 1/1 white Zombie creature token. This ability triggers only once each turn.",
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'activatesAbility', who: 'opponent' },
        effect: {
          kind: 'createToken',
          token: { kind: 'custom', definition: ZOMBIE },
          count: 1,
        },
        oncePerTurn: true,
      },
    ],
  }),
  // "Whenever you activate an ability of a permanent that isn't a mana ability, you gain 1 life." (the player is relative to the controller)
  singleFace({
    name: 'SYNTHETIC Own Ability Watcher',
    manaCost: ['1', 'W'],
    types: ['creature'],
    subtypes: ['Cleric'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 1,
    toughness: 1,
    oracleText:
      "Whenever you activate an ability of a permanent that isn't a mana ability, you gain 1 life.",
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'activatesAbility', who: 'you' },
        effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
      },
    ],
  }),
];
