/**
 * SYNTHETIC CARDS FOR THE PLAYERS WHO LOST LIFE OR WERE DEALT COMBAT DAMAGE THIS TURN. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of the Scions & Spellcraft deck, group A: "if a player lost 4 or more life this turn" (`aPlayerLostLifeThisTurn`), "for each player who lost life this turn"
 * (`playerCount` of `lostLifeThisTurn`), "each opponent who lost life this turn sacrifices ..." (`lostLifeThisTurn` as the players of an effect) and "the number of your opponents who were
 * dealt combat damage by this creature or a Dragon this turn" (`combatDamagedThisTurn`). Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is
 * not Oracle text, and none of these is the definition of a real card.
 */
import type { Amount } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { kw, singleFace } from './helpers';

const YOU = { kind: 'you' } as const;
const THIS = { kind: 'this' } as const;
const T1 = { kind: 'target', id: 't1' } as const;
const T1_REF = { kind: 'target', id: 't1' } as const;

/** X of the dragon scholar: the opponents this creature or a Dragon dealt combat damage to this turn. */
const DAMAGED_OPPONENTS: Amount = {
  kind: 'playerCount',
  of: {
    kind: 'combatDamagedThisTurn',
    of: { kind: 'eachOpponent' },
    byThis: true,
    by: { subtypes: ['Dragon'] },
  },
};

