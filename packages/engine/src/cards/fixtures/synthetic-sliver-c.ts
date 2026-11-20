/**
 * SYNTHETIC CARDS OF THE SLIVER SWARM DECK, GROUP C. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of "Choose a creature type. Look at the top four cards of your library. You may reveal any number of cards of the chosen type from among
 * them and put the revealed cards into your hand. Put the rest on the bottom of your library in a random order." (`chooseCreatureType` then `lookAtTop` whose take
 * filter is `chosenType`, so the type chosen as the spell resolves is read) and "You may cast creature spells of the chosen type from the top of your library."
 * (`castFromTopOfLibrary` with `chosenType`). Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none
 * of these is the definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

export const SYNTHETIC_SLIVER_C_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Kin Search',
    manaCost: ['1', 'G'],
    types: ['instant'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText:
      'Choose a creature type. Look at the top four cards of your library. You may reveal any number of cards of the chosen type from among them and put the revealed cards into your hand. Put the rest on the bottom of your library in a random order.',
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'chooseCreatureType' },
          {
            kind: 'lookAtTop',
            count: 4,
            take: { filter: { chosenType: true }, max: 4 },
            rest: 'bottomRandom',
          },
        ],
      },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Kin Walker',
    manaCost: ['2', 'G'],
    types: ['creature'],
    subtypes: ['Shapeshifter'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 2,
    toughness: 3,
    oracleText:
      'As this creature enters, choose a creature type. You may look at the top card of your library any time. You may cast creature spells of the chosen type from the top of your library.',
    abilities: [
      { kind: 'replacement', replacement: { kind: 'asEntersChoose', what: 'creatureType' } },
      { kind: 'static', static: { kind: 'lookAtTopOfLibrary' } },
      {
        kind: 'static',
        static: {
          kind: 'castFromTopOfLibrary',
          spells: { types: ['creature'], chosenType: true },
        },
      },
    ],
  }),
];
