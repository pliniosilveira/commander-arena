/**
 * SYNTHETIC CARDS FOR "CHOOSE A CREATURE CARD IN AN OPPONENT'S GRAVEYARD, THEN THAT PLAYER CHOOSES ... YOU MAY RETURN THOSE CARDS". NOT REAL MAGIC CARDS.
 *
 * Invented for the scenario tests of D-951 (`returnGraveyardPair`, the Bruna deck program): the choice of a card in another player's graveyard, the choice of the player who
 * owns it, and the one "you may" for both cards. Names start with "SYNTHETIC "; oracleId is null; the text describes what the AST does, it is not Oracle text, and none of these
 * is the definition of a real card (the real one is read from its Oracle text by `packages/cards`).
 */
import type { CardDefinition } from '../definition';
import { kw, singleFace } from './helpers';

export const SYNTHETIC_DAWNBREAK_LIST: readonly CardDefinition[] = [
  // "Flying. At the beginning of your end step, choose a creature card in an opponent's graveyard, then that player chooses a creature card in your graveyard. You may
  //  return those cards to the battlefield under their owners' control."
  singleFace({
    name: 'SYNTHETIC Reclaimer Angel',
    manaCost: ['4', 'W', 'W'],
    types: ['creature'],
    subtypes: ['Angel'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 5,
    toughness: 5,
    oracleText:
      "Flying\nAt the beginning of your end step, choose a creature card in an opponent's graveyard, then that player chooses a creature card in your graveyard. You may return those cards to the battlefield under their owners' control.",
    abilities: [
      kw('flying'),
      {
        kind: 'triggered',
        trigger: { kind: 'endStep', whose: 'you' },
        effect: { kind: 'returnGraveyardPair', cardType: 'creature' },
      },
    ],
  }),
  // The same effect as a spell, to show it does not depend on a trigger: "Choose an artifact card in an opponent's graveyard, then that player chooses an artifact card in
  // your graveyard. You may return those cards to the battlefield under their owners' control."
  singleFace({
    name: 'SYNTHETIC Reclaimer Rite',
    manaCost: ['2', 'W'],
    types: ['sorcery'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText:
      "Choose an artifact card in an opponent's graveyard, then that player chooses an artifact card in your graveyard. You may return those cards to the battlefield under their owners' control.",
    spell: { effect: { kind: 'returnGraveyardPair', cardType: 'artifact' } },
  }),
  // "When this creature enters, you gain 1 life." (who controls the trigger of a card that returned: the player it came back under)
  singleFace({
    name: 'SYNTHETIC Reclaimed Cleric',
    manaCost: ['1', 'W'],
    types: ['creature'],
    subtypes: ['Cleric'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 1,
    toughness: 2,
    oracleText: 'When this creature enters, you gain 1 life.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
      },
    ],
  }),
];