export const SYNTHETIC_LIFE_LOST_GROUP_LIST: readonly CardDefinition[] = [
  // "At the beginning of each end step, if a player lost 4 or more life this turn, you draw a card."
  singleFace({
    name: 'SYNTHETIC Night Warden',
    manaCost: ['2', 'U'],
    types: ['enchantment'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText:
      'At the beginning of each end step, if a player lost 4 or more life this turn, you draw a card.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'endStep', whose: 'each' },
        interveningIf: { kind: 'aPlayerLostLifeThisTurn', atLeast: 4 },
        effect: { kind: 'draw', player: YOU, count: 1 },
      },
    ],
  }),
  // "At the beginning of each end step, if an opponent lost 3 or more life this turn, you draw a card."
  singleFace({
    name: 'SYNTHETIC Opposing Watcher',
    manaCost: ['1', 'U'],
    types: ['enchantment'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText:
      'At the beginning of each end step, if an opponent lost 3 or more life this turn, you draw a card.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'endStep', whose: 'each' },
        interveningIf: { kind: 'aPlayerLostLifeThisTurn', atLeast: 3, opponent: true },
        effect: { kind: 'draw', player: YOU, count: 1 },
      },
    ],
  }),
  // "At the beginning of your end step, put a soul counter on this artifact for each player who lost life this turn."
  singleFace({
    name: 'SYNTHETIC Soul Reaper',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      'At the beginning of your end step, put a soul counter on this artifact for each player who lost life this turn.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'endStep', whose: 'you' },
        effect: {
          kind: 'addCounters',
          objects: THIS,
          counter: 'soul',
          count: {
            kind: 'playerCount',
            of: { kind: 'lostLifeThisTurn', of: { kind: 'eachPlayer' } },
          },
        },
      },
    ],
  }),
  // "{1}, {T}: Each opponent who lost life this turn sacrifices a creature with the greatest power among creatures they control."
  singleFace({
    name: 'SYNTHETIC Culling Idol',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      '{1}, {T}: Each opponent who lost life this turn sacrifices a creature with the greatest power among creatures they control.',
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['1'] }, { kind: 'tap' }],
        effect: {
          kind: 'sacrifice',
          objects: {
            kind: 'choose',
            filter: { types: ['creature'], controller: 'you' },
            greatest: 'power',
          },
          player: { kind: 'lostLifeThisTurn', of: { kind: 'eachOpponent' } },
        },
      },
    ],
  }),
  // "At the beginning of your second main phase, you draw X cards and lose X life, where X is the number of your opponents who were dealt combat damage by this creature or a Dragon this turn."
  singleFace({
    name: 'SYNTHETIC Dragon Scholar',
    manaCost: ['2', 'R'],
    types: ['creature'],
    subtypes: ['Elf'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 2,
    toughness: 2,
    oracleText:
      'At the beginning of your second main phase, you draw X cards and lose X life, where X is the number of your opponents who were dealt combat damage by this creature or a Dragon this turn.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'step', step: 'main2', whose: 'you' },
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'draw', player: YOU, count: DAMAGED_OPPONENTS },
            { kind: 'loseLife', player: YOU, amount: DAMAGED_OPPONENTS },
          ],
        },
      },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Ember Drake',
    manaCost: ['3', 'R'],
    types: ['creature'],
    subtypes: ['Dragon'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 3,
    toughness: 3,
    oracleText: 'A Dragon with no abilities.',
    abilities: [],
  }),
  // "Target player loses 4 life."
  singleFace({
    name: 'SYNTHETIC Drain Four',
    manaCost: ['B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Target player loses 4 life.',
    spell: {
      targets: [{ id: 't1', what: { kind: 'player', filter: 'any' } }],
      effect: { kind: 'loseLife', player: T1, amount: 4 },
    },
  }),
  // "Target player loses 1 life."
  singleFace({
    name: 'SYNTHETIC Drain One',
    manaCost: ['B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Target player loses 1 life.',
    spell: {
      targets: [{ id: 't1', what: { kind: 'player', filter: 'any' } }],
      effect: { kind: 'loseLife', player: T1, amount: 1 },
    },
  }),
  // "Whenever an opponent loses life for the first time during each of their turns, you draw a card."
  singleFace({
    name: 'SYNTHETIC Patient Tormentor',
    manaCost: ['1', 'B'],
    types: ['enchantment'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText:
      'Whenever an opponent loses life for the first time during each of their turns, you draw a card.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'lifeLost', who: 'opponent', firstEachTurn: true, duringTheirTurn: true },
        effect: { kind: 'draw', player: YOU, count: 1 },
      },
    ],
  }),
  // "You can't cast this creature unless an opponent lost life this turn."
  singleFace({
    name: 'SYNTHETIC Grudging Rioter',
    manaCost: ['B'],
    types: ['creature'],
    subtypes: ['Demon'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 2,
    toughness: 2,
    oracleText: "You can't cast this creature unless an opponent lost life this turn.",
    abilities: [
      {
        kind: 'static',
        static: { kind: 'cantCastThis' },
        condition: {
          kind: 'not',
          term: { kind: 'aPlayerLostLifeThisTurn', atLeast: 1, opponent: true },
        },
      },
    ],
  }),
  // "At the beginning of your upkeep, exile the top card of your library. During your turn, if an opponent lost life this turn, you may play lands and cast spells from among cards exiled
  //  with this enchantment."
  singleFace({
    name: 'SYNTHETIC Grim Playhouse',
    manaCost: ['1', 'B', 'R'],
    types: ['enchantment'],
    colors: ['B', 'R'],
    colorIdentity: ['B', 'R'],
    oracleText:
      'At the beginning of your upkeep, exile the top card of your library. During your turn, if an opponent lost life this turn, you may play lands and cast spells from among cards exiled with this enchantment.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'upkeep', whose: 'you' },
        effect: { kind: 'exileTop', count: 1, linked: true },
      },
      {
        kind: 'static',
        static: { kind: 'playFromLinkedExile' },
        condition: {
          kind: 'and',
          terms: [
            { kind: 'yourTurn' },
            { kind: 'aPlayerLostLifeThisTurn', atLeast: 1, opponent: true },
          ],
        },
      },
    ],
  }),
  // "Whenever a source you control deals noncombat damage to an opponent, if there are four or more card types among cards in your graveyard, this enchantment deals that amount of damage
  //  to target creature that player controls."
  singleFace({
    name: 'SYNTHETIC Burning Reprisal',
    manaCost: ['2', 'R'],
    types: ['enchantment'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'Whenever a source you control deals noncombat damage to an opponent, if there are four or more card types among cards in your graveyard, this enchantment deals that amount of damage to target creature that player controls.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'noncombatDamageDealt', by: 'you', to: 'opponent' },
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: { zone: 'battlefield', types: ['creature'], controller: 'triggerPlayer' },
            },
          },
        ],
        effect: { kind: 'dealDamage', amount: { kind: 'triggerDamage' }, to: T1 },
        interveningIf: {
          kind: 'amountIs',
          amount: { kind: 'cardTypesAmong', filter: { zone: 'graveyard', controller: 'you' } },
          compare: { cmp: 'atLeast', value: 4 },
        },
      },
    ],
  }),
  // "At the beginning of each opponent's upkeep, this enchantment deals 2 damage to that player unless they sacrifice a creature of their choice."
  singleFace({
    name: 'SYNTHETIC Grim Overseer',
    manaCost: ['2', 'B', 'R'],
    types: ['enchantment'],
    colors: ['B', 'R'],
    colorIdentity: ['B', 'R'],
    oracleText:
      "At the beginning of each opponent's upkeep, this enchantment deals 2 damage to that player unless they sacrifice a creature of their choice.",
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'step', step: 'upkeep', whose: 'opponent' },
        effect: {
          kind: 'unlessPays',
          player: { kind: 'triggerPlayer' },
          cost: [{ kind: 'sacrifice', what: { types: ['creature'] } }],
          effect: { kind: 'dealDamage', amount: 2, to: { kind: 'triggerPlayer' } },
        },
      },
    ],
  }),
  // "Indestructible. As long as your devotion to black and red is less than seven, this permanent isn't a creature."
  singleFace({
    name: 'SYNTHETIC Dim God',
    manaCost: ['2', 'B', 'R'],
    types: ['enchantment', 'creature'],
    supertypes: ['legendary'],
    subtypes: ['God'],
    colors: ['B', 'R'],
    colorIdentity: ['B', 'R'],
    power: 5,
    toughness: 3,
    oracleText:
      "Indestructible\nAs long as your devotion to black and red is less than seven, this permanent isn't a creature.",
    abilities: [
      kw('indestructible'),
      {
        kind: 'static',
        static: { kind: 'loseTypes', subject: THIS, types: ['creature'] },
        condition: {
          kind: 'amountIs',
          amount: { kind: 'devotion', colors: ['B', 'R'] },
          compare: { cmp: 'atMost', value: 6 },
        },
      },
    ],
  }),
  // "At the beginning of each opponent's upkeep, they lose 1 life and you put a -1/-1 counter on up to one target creature they control."
  singleFace({
    name: 'SYNTHETIC Creeping Constrictor',
    manaCost: ['2', 'B'],
    types: ['creature'],
    subtypes: ['Snake'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 2,
    toughness: 3,
    oracleText:
      "At the beginning of each opponent's upkeep, they lose 1 life and you put a -1/-1 counter on up to one target creature they control.",
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'step', step: 'upkeep', whose: 'opponent' },
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: { zone: 'battlefield', types: ['creature'], controller: 'triggerPlayer' },
            },
            min: 0,
            max: 1,
          },
        ],
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'loseLife', player: { kind: 'triggerPlayer' }, amount: 1 },
            { kind: 'addCounters', objects: T1, counter: '-1/-1', count: 1 },
          ],
        },
      },
    ],
  }),
  // "{T}: Add {B}{B}. Spend this mana only to cast instant, sorcery, Demon, and Spirit spells."
  singleFace({
    name: 'SYNTHETIC Soul Urn',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: ['B'],
    oracleText:
      '{T}: Add {B}{B}. Spend this mana only to cast instant, sorcery, Demon, and Spirit spells.',
    abilities: [
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production: { kind: 'fixed', mana: ['B', 'B'] },
        spendOnly: {
          types: ['instant', 'sorcery'],
          subtypes: ['Demon', 'Spirit'],
          typesOrSubtypes: true,
        },
      },
    ],
  }),
  // A black Spirit creature spell for the Urn to pay for: not an instant or a sorcery, so only its creature type lets the mana pay.
  singleFace({
    name: 'SYNTHETIC Wisp Spirit',
    manaCost: ['B', 'B'],
    types: ['creature'],
    subtypes: ['Spirit'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 1,
    toughness: 1,
    oracleText: '',
    abilities: [],
  }),
  // "At the beginning of your end step, target enchantment deals damage equal to its mana value to its controller unless that player sacrifices it."
  singleFace({
    name: 'SYNTHETIC Tithing Idol',
    manaCost: ['2', 'R'],
    types: ['creature'],
    subtypes: ['Imp'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 1,
    toughness: 1,
    oracleText:
      'At the beginning of your end step, target enchantment deals damage equal to its mana value to its controller unless that player sacrifices it.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'endStep', whose: 'you' },
        targets: [
          {
            id: 't1',
            what: { kind: 'object', filter: { zone: 'battlefield', types: ['enchantment'] } },
          },
        ],
        effect: {
          kind: 'unlessPays',
          player: { kind: 'controllerOf', of: T1_REF },
          cost: [{ kind: 'sacrifice', what: { kind: 'target', id: 't1' } }],
          effect: {
            kind: 'dealDamage',
            from: T1_REF,
            amount: { kind: 'manaValueOf', of: T1_REF },
            to: { kind: 'controllerOf', of: T1_REF },
          },
        },
      },
    ],
  }),
  // "Whenever this creature attacks, choose up to one target nonland permanent. Its controller may sacrifice it. If they don't, this creature deals 5 damage to that player."
  singleFace({
    name: 'SYNTHETIC Reckless Athlete',
    manaCost: ['2', 'R'],
    types: ['creature'],
    subtypes: ['Human'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 3,
    toughness: 3,
    oracleText:
      "Whenever this creature attacks, choose up to one target nonland permanent. Its controller may sacrifice it. If they don't, this creature deals 5 damage to that player.",
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'attacks', what: { kind: 'this' } },
        targets: [
          {
            id: 't1',
            what: { kind: 'object', filter: { zone: 'battlefield', notTypes: ['land'] } },
            min: 0,
            max: 1,
          },
        ],
        effect: {
          kind: 'playersMay',
          players: { kind: 'controllerOf', of: T1_REF },
          effect: { kind: 'sacrifice', objects: T1_REF, byController: true },
          runsAs: 'chooser',
          otherwise: { kind: 'dealDamage', amount: 5, to: { kind: 'declinedPlayer' } },
        },
      },
    ],
  }),
  // "Whenever a creature you control dies, you may pay X life, where X is its power. If you do, draw X cards."
  singleFace({
    name: 'SYNTHETIC Grim Ledger',
    manaCost: ['1', 'B'],
    types: ['enchantment'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText:
      'Whenever a creature you control dies, you may pay X life, where X is its power. If you do, draw X cards.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'dies', what: { types: ['creature'], controller: 'you' } },
        effect: {
          kind: 'mayPay',
          cost: [{ kind: 'payLife', amount: { kind: 'powerOf', of: { kind: 'triggerSubject' } } }],
          effect: {
            kind: 'draw',
            player: YOU,
            count: { kind: 'powerOf', of: { kind: 'triggerSubject' } },
          },
        },
      },
    ],
  }),
  // "Equipped creature gets +1/+1. Whenever equipped creature dies, you may pay X life, where X is its power. If you do, draw X cards."
  singleFace({
    name: 'SYNTHETIC Ledger Mask',
    manaCost: ['2'],
    types: ['artifact'],
    subtypes: ['Equipment'],
    colors: [],
    colorIdentity: [],
    oracleText:
      'Whenever equipped creature dies, you may pay X life, where X is its power. If you do, draw X cards.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'dies', what: { kind: 'attached' } },
        effect: {
          kind: 'mayPay',
          cost: [{ kind: 'payLife', amount: { kind: 'powerOf', of: { kind: 'triggerSubject' } } }],
          effect: {
            kind: 'draw',
            player: YOU,
            count: { kind: 'powerOf', of: { kind: 'triggerSubject' } },
          },
        },
      },
    ],
  }),
  // "As an additional cost to cast this spell, discard a card. Draw two cards. If the discarded card wasn't a land card, this spell deals 2 damage to each opponent."
  singleFace({
    name: 'SYNTHETIC Grasping Prize',
    manaCost: ['1', 'R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      "As an additional cost to cast this spell, discard a card. Draw two cards. If the discarded card wasn't a land card, this spell deals 2 damage to each opponent.",
    additionalCosts: [{ kind: 'discard', count: 1 }],
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'draw', player: YOU, count: 2 },
          {
            kind: 'conditional',
            condition: {
              kind: 'not',
              term: { kind: 'discardedAsCostMatches', filter: { types: ['land'] } },
            },
            effect: { kind: 'dealDamage', amount: 2, to: { kind: 'eachOpponent' } },
          },
        ],
      },
    },
  }),
  // "Whenever a player casts their first spell each turn, choose another target player. This creature deals damage equal to that spell's mana value to the chosen player."
  singleFace({
    name: 'SYNTHETIC Spiteful Judge',
    manaCost: ['3', 'B', 'R'],
    types: ['creature'],
    subtypes: ['Demon'],
    colors: ['B', 'R'],
    colorIdentity: ['B', 'R'],
    power: 4,
    toughness: 4,
    oracleText:
      "Whenever a player casts their first spell each turn, choose another target player. This creature deals damage equal to that spell's mana value to the chosen player.",
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'castSpell', filter: { stackKind: 'spell' }, by: 'any', nth: 1 },
        targets: [{ id: 't1', what: { kind: 'player', filter: 'otherThanTriggerPlayer' } }],
        effect: {
          kind: 'dealDamage',
          amount: { kind: 'manaValueOf', of: { kind: 'triggerSubject' } },
          to: T1,
        },
      },
    ],
  }),
  // "Whenever you cast your first spell each turn, choose an opponent at random. This creature deals damage equal to that spell's mana value to that player or a planeswalker that player controls."
  singleFace({
    name: 'SYNTHETIC Chaotic Smasher',
    manaCost: ['1', 'B', 'R'],
    types: ['creature'],
    subtypes: ['Goblin'],
    colors: ['B', 'R'],
    colorIdentity: ['B', 'R'],
    power: 2,
    toughness: 3,
    oracleText:
      "Whenever you cast your first spell each turn, choose an opponent at random. This creature deals damage equal to that spell's mana value to that player or a planeswalker that player controls.",
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'castSpell', filter: { stackKind: 'spell' }, by: 'you', nth: 1 },
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'choosePlayer', among: 'opponent', random: true },
            {
              kind: 'dealDamageToChosenPlayerOrPlaneswalker',
              amount: { kind: 'manaValueOf', of: { kind: 'triggerSubject' } },
            },
          ],
        },
      },
    ],
  }),
  // "At the beginning of each of your postcombat main phases, look at the top X cards of your library, where X is the total amount of life your opponents lost this turn. Exile one of those
  //  cards and put the rest on the bottom of your library in a random order. You may play the exiled card this turn."
  singleFace({
    name: 'SYNTHETIC Patient Scion',
    manaCost: ['2', 'B', 'R'],
    types: ['creature'],
    subtypes: ['Vampire'],
    colors: ['B', 'R'],
    colorIdentity: ['B', 'R'],
    power: 3,
    toughness: 3,
    oracleText:
      'At the beginning of each of your postcombat main phases, look at the top X cards of your library, where X is the total amount of life your opponents lost this turn. Exile one of those cards and put the rest on the bottom of your library in a random order. You may play the exiled card this turn.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'step', step: 'main2', whose: 'you' },
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'lookAtTop',
              count: { kind: 'opponentsLifeLostThisTurn' },
              take: { filter: {}, max: 1, min: 1, to: 'exile' },
              rest: 'bottomRandom',
            },
            { kind: 'mayPlay', objects: { kind: 'moved' }, lasts: 'endOfTurn' },
          ],
        },
      },
    ],
  }),
];
