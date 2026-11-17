/**
 * SYNTHETIC CARDS FOR GROUP 1 OF THE LOREHOLD SPIRIT DECK (issue 86, D-583 and later). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of what the real cards of the group need from the engine, written out by hand (the cards package checks that the grammar lowers the real Oracle text to these
 * same nodes): a creature with vigilance whose enters ability, when an opponent controls more lands, searches for a Plains onto the battlefield tapped, twice at most, and shuffles
 * if it searched; an artifact creature that may exile a card its controller discards and then play it this turn; a creature that may pay {1} and discard a card to draw a card when it
 * attacks and, when its controller discards one or more nonland cards, may exile one of them and cast it this turn; an artifact that mills two cards and, exiled, shuffles any number
 * of target cards of the graveyard into the library; a sorcery in which each creature deals damage to itself equal to its power. Three more cover what the real cards do not show
 * on their own: a creature that draws a card when its controller discards one or more cards (a batch of any cards), a creature that may cast what it exiled from a discard even if it
 * is a land (the permission is to cast, never to play a land) and a sorcery that discards two cards. Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST
 * does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability, Effect } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const YOU = { kind: 'you' } as const;
const T1 = { kind: 'target', id: 't1' } as const;

/** "If an opponent controls more lands than you" (the condition of an intervening "if" and of a "Then if ..."). */
const OPPONENT_HAS_MORE_LANDS = {
  kind: 'amountIs',
  amount: { kind: 'opponentsWithMore', stat: 'lands' },
  compare: { cmp: 'atLeast', value: 1 },
} as const;

/** "You may search your library for a Plains card and put it onto the battlefield tapped." (no shuffle of its own: the sentence "If you search your library this way, shuffle." is one) */
const SEARCH_PLAINS: Effect = {
  kind: 'search',
  player: YOU,
  optional: true,
  filter: { subtypes: ['Plains'] },
  max: 1,
  destinations: [{ zone: 'battlefield', tapped: true, count: 1 }],
  reveal: false,
  shuffle: false,
};

const PLAY_THIS_TURN: Effect = {
  kind: 'conditional',
  condition: { kind: 'didPrevious' },
  effect: { kind: 'mayPlay', objects: { kind: 'moved' }, lasts: 'endOfTurn' },
};

const CAST_THIS_TURN: Effect = {
  kind: 'conditional',
  condition: { kind: 'didPrevious' },
  effect: { kind: 'mayPlay', objects: { kind: 'moved' }, lasts: 'endOfTurn', castOnly: true },
};

const MILL_TWO: Ability = {
  kind: 'activated',
  cost: [{ kind: 'tap' }],
  effect: { kind: 'mill', player: YOU, count: 2 },
};

