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
  // "Whenever another creature enters, you gain 1 life." (a card that returned together with another one sees it enter, CR 603.6a)
  singleFace({
    name: 'SYNTHETIC Reclaimed Warden',
    manaCost: ['1', 'W'],
    types: ['creature'],
    subtypes: ['Cleric'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 1,
    toughness: 2,
    oracleText: 'Whenever another creature enters, you gain 1 life.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { types: ['creature'], other: true } },
        effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
      },
    ],
  }),
  // "As this creature enters, choose a creature type. Whenever another creature enters, you gain 1 life." (a question as it enters, and a trigger that must see the card that
  // enters with it, CR 603.6a)
  singleFace({
    name: 'SYNTHETIC Reclaimed Seer',
    manaCost: ['1', 'W'],
    types: ['creature'],
    subtypes: ['Cleric'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 1,
    toughness: 2,
    oracleText:
      'As this creature enters, choose a creature type. Whenever another creature enters, you gain 1 life.',
    abilities: [
      { kind: 'replacement', replacement: { kind: 'asEntersChoose', what: 'creatureType' } },
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { types: ['creature'], other: true } },
        effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
      },
    ],
  }),
  // The cards the pair returns in the tests of the simultaneous entering (CR 614.12, 603.6a): artifact creatures, so the "artifact" version of the pair returns them. What
  // each one says is read from the battlefield as it is before the pair enters.
  // "" (a vanilla artifact creature)
  singleFace({
    name: 'SYNTHETIC Clay Golem',
    manaCost: ['3'],
    types: ['artifact', 'creature'],
    subtypes: ['Golem'],
    colors: [],
    colorIdentity: [],
    power: 2,
    toughness: 2,
    oracleText: '',
    abilities: [],
  }),
  // "Each other creature enters with an additional +1/+1 counter on it."
  singleFace({
    name: 'SYNTHETIC Banner Golem',
    manaCost: ['3'],
    types: ['artifact', 'creature'],
    subtypes: ['Golem'],
    colors: [],
    colorIdentity: [],
    power: 2,
    toughness: 2,
    oracleText: 'Each other creature enters with an additional +1/+1 counter on it.',
    abilities: [
      {
        kind: 'replacement',
        replacement: {
          kind: 'othersEnterWithCounters',
          what: { types: ['creature'], other: true },
          counter: '+1/+1',
          count: 1,
        },
      },
    ],
  }),
  // "This creature enters with a +1/+1 counter on it for each creature on the battlefield."
  singleFace({
    name: 'SYNTHETIC Crowd Golem',
    manaCost: ['3'],
    types: ['artifact', 'creature'],
    subtypes: ['Golem'],
    colors: [],
    colorIdentity: [],
    power: 1,
    toughness: 1,
    oracleText:
      'This creature enters with a +1/+1 counter on it for each creature on the battlefield.',
    abilities: [
      {
        kind: 'replacement',
        replacement: {
          kind: 'entersWithCounters',
          counter: '+1/+1',
          count: { kind: 'countOf', filter: { types: ['creature'] } },
        },
      },
    ],
  }),
  // "Creatures enter untapped."
  singleFace({
    name: 'SYNTHETIC Dawn Golem',
    manaCost: ['3'],
    types: ['artifact', 'creature'],
    subtypes: ['Golem'],
    colors: [],
    colorIdentity: [],
    power: 2,
    toughness: 2,
    oracleText: 'Creatures enter untapped.',
    abilities: [
      {
        kind: 'replacement',
        replacement: { kind: 'groupEntersUntapped', what: { types: ['creature'] } },
      },
    ],
  }),
  // "This creature enters tapped."
  singleFace({
    name: 'SYNTHETIC Weary Golem',
    manaCost: ['3'],
    types: ['artifact', 'creature'],
    subtypes: ['Golem'],
    colors: [],
    colorIdentity: [],
    power: 2,
    toughness: 2,
    oracleText: 'This creature enters tapped.',
    abilities: [{ kind: 'replacement', replacement: { kind: 'entersTapped' } }],
  }),
  // The pair followed by another instruction: declining the "you may" of the pair must not drop the draw.
  singleFace({
    name: 'SYNTHETIC Reclaimer Tide',
    manaCost: ['2', 'W'],
    types: ['sorcery'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText:
      "Choose a creature card in an opponent's graveyard, then that player chooses a creature card in your graveyard. You may return those cards to the battlefield under their owners' control. Draw a card.",
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'returnGraveyardPair', cardType: 'creature' },
          { kind: 'draw', player: { kind: 'you' }, count: 1 },
        ],
      },
    },
  }),
];
