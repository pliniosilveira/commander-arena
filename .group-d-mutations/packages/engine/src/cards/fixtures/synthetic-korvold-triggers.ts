/**
 * SYNTHETIC CARDS FOR TRIGGERS AND SMALL STATICS. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-179 (the Korvold slice 4): the mana value of a spell as the amount of the trigger it caused (CR 202.3, 601.2i), a trigger
 * for a card that was cycled (CR 702.29c), the colors among permanents as a static amount (CR 105.2), a player-level restriction on casting spells
 * while a condition holds (CR 101.2, 604.1), a replacement that makes lands enter untapped (CR 614.1c, 614.12), a requirement on a group of creatures
 * that lasts until the controller's next turn (CR 508.1d, 611.2a), the permanents controlled by a chosen player as an `each` selector, and the cards put
 * into a graveyard from the battlefield this turn (CR 700.4). Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does;
 * it is not Oracle text, and none of these is the definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const THIS = { kind: 'this' } as const;
const TRIGGER_SUBJECT = { kind: 'triggerSubject' } as const;

export const SYNTHETIC_KORVOLD_TRIGGERS_LIST: readonly CardDefinition[] = [
  // "Whenever an opponent casts a spell, ~ deals damage equal to that spell's mana value to any target."
  singleFace({
    name: 'SYNTHETIC Spell Echo',
    manaCost: ['2', 'R'],
    types: ['creature'],
    subtypes: ['Shaman'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 2,
    toughness: 2,
    oracleText:
      "Whenever an opponent casts a spell, ~ deals damage equal to that spell's mana value to any target.",
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'castSpell', filter: { stackKind: 'spell' }, by: 'opponent' },
        targets: [{ id: 't1', what: { kind: 'anyTarget' } }],
        effect: {
          kind: 'dealDamage',
          amount: { kind: 'manaValueOf', of: TRIGGER_SUBJECT },
          to: { kind: 'target', id: 't1' },
          from: THIS,
        },
      },
    ],
  }),
  // "Equipped creature gets +1/+1 for each color among permanents you control. Equip {1}"
  singleFace({
    name: 'SYNTHETIC Prism Blade',
    manaCost: ['2'],
    types: ['artifact'],
    subtypes: ['Equipment'],
    colors: [],
    colorIdentity: [],
    oracleText:
      'Equipped creature gets +1/+1 for each color among permanents you control. Equip {1}',
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'modifyPt',
          subject: { kind: 'attached' },
          power: { kind: 'colorsAmong', filter: { controller: 'you' } },
          toughness: { kind: 'colorsAmong', filter: { controller: 'you' } },
        },
      },
      { kind: 'keyword', keyword: { kind: 'equip', cost: [{ kind: 'mana', symbols: ['1'] }] } },
    ],
  }),
  // "As long as this Equipment is attached to a creature, your opponents can't cast spells during your turn. Equip {1}"
  singleFace({
    name: 'SYNTHETIC Tide Seal',
    manaCost: ['2'],
    types: ['artifact'],
    subtypes: ['Equipment'],
    colors: [],
    colorIdentity: [],
    oracleText:
      "As long as this Equipment is attached to a creature, your opponents can't cast spells during your turn. Equip {1}",
    abilities: [
      {
        kind: 'static',
        static: { kind: 'opponentsCantCastOnYourTurn' },
        condition: {
          kind: 'objectMatches',
          of: { kind: 'attached' },
          filter: { types: ['creature'] },
        },
      },
      { kind: 'keyword', keyword: { kind: 'equip', cost: [{ kind: 'mana', symbols: ['1'] }] } },
    ],
  }),
  // "~ deals X damage to target player and each creature that player controls."
  singleFace({
    name: 'SYNTHETIC Rolling Blast',
    manaCost: ['X', 'R', 'G'],
    types: ['sorcery'],
    colors: ['R', 'G'],
    colorIdentity: ['R', 'G'],
    oracleText: '~ deals X damage to target player and each creature that player controls.',
    spell: {
      x: true,
      targets: [{ id: 't1', what: { kind: 'player', filter: 'any' } }],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'dealDamage', amount: { kind: 'x' }, to: { kind: 'target', id: 't1' } },
          {
            kind: 'dealDamage',
            amount: { kind: 'x' },
            to: {
              kind: 'each',
              filter: {
                types: ['creature'],
                controlledBy: { kind: 'target', id: 't1' },
              },
            },
          },
        ],
      },
    },
  }),
  // "When this creature enters, exile target creature card from an opponent's graveyard that was put there from the battlefield this turn, then
  // create X Treasure tokens, where X is the exiled card's power."
  singleFace({
    name: 'SYNTHETIC Grave Skimmer',
    manaCost: ['2', 'B'],
    types: ['creature'],
    subtypes: ['Halfling'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 2,
    toughness: 2,
    oracleText:
      "When this creature enters, exile target creature card from an opponent's graveyard that was put there from the battlefield this turn, then create X Treasure tokens, where X is the exiled card's power.",
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: THIS },
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: {
                zone: 'graveyard',
                types: ['creature'],
                controller: 'opponent',
                putFromBattlefieldThisTurn: true,
              },
            },
          },
        ],
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'exile', objects: { kind: 'target', id: 't1' } },
            {
              kind: 'createToken',
              token: { kind: 'preset', preset: 'Treasure' },
              count: { kind: 'powerOf', of: { kind: 'moved' } },
            },
          ],
        },
      },
    ],
  }),
  // "Lands you control enter untapped."
  singleFace({
    name: 'SYNTHETIC Daylight Hall',
    manaCost: ['2', 'G'],
    types: ['enchantment'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'Lands you control enter untapped.',
    abilities: [
      {
        kind: 'replacement',
        replacement: { kind: 'groupEntersUntapped', what: { types: ['land'], controller: 'you' } },
      },
    ],
  }),
  // "This land enters tapped. {T}: Add {G}."
  singleFace({
    name: 'SYNTHETIC Slow Land',
    manaCost: null,
    types: ['land'],
    colors: [],
    colorIdentity: ['G'],
    oracleText: 'This land enters tapped. {T}: Add {G}.',
    abilities: [
      { kind: 'replacement', replacement: { kind: 'entersTapped' } },
      { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['G'] } },
    ],
  }),
  // "When this creature enters, until your next turn, creatures your opponents control attack each combat if able and attack a player other than
  // you if able."
  singleFace({
    name: 'SYNTHETIC Herding Horror',
    manaCost: ['2', 'B', 'R'],
    types: ['creature'],
    subtypes: ['Demon'],
    colors: ['B', 'R'],
    colorIdentity: ['B', 'R'],
    power: 3,
    toughness: 3,
    oracleText:
      'When this creature enters, until your next turn, creatures your opponents control attack each combat if able and attack a player other than you if able.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: THIS },
        effect: {
          kind: 'requireAttack',
          creatures: { types: ['creature'], controller: 'opponent' },
          duration: 'untilYourNextTurn',
          awayFromYou: true,
        },
      },
    ],
  }),
  // "Creatures your opponents control attack this turn if able."
  singleFace({
    name: 'SYNTHETIC Forced March',
    manaCost: ['1', 'R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Creatures your opponents control attack this turn if able.',
    spell: {
      effect: {
        kind: 'requireAttack',
        creatures: { types: ['creature'], controller: 'opponent' },
        duration: 'untilEndOfTurn',
      },
    },
  }),
  // "Cycling {1}. When you cycle this card, create two Treasure tokens."
  singleFace({
    name: 'SYNTHETIC Treasure Cycler',
    manaCost: ['4', 'B'],
    types: ['creature'],
    subtypes: ['Demon'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 5,
    toughness: 5,
    oracleText: 'Cycling {1}. When you cycle this card, create two Treasure tokens.',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'cycling', cost: [{ kind: 'mana', symbols: ['1'] }] } },
      {
        kind: 'triggered',
        trigger: { kind: 'cycled' },
        effect: { kind: 'createToken', token: { kind: 'preset', preset: 'Treasure' }, count: 2 },
      },
    ],
  }),
  // "Basic landcycling {1}. When you cycle this card, you gain 2 life."
  singleFace({
    name: 'SYNTHETIC Landcycler Seer',
    manaCost: ['4', 'G'],
    types: ['creature'],
    subtypes: ['Elf'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 3,
    toughness: 3,
    oracleText: 'Basic landcycling {1}. When you cycle this card, you gain 2 life.',
    abilities: [
      {
        kind: 'keyword',
        keyword: {
          kind: 'typecycling',
          filter: { types: ['land'], supertypes: ['basic'] },
          cost: [{ kind: 'mana', symbols: ['1'] }],
        },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'cycled' },
        effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 2 },
      },
    ],
  }),
  // "Whenever an attacking creature dies, each opponent loses 1 life and you gain 1 life."
  singleFace({
    name: 'SYNTHETIC Attack Bane',
    manaCost: ['1', 'B'],
    types: ['enchantment'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText:
      'Whenever an attacking creature dies, each opponent loses 1 life and you gain 1 life.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'dies', what: { types: ['creature'], attacking: true } },
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'loseLife', player: { kind: 'eachOpponent' }, amount: 1 },
            { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
          ],
        },
      },
    ],
  }),
];