export const SYNTHETIC_LOREHOLD_G1_LIST: readonly CardDefinition[] = [
  // A 3/5 with deathtouch and lifelink: the damage it deals to itself is damage from a source that has them (CR 120.3).
  singleFace({
    name: 'SYNTHETIC Venom Titan',
    manaCost: ['3', 'B', 'B'],
    types: ['creature'],
    subtypes: ['Giant'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 3,
    toughness: 5,
    oracleText: 'Deathtouch, lifelink',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'deathtouch' } },
      { kind: 'keyword', keyword: { kind: 'lifelink' } },
    ],
  }),
  // "Vigilance
  //  When this creature enters, if an opponent controls more lands than you, you may search your library for a Plains card and put it onto the battlefield tapped. Then if an opponent
  //  controls more lands than you, repeat this process once. If you search your library this way, shuffle."
  singleFace({
    name: 'SYNTHETIC Land Claimer',
    manaCost: ['2', 'W'],
    types: ['creature'],
    subtypes: ['Rabbit', 'Mercenary'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 3,
    toughness: 3,
    oracleText:
      'Vigilance\nWhen this creature enters, if an opponent controls more lands than you, you may search your library for a Plains card and put it onto the battlefield tapped. Then if an opponent controls more lands than you, repeat this process once. If you search your library this way, shuffle.',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'vigilance' } },
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        interveningIf: OPPONENT_HAS_MORE_LANDS,
        effect: {
          kind: 'sequence',
          effects: [
            SEARCH_PLAINS,
            { kind: 'conditional', condition: OPPONENT_HAS_MORE_LANDS, effect: SEARCH_PLAINS },
            {
              kind: 'conditional',
              condition: { kind: 'thisWayAtLeast', what: 'searched', count: 1 },
              effect: { kind: 'shuffle', player: YOU },
            },
          ],
        },
      },
    ],
  }),
  // "Whenever you discard a card, you may exile that card from your graveyard. If you do, you may play that card this turn."
  singleFace({
    name: 'SYNTHETIC Quarantine Golem',
    manaCost: ['2'],
    types: ['artifact', 'creature'],
    subtypes: ['Construct'],
    colors: [],
    colorIdentity: [],
    power: 2,
    toughness: 1,
    oracleText:
      'Whenever you discard a card, you may exile that card from your graveyard. If you do, you may play that card this turn.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'discarded', who: 'you' },
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'may', effect: { kind: 'exile', objects: { kind: 'triggerSubject' } } },
            PLAY_THIS_TURN,
          ],
        },
      },
    ],
  }),
  // "Whenever this creature attacks, you may pay {1} and discard a card. If you do, draw a card.
  //  Whenever you discard one or more nonland cards, you may exile one of them from your graveyard. If you do, you may cast it this turn."
  singleFace({
    name: 'SYNTHETIC Doubting Seer',
    manaCost: ['1', 'R'],
    types: ['creature'],
    subtypes: ['Human', 'Shaman'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 2,
    toughness: 2,
    oracleText:
      'Whenever this creature attacks, you may pay {1} and discard a card. If you do, draw a card.\nWhenever you discard one or more nonland cards, you may exile one of them from your graveyard. If you do, you may cast it this turn.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'attacks', what: { kind: 'this' } },
        effect: {
          kind: 'mayPay',
          cost: [
            { kind: 'mana', symbols: ['1'] },
            { kind: 'discard', count: 1 },
          ],
          effect: { kind: 'draw', player: YOU, count: 1 },
        },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'discarded', who: 'you', filter: { notTypes: ['land'] }, batch: true },
        effect: {
          kind: 'sequence',
          effects: [{ kind: 'exileFromTriggerCards' }, CAST_THIS_TURN],
        },
      },
    ],
  }),
  // "Whenever you discard one or more cards, draw a card." (a batch of any cards)
  singleFace({
    name: 'SYNTHETIC Discard Watcher',
    manaCost: ['1', 'R'],
    types: ['creature'],
    subtypes: ['Human', 'Shaman'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 1,
    toughness: 1,
    oracleText: 'Whenever you discard one or more cards, draw a card.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'discarded', who: 'you', batch: true },
        effect: { kind: 'draw', player: YOU, count: 1 },
      },
    ],
  }),
  // "Whenever you discard a card, you may exile that card from your graveyard. If you do, you may cast it this turn." (cast, not play: a land cannot be played)
  singleFace({
    name: 'SYNTHETIC Cast Golem',
    manaCost: ['2'],
    types: ['artifact', 'creature'],
    subtypes: ['Construct'],
    colors: [],
    colorIdentity: [],
    power: 2,
    toughness: 1,
    oracleText:
      'Whenever you discard a card, you may exile that card from your graveyard. If you do, you may cast it this turn.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'discarded', who: 'you' },
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'may', effect: { kind: 'exile', objects: { kind: 'triggerSubject' } } },
            CAST_THIS_TURN,
          ],
        },
      },
    ],
  }),
  // "Discard two cards."
  singleFace({
    name: 'SYNTHETIC Twin Discard',
    manaCost: ['R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Discard two cards.',
    spell: { effect: { kind: 'discard', player: YOU, count: 2 } },
  }),
  // "{T}: Mill two cards.
  //  {2}, Exile this artifact: Shuffle any number of target cards from your graveyard into your library."
  singleFace({
    name: 'SYNTHETIC Memory Clock',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      '{T}: Mill two cards.\n{2}, Exile this artifact: Shuffle any number of target cards from your graveyard into your library.',
    abilities: [
      MILL_TWO,
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['2'] }, { kind: 'exileThis' }],
        targets: [
          {
            id: 't1',
            what: { kind: 'object', filter: { zone: 'graveyard', controller: 'you' } },
            anyNumber: true,
          },
        ],
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'moveToZone', objects: T1, to: 'library' },
            { kind: 'shuffle', player: YOU },
          ],
        },
      },
    ],
  }),
  // "Each creature deals damage to itself equal to its power."
  singleFace({
    name: 'SYNTHETIC Reckoning Tide',
    manaCost: ['4', 'W'],
    types: ['sorcery'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'Each creature deals damage to itself equal to its power.',
    spell: {
      effect: {
        kind: 'dealDamageToSelf',
        objects: { kind: 'each', filter: { zone: 'battlefield', types: ['creature'] } },
      },
    },
  }),
];
