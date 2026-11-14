/**
 * SYNTHETIC CARDS FOR "REVEAL THE TOP N CARDS OF YOUR LIBRARY, A PLAYER SEPARATES THEM INTO TWO PILES, THE OTHER PLAYER CHOOSES A PILE". NOT REAL MAGIC CARDS.
 *
 * Invented for the scenario tests and the AI soak of D-303 (`revealAndSeparate`): who separates, who chooses, how many cards, where the piles go. Names start with
 * "SYNTHETIC "; oracleId is null; the text describes what the AST does, it is not Oracle text, and none of these is the definition of a real card (the real one is read
 * from its Oracle text by `packages/cards`).
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

export const SYNTHETIC_PILES_LIST: readonly CardDefinition[] = [
  // "Reveal the top five cards of your library. An opponent separates those cards into two piles. Put one pile into your hand and the other into your graveyard."
  singleFace({
    name: 'SYNTHETIC Pile Reading',
    manaCost: ['3', 'U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText:
      'Reveal the top five cards of your library. An opponent separates those cards into two piles. Put one pile into your hand and the other into your graveyard.',
    spell: {
      effect: {
        kind: 'revealAndSeparate',
        count: 5,
        separator: 'opponent',
        chosenTo: 'hand',
        otherTo: 'graveyard',
      },
    },
  }),
  // "Reveal the top four cards of your library and separate them into two piles. An opponent chooses one of those piles. Put that pile into your hand and the other into your
  //  graveyard." (the controller separates, the first opponent chooses)
  singleFace({
    name: 'SYNTHETIC Pile Offering',
    manaCost: ['2', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText:
      'Reveal the top four cards of your library and separate them into two piles. An opponent chooses one of those piles. Put that pile into your hand and the other into your graveyard.',
    spell: {
      effect: {
        kind: 'revealAndSeparate',
        count: 4,
        separator: 'you',
        chosenTo: 'hand',
        otherTo: 'graveyard',
      },
    },
  }),
  // The same shape with the chosen pile in the graveyard and the other in the hand, to show the destinations are data: "... Put one pile into your graveyard and the other into
  // your hand."
  singleFace({
    name: 'SYNTHETIC Pile Tithe',
    manaCost: ['1', 'U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText:
      'Reveal the top three cards of your library. An opponent separates those cards into two piles. Put one pile into your graveyard and the other into your hand.',
    spell: {
      effect: {
        kind: 'revealAndSeparate',
        count: 3,
        separator: 'opponent',
        chosenTo: 'graveyard',
        otherTo: 'hand',
      },
    },
  }),
];
