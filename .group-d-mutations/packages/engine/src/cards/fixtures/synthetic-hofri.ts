/**
 * SYNTHETIC CARDS FOR THE MECHANICS OF THE HOFRI GHOSTFORGE DECK. NOT REAL MAGIC CARDS.
 *
 * Invented for the AI soak of D-229 to D-235 (the 'hofri' deck style): the choices a game asks that the other styles do not reach. The permanents each player keeps
 * and the rest sacrificed (D-231), exile cards from a graveyard as a cost with the opponent choosing which goes where (D-233), a creature that becomes a copy of a card
 * that left a graveyard (D-233), phasing (D-234), the once-a-turn permission to play from the graveyard (D-232), exile until an opponent becomes the monarch (D-231) and
 * each player exiling a card of their graveyard with a reflexive trigger (D-231). Names start with "SYNTHETIC "; oracleId is null; the text describes what the AST does,
 * it is not Oracle text, and none of these is the definition of a real card (the real ones are read from their Oracle text by `packages/cards`).
 */
import type { CardDefinition } from '../definition';
import { kw, singleFace } from './helpers';

const THIS = { kind: 'this' } as const;
const YOU = { kind: 'you' } as const;

export const SYNTHETIC_HOFRI_LIST: readonly CardDefinition[] = [
  // "For each player, you choose from among the permanents that player controls an artifact, a creature, an enchantment, and a planeswalker. Then each player sacrifices
  //  all other nonland permanents they control."
  singleFace({
    name: 'SYNTHETIC Keep Rite',
    manaCost: ['3', 'W', 'W'],
    types: ['sorcery'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText:
      'For each player, you choose from among the permanents that player controls an artifact, a creature, an enchantment, and a planeswalker. Then each player sacrifices all other nonland permanents they control.',
    spell: {
      effect: {
        kind: 'sparePermanents',
        types: ['artifact', 'creature', 'enchantment', 'planeswalker'],
      },
    },
  }),
  // "{2}, {T}, Exile two creature cards from your graveyard, Sacrifice this artifact: An opponent chooses one of the exiled cards. You put that card on the bottom of
  //  your library and return the other to the battlefield tapped. You become the monarch."
  singleFace({
    name: 'SYNTHETIC Split Coin',
    manaCost: ['1', 'W'],
    types: ['artifact'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText:
      '{2}, {T}, Exile two creature cards from your graveyard, Sacrifice this artifact: An opponent chooses one of the exiled cards. You put that card on the bottom of your library and return the other to the battlefield tapped. You become the monarch.',
    abilities: [
      {
        kind: 'activated',
        cost: [
          { kind: 'mana', symbols: ['2'] },
          { kind: 'tap' },
          { kind: 'exileFromGraveyard', filter: { types: ['creature'] }, count: 2 },
          { kind: 'sacrifice', what: THIS },
        ],
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'splitCostExiled',
              chosenTo: 'libraryBottom',
              otherTo: 'battlefieldTapped',
            },
            { kind: 'becomeMonarch', player: YOU },
          ],
        },
      },
    ],
  }),
  // "Whenever one or more cards leave your graveyard, put a +1/+1 counter on this creature, then you may have it become a copy of an artifact or creature card from
  //  among those cards until end of turn."
  singleFace({
    name: 'SYNTHETIC Yard Echo',
    manaCost: ['2', 'R'],
    types: ['creature'],
    subtypes: ['Spirit'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 1,
    toughness: 1,
    oracleText:
      'Whenever one or more cards leave your graveyard, put a +1/+1 counter on this creature, then you may have it become a copy of an artifact or creature card from among those cards until end of turn.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'leftGraveyard', who: 'you' },
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'addCounters', objects: THIS, counter: '+1/+1', count: 1 },
            {
              kind: 'may',
              effect: {
                kind: 'becomeCopyOfCard',
                objects: THIS,
                types: ['artifact', 'creature'],
                duration: 'untilEndOfTurn',
              },
            },
          ],
        },
      },
    ],
  }),
  // "Flash. When this creature enters, any number of other target creatures you control phase out."
  singleFace({
    name: 'SYNTHETIC Phase Guard',
    manaCost: ['1', 'W', 'W'],
    types: ['creature'],
    subtypes: ['Spirit', 'Knight'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 2,
    toughness: 3,
    oracleText:
      'Flash. When this creature enters, any number of other target creatures you control phase out.',
    abilities: [
      kw('flash'),
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: THIS },
        targets: [
          {
            id: 't1',
            anyNumber: true,
            what: {
              kind: 'object',
              filter: { types: ['creature'], controller: 'you', other: true },
            },
          },
        ],
        effect: { kind: 'phaseOut', objects: { kind: 'target', id: 't1' } },
      },
    ],
  }),
  // "Once during each of your turns, you may play a land from your graveyard or cast a permanent spell with mana value 3 or less from your graveyard. If you do, it gains
  //  'When this permanent is put into a graveyard from the battlefield, exile it and you gain 2 life.'"
  singleFace({
    name: 'SYNTHETIC Yard Paragon',
    manaCost: ['2', 'W'],
    types: ['creature'],
    subtypes: ['Angel'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 2,
    toughness: 2,
    oracleText:
      'Once during each of your turns, you may play a land from your graveyard or cast a permanent spell with mana value 3 or less from your graveyard. If you do, it gains "When this permanent is put into a graveyard from the battlefield, exile it and you gain 2 life."',
    abilities: [
      kw('flying'),
      {
        kind: 'static',
        static: {
          kind: 'playFromGraveyardOnceEachTurn',
          land: true,
          cast: {
            anyOf: [
              { types: ['artifact'] },
              { types: ['creature'] },
              { types: ['enchantment'] },
              { types: ['planeswalker'] },
            ],
            manaValue: { cmp: 'atMost', value: 3 },
          },
          gains: {
            kind: 'triggered',
            trigger: { kind: 'dies', what: THIS },
            effect: {
              kind: 'sequence',
              effects: [
                { kind: 'exile', objects: { kind: 'thisCard' } },
                { kind: 'gainLife', player: YOU, amount: 2 },
              ],
            },
          },
        },
      },
    ],
  }),
  // "When this creature enters, you become the monarch. When this creature enters, exile target creature an opponent controls until an opponent becomes the monarch."
  singleFace({
    name: 'SYNTHETIC Crown Jailer',
    manaCost: ['2', 'W', 'W'],
    types: ['creature'],
    subtypes: ['Human', 'Soldier'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 2,
    toughness: 2,
    oracleText:
      'When this creature enters, you become the monarch. When this creature enters, exile target creature an opponent controls until an opponent becomes the monarch.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: THIS },
        effect: { kind: 'becomeMonarch', player: YOU },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: THIS },
        targets: [
          {
            id: 't1',
            what: { kind: 'object', filter: { types: ['creature'], controller: 'opponent' } },
          },
        ],
        effect: {
          kind: 'exile',
          objects: { kind: 'target', id: 't1' },
          until: 'opponentBecomesMonarch',
        },
      },
    ],
  }),
  // "Whenever this creature attacks, each player exiles a card from their graveyard. When one or more nonland cards are exiled this way, put that many +1/+1 counters on
  //  target attacking creature."
  singleFace({
    name: 'SYNTHETIC Grave Herald',
    manaCost: ['2', 'W'],
    types: ['creature'],
    subtypes: ['Spirit', 'Advisor'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 2,
    toughness: 2,
    oracleText:
      'Whenever this creature attacks, each player exiles a card from their graveyard. When one or more nonland cards are exiled this way, put that many +1/+1 counters on target attacking creature.',
    abilities: [
      kw('flying'),
      {
        kind: 'triggered',
        trigger: { kind: 'attacks', what: THIS },
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'exileOwnGraveyardCard', players: { kind: 'eachPlayer' } },
            {
              kind: 'reflexive',
              ifThisWay: 'exiledNonland',
              targets: [
                {
                  id: 't2',
                  what: { kind: 'object', filter: { types: ['creature'], attacking: true } },
                },
              ],
              effect: {
                kind: 'addCounters',
                objects: { kind: 'target', id: 't2' },
                counter: '+1/+1',
                count: { kind: 'thisWay', what: 'exiledNonland' },
              },
            },
          ],
        },
      },
    ],
  }),
];

/** The names of the cards above, for the 'hofri' deck style of the AI soak (`packages/ai/test/helpers.ts`). */
export const SYNTHETIC_HOFRI_NAMES: readonly string[] = SYNTHETIC_HOFRI_LIST.map((c) => c.name);
