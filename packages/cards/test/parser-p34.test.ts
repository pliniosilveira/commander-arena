// Stage P34 (M9): the Dragons slice of the engine (D-151, ENGINE_VERSION 34) read by the grammar (D-152). The lines of `REAL` are the real
// Oracle text of the thirty cards of the Dragons precon (packages/cards/test/fixtures/corpus/golden.jsonl), names replaced by ~, each with the
// nodes the grammar produces (the shapes of "The Dragons slice (D-151)" in docs/MECHANICS.md); `CROSS` reads lines that say the same thing over
// other types, numbers and filters and compares them with the engine's SYNTHETIC fixtures, which the engine's own scenario tests play; every other
// line is SYNTHETIC: siblings over other types, numbers, colors and filters, the near misses and the lines the grammar must not read. The engine
// runs what is lowered in convert-grammar-engine-p34.test.ts; a missing engine feature is named in parser-p34-needs.test.ts.
//
// Differences of detail from "The Dragons slice (D-151)", all of them the same thing to the engine: a target or a group filter carries
// `zone: 'battlefield'` (or `'graveyard'`) where the engine's own examples leave it out; Minion of the Mighty's "you may" is the `optional` of
// the ability, not of the card chosen; and the mode text of a modal ability names the card.
import { syntheticCard } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { dropped, type FaceType, readAll } from './parser-p5-helpers';

const drop = (text: string, type: FaceType = 'creature', subtypes: readonly string[] = []) =>
  dropped(text, type, subtypes);

/** The real Oracle text of the cards of the Dragons precon, as the nodes the engine runs. */
const REAL: readonly (readonly [
  string,
  string,
  FaceType,
  readonly string[],
  { abilities?: unknown; spell?: unknown },
])[] = [
  [
    'Anger',
    'Haste\nAs long as this card is in your graveyard and you control a Mountain, creatures you control have haste.',
    'creature',
    ['Incarnation'],
    {
      abilities: [
        { kind: 'keyword', keyword: { kind: 'haste' } },
        {
          kind: 'static',
          static: {
            kind: 'grantKeyword',
            subject: { kind: 'filter', filter: { types: ['creature'], controller: 'you' } },
            keyword: { kind: 'haste' },
          },
          condition: { kind: 'controlsAtLeast', filter: { subtypes: ['Mountain'] }, count: 1 },
          functionsIn: 'graveyard',
        },
      ],
    },
  ],
  [
    'Atsushi, the Blazing Sky',
    'Flying, trample\nWhen ~ dies, choose one —\n• Exile the top two cards of your library. Until the end of your next turn, you may play those cards.\n• Create three Treasure tokens.',
    'creature',
    ['Dragon', 'Spirit'],
    {
      abilities: [
        { kind: 'keyword', keyword: { kind: 'flying' } },
        { kind: 'keyword', keyword: { kind: 'trample' } },
        {
          kind: 'triggered',
          trigger: { kind: 'dies', what: { kind: 'this' } },
          effect: { kind: 'sequence', effects: [] },
          modes: [
            {
              text: 'Exile the top two cards of your library. Until the end of your next turn, you may play those cards.',
              effect: {
                kind: 'sequence',
                effects: [
                  { kind: 'exileTop', count: 2 },
                  { kind: 'mayPlay', objects: { kind: 'moved' }, lasts: 'endOfYourNextTurn' },
                ],
              },
            },
            {
              text: 'Create three Treasure tokens.',
              effect: {
                kind: 'createToken',
                token: { kind: 'preset', preset: 'Treasure' },
                count: 3,
              },
            },
          ],
          chooseModes: { min: 1, max: 1 },
        },
      ],
    },
  ],
  [
    'Breaching Dragonstorm',
    "When this enchantment enters, exile cards from the top of your library until you exile a nonland card. You may cast it without paying its mana cost if that spell's mana value is 8 or less. If you don't, put that card into your hand.\nWhen a Dragon you control enters, return this enchantment to its owner's hand.",
    'enchantment',
    [],
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
          effect: { kind: 'exileUntilCast', castAtMost: 8, rest: 'stayExiled' },
        },
        {
          kind: 'triggered',
          trigger: { kind: 'entersBattlefield', what: { subtypes: ['Dragon'], controller: 'you' } },
          effect: { kind: 'moveToZone', objects: { kind: 'this' }, to: 'hand' },
        },
      ],
    },
  ],
  [
    'Carnelian Orb of Dragonkind',
    '{T}: Add {R}. If that mana is spent on a Dragon creature spell, it gains haste until end of turn.',
    'artifact',
    [],
    {
      abilities: [
        {
          kind: 'mana',
          cost: [{ kind: 'tap' }],
          production: { kind: 'fixed', mana: ['R'] },
          spentRider: { spells: { types: ['creature'], subtypes: ['Dragon'] }, grants: 'haste' },
        },
      ],
    },
  ],
  [
    "Chandra's Ignition",
    'Target creature you control deals damage equal to its power to each other creature and each opponent.',
    'sorcery',
    [],
    {
      spell: {
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
            },
          },
        ],
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'dealDamage',
              amount: { kind: 'powerOf', of: { kind: 'target', id: 't1' } },
              to: {
                kind: 'each',
                filter: { zone: 'battlefield', types: ['creature'] },
                except: { kind: 'target', id: 't1' },
              },
              from: { kind: 'target', id: 't1' },
            },
            {
              kind: 'dealDamage',
              amount: { kind: 'powerOf', of: { kind: 'target', id: 't1' } },
              to: { kind: 'eachOpponent' },
              from: { kind: 'target', id: 't1' },
            },
          ],
        },
      },
    },
  ],
  [
    'Chaos Warp',
    "The owner of target permanent shuffles it into their library, then reveals the top card of their library. If it's a permanent card, they put it onto the battlefield.",
    'instant',
    [],
    {
      spell: {
        targets: [{ id: 't1', what: { kind: 'object', filter: { zone: 'battlefield' } } }],
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'moveToZone', objects: { kind: 'target', id: 't1' }, to: 'library' },
            { kind: 'shuffle', player: { kind: 'ownerOf', of: { kind: 'target', id: 't1' } } },
            {
              kind: 'revealTop',
              player: { kind: 'ownerOf', of: { kind: 'target', id: 't1' } },
              ifMatches: {
                anyOf: [
                  { types: ['artifact'] },
                  { types: ['creature'] },
                  { types: ['enchantment'] },
                  { types: ['land'] },
                  { types: ['planeswalker'] },
                  { types: ['battle'] },
                ],
              },
              to: 'battlefield',
            },
          ],
        },
      },
    },
  ],
  [
    'Count on Luck',
    'At the beginning of your upkeep, exile the top card of your library. You may play that card this turn.',
    'enchantment',
    [],
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'upkeep', whose: 'you' },
          effect: {
            kind: 'sequence',
            effects: [
              { kind: 'exileTop', count: 1 },
              { kind: 'mayPlay', objects: { kind: 'moved' }, lasts: 'endOfTurn' },
            ],
          },
        },
      ],
    },
  ],
  [
    'Cursed Mirror',
    '{T}: Add {R}.\nAs this artifact enters, you may have it become a copy of any creature on the battlefield until end of turn, except it has haste.',
    'artifact',
    [],
    {
      abilities: [
        { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['R'] } },
        {
          kind: 'replacement',
          replacement: {
            kind: 'entersAsCopy',
            what: { types: ['creature'] },
            optional: true,
            duration: 'untilEndOfTurn',
            gains: [{ kind: 'haste' }],
          },
        },
      ],
    },
  ],
  [
    "Dragonhawk, Fate's Tempest",
    'Flying\nWhenever ~ enters or attacks, exile the top X cards of your library, where X is the number of creatures you control with power 4 or greater. You may play those cards until your next end step. At the beginning of your next end step, ~ deals 2 damage to each opponent for each of those cards that are still exiled.',
    'creature',
    ['Bird', 'Dragon'],
    {
      abilities: [
        { kind: 'keyword', keyword: { kind: 'flying' } },
        {
          kind: 'triggered',
          trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
          effect: {
            kind: 'sequence',
            effects: [
              {
                kind: 'exileTop',
                count: {
                  kind: 'countOf',
                  filter: {
                    types: ['creature'],
                    controller: 'you',
                    power: { cmp: 'atLeast', value: 4 },
                  },
                },
              },
              { kind: 'mayPlay', objects: { kind: 'moved' }, lasts: 'yourNextEndStep' },
              {
                kind: 'delayedTrigger',
                at: { step: 'endStep', whose: 'you' },
                effect: {
                  kind: 'dealDamage',
                  amount: { kind: 'multiple', factor: 2, of: { kind: 'exiledStillThere' } },
                  to: { kind: 'eachOpponent' },
                },
              },
            ],
          },
        },
        {
          kind: 'triggered',
          trigger: { kind: 'attacks', what: { kind: 'this' } },
          effect: {
            kind: 'sequence',
            effects: [
              {
                kind: 'exileTop',
                count: {
                  kind: 'countOf',
                  filter: {
                    types: ['creature'],
                    controller: 'you',
                    power: { cmp: 'atLeast', value: 4 },
                  },
                },
              },
              { kind: 'mayPlay', objects: { kind: 'moved' }, lasts: 'yourNextEndStep' },
              {
                kind: 'delayedTrigger',
                at: { step: 'endStep', whose: 'you' },
                effect: {
                  kind: 'dealDamage',
                  amount: { kind: 'multiple', factor: 2, of: { kind: 'exiledStillThere' } },
                  to: { kind: 'eachOpponent' },
                },
              },
            ],
          },
        },
      ],
    },
  ],
  [
    'Dragonstorm Globe',
    'Each Dragon you control enters with an additional +1/+1 counter on it.\n{T}: Add one mana of any color.',
    'artifact',
    [],
    {
      abilities: [
        {
          kind: 'replacement',
          replacement: {
            kind: 'othersEnterWithCounters',
            what: { subtypes: ['Dragon'], controller: 'you' },
            counter: '+1/+1',
            count: 1,
          },
        },
        { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'anyColor' } },
      ],
    },
  ],
  [
    'Drakuseth, Maw of Flames',
    'Flying\nWhenever ~ attacks, ~ deals 4 damage to any target and 3 damage to each of up to two other targets.',
    'creature',
    ['Dragon'],
    {
      abilities: [
        { kind: 'keyword', keyword: { kind: 'flying' } },
        {
          kind: 'triggered',
          trigger: { kind: 'attacks', what: { kind: 'this' } },
          targets: [
            { id: 't1', what: { kind: 'anyTarget' } },
            { id: 't2', what: { kind: 'anyTarget' }, min: 0, max: 2, differentFrom: 't1' },
          ],
          effect: {
            kind: 'sequence',
            effects: [
              { kind: 'dealDamage', amount: 4, to: { kind: 'target', id: 't1' } },
              { kind: 'dealDamage', amount: 3, to: { kind: 'target', id: 't2' } },
            ],
          },
        },
      ],
    },
  ],
  [
    'Goddric, Cloaked Reveler',
    'Haste\nCelebration — As long as two or more nonland permanents entered the battlefield under your control this turn, ~ is a Dragon with base power and toughness 4/4, flying, and "{R}: Dragons you control get +1/+0 until end of turn." (He loses all other creature types.)',
    'creature',
    ['Human', 'Noble'],
    {
      abilities: [
        { kind: 'keyword', keyword: { kind: 'haste' } },
        {
          kind: 'static',
          static: {
            kind: 'setTypes',
            subject: { kind: 'this' },
            types: ['creature'],
            subtypes: ['Dragon'],
          },
          condition: { kind: 'enteredThisTurn', count: 2, notTypes: ['land'] },
        },
        {
          kind: 'static',
          static: { kind: 'setPt', subject: { kind: 'this' }, power: 4, toughness: 4 },
          condition: { kind: 'enteredThisTurn', count: 2, notTypes: ['land'] },
        },
        {
          kind: 'static',
          static: { kind: 'grantKeyword', subject: { kind: 'this' }, keyword: { kind: 'flying' } },
          condition: { kind: 'enteredThisTurn', count: 2, notTypes: ['land'] },
        },
        {
          kind: 'static',
          static: {
            kind: 'grantAbility',
            subject: { kind: 'this' },
            ability: {
              kind: 'activated',
              cost: [{ kind: 'mana', symbols: ['R'] }],
              effect: {
                kind: 'modifyPt',
                objects: {
                  kind: 'each',
                  filter: { zone: 'battlefield', subtypes: ['Dragon'], controller: 'you' },
                },
                power: 1,
                toughness: 0,
                duration: 'untilEndOfTurn',
              },
            },
          },
          condition: { kind: 'enteredThisTurn', count: 2, notTypes: ['land'] },
        },
      ],
    },
  ],
  [
    'Goldlust Triad',
    "Flying\nMyriad (Whenever this creature attacks, for each opponent other than defending player, you may create a token copy that's tapped and attacking that player or a planeswalker they control. Exile the tokens at end of combat.)\nWhenever this creature deals combat damage to a player, create a Treasure token.",
    'creature',
    ['Dragon'],
    {
      abilities: [
        { kind: 'keyword', keyword: { kind: 'flying' } },
        { kind: 'keyword', keyword: { kind: 'myriad' } },
        {
          kind: 'triggered',
          trigger: { kind: 'dealsCombatDamage', what: { kind: 'this' }, to: 'player' },
          effect: { kind: 'createToken', token: { kind: 'preset', preset: 'Treasure' }, count: 1 },
        },
      ],
    },
  ],
  [
    'Haven of the Spirit Dragon',
    '{T}: Add {C}.\n{T}: Add one mana of any color. Spend this mana only to cast a Dragon creature spell.\n{2}, {T}, Sacrifice this land: Return target Dragon creature card or Ugin planeswalker card from your graveyard to your hand.',
    'land',
    [],
    {
      abilities: [
        { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['C'] } },
        {
          kind: 'mana',
          cost: [{ kind: 'tap' }],
          production: { kind: 'anyColor' },
          spendOnly: { types: ['creature'], subtypes: ['Dragon'] },
        },
        {
          kind: 'activated',
          cost: [
            { kind: 'mana', symbols: ['2'] },
            { kind: 'tap' },
            { kind: 'sacrifice', what: { kind: 'this' } },
          ],
          targets: [
            {
              id: 't1',
              what: {
                kind: 'object',
                filter: {
                  zone: 'graveyard',
                  controller: 'you',
                  anyOf: [
                    { types: ['creature'], subtypes: ['Dragon'] },
                    { types: ['planeswalker'], subtypes: ['Ugin'] },
                  ],
                },
              },
            },
          ],
          effect: { kind: 'moveToZone', objects: { kind: 'target', id: 't1' }, to: 'hand' },
        },
      ],
    },
  ],
  [
    'Hellkite Charger',
    'Flying, haste\nWhenever this creature attacks, you may pay {5}{R}{R}. If you do, untap all attacking creatures and after this phase, there is an additional combat phase.',
    'creature',
    ['Dragon'],
    {
      abilities: [
        { kind: 'keyword', keyword: { kind: 'flying' } },
        { kind: 'keyword', keyword: { kind: 'haste' } },
        {
          kind: 'triggered',
          trigger: { kind: 'attacks', what: { kind: 'this' } },
          effect: {
            kind: 'mayPay',
            cost: [{ kind: 'mana', symbols: ['5', 'R', 'R'] }],
            effect: {
              kind: 'sequence',
              effects: [
                {
                  kind: 'untap',
                  objects: {
                    kind: 'each',
                    filter: { zone: 'battlefield', types: ['creature'], attacking: true },
                  },
                },
                { kind: 'extraCombat' },
              ],
            },
          },
        },
      ],
    },
  ],
  [
    "Herald's Horn",
    "As this artifact enters, choose a creature type.\nCreature spells you cast of the chosen type cost {1} less to cast.\nAt the beginning of your upkeep, look at the top card of your library. If it's a creature card of the chosen type, you may reveal it and put it into your hand.",
    'artifact',
    [],
    {
      abilities: [
        { kind: 'replacement', replacement: { kind: 'asEntersChoose', what: 'creatureType' } },
        {
          kind: 'static',
          static: {
            kind: 'costReduction',
            spells: { types: ['creature'], controller: 'you', chosenType: true },
            amount: 1,
          },
        },
        {
          kind: 'triggered',
          trigger: { kind: 'upkeep', whose: 'you' },
          effect: {
            kind: 'lookAtTop',
            count: 1,
            take: { filter: { types: ['creature'], chosenType: true }, max: 1 },
            rest: 'top',
          },
        },
      ],
    },
  ],
  [
    'Hit the Mother Lode',
    "Discover 10. If the discovered card's mana value is less than 10, create a number of tapped Treasure tokens equal to the difference. (To discover 10, exile cards from the top of your library until you exile a nonland card with mana value 10 or less. Cast it without paying its mana cost or put it into your hand. Put the rest on the bottom in a random order.)",
    'sorcery',
    [],
    {
      spell: {
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'exileUntilCast', foundAtMost: 10, rest: 'bottomRandom' },
            {
              kind: 'createToken',
              token: { kind: 'preset', preset: 'Treasure' },
              count: { kind: 'shortfall', limit: 10, of: { kind: 'moved' } },
              tapped: true,
            },
          ],
        },
      },
    },
  ],
  [
    'Leyline Tyrant',
    "Flying\nYou don't lose unspent red mana as steps and phases end.\nWhen this creature dies, you may pay any amount of {R}. When you do, it deals that much damage to any target.",
    'creature',
    ['Dragon'],
    {
      abilities: [
        { kind: 'keyword', keyword: { kind: 'flying' } },
        { kind: 'static', static: { kind: 'unspentManaStays', colors: ['R'] } },
        {
          kind: 'triggered',
          trigger: { kind: 'dies', what: { kind: 'this' } },
          effect: {
            kind: 'payAnyAmount',
            symbol: 'R',
            reflexive: {
              targets: [{ id: 't1', what: { kind: 'anyTarget' } }],
              effect: {
                kind: 'dealDamage',
                amount: { kind: 'triggerDamage' },
                to: { kind: 'target', id: 't1' },
              },
            },
          },
        },
      ],
    },
  ],
  [
    'Mana Geyser',
    'Add {R} for each tapped land your opponents control.',
    'sorcery',
    [],
    {
      spell: {
        effect: {
          kind: 'addMana',
          mana: {
            kind: 'fixed',
            mana: ['R'],
            times: {
              kind: 'countOf',
              filter: { types: ['land'], controller: 'opponent', tapped: true },
            },
          },
        },
      },
    },
  ],
  [
    'Minion of the Mighty',
    'Menace\nPack tactics — Whenever this creature attacks, if you attacked with creatures with total power 6 or greater this combat, you may put a Dragon creature card from your hand onto the battlefield tapped and attacking.',
    'creature',
    ['Kobold'],
    {
      abilities: [
        { kind: 'keyword', keyword: { kind: 'menace' } },
        {
          kind: 'triggered',
          trigger: { kind: 'attacks', what: { kind: 'this' } },
          effect: {
            kind: 'sequence',
            effects: [
              {
                kind: 'moveToZone',
                objects: {
                  kind: 'choose',
                  filter: {
                    zone: 'hand',
                    types: ['creature'],
                    subtypes: ['Dragon'],
                    controller: 'you',
                  },
                },
                to: 'battlefield',
                tapped: true,
              },
              { kind: 'enterAttacking', objects: { kind: 'moved' } },
            ],
          },
          optional: true,
          interveningIf: { kind: 'attackersTotalPower', atLeast: 6 },
        },
      ],
    },
  ],
  [
    'Orb of Dragonkind',
    '{1}, {T}: Add two mana in any combination of colors. Spend this mana only to cast Dragon spells or activate abilities of Dragons.\n{R}, {T}, Sacrifice this artifact: Look at the top seven cards of your library. You may reveal a Dragon card from among them and put it into your hand. Put the rest on the bottom of your library in a random order.',
    'artifact',
    [],
    {
      abilities: [
        {
          kind: 'mana',
          cost: [{ kind: 'mana', symbols: ['1'] }, { kind: 'tap' }],
          production: { kind: 'anyCombination', count: 2 },
          spendOnly: { subtypes: ['Dragon'], alsoAbilities: true },
        },
        {
          kind: 'activated',
          cost: [
            { kind: 'mana', symbols: ['R'] },
            { kind: 'tap' },
            { kind: 'sacrifice', what: { kind: 'this' } },
          ],
          effect: {
            kind: 'lookAtTop',
            count: 7,
            take: { filter: { subtypes: ['Dragon'] }, max: 1 },
            rest: 'bottomRandom',
          },
        },
      ],
    },
  ],
  [
    'Outpost Siege',
    'As this enchantment enters, choose Khans or Dragons.\n• Khans — At the beginning of your upkeep, exile the top card of your library. Until end of turn, you may play that card.\n• Dragons — Whenever a creature you control leaves the battlefield, this enchantment deals 1 damage to any target.',
    'enchantment',
    [],
    {
      abilities: [
        {
          kind: 'replacement',
          replacement: { kind: 'asEntersChoose', what: 'option', options: ['Khans', 'Dragons'] },
        },
        {
          kind: 'triggered',
          trigger: { kind: 'upkeep', whose: 'you' },
          effect: {
            kind: 'sequence',
            effects: [
              { kind: 'exileTop', count: 1 },
              { kind: 'mayPlay', objects: { kind: 'moved' }, lasts: 'endOfTurn' },
            ],
          },
          triggerCondition: { kind: 'chosenOption', option: 'Khans' },
        },
        {
          kind: 'triggered',
          trigger: { kind: 'leavesBattlefield', what: { types: ['creature'], controller: 'you' } },
          targets: [{ id: 't1', what: { kind: 'anyTarget' } }],
          effect: { kind: 'dealDamage', amount: 1, to: { kind: 'target', id: 't1' } },
          triggerCondition: { kind: 'chosenOption', option: 'Dragons' },
        },
      ],
    },
  ],
  [
    'Parapet Thrasher',
    "Flying\nWhenever one or more Dragons you control deal combat damage to an opponent, choose one that hasn't been chosen this turn —\n• Destroy target artifact that opponent controls.\n• This creature deals 4 damage to each other opponent.\n• Exile the top card of your library. You may play it this turn.",
    'creature',
    ['Dragon'],
    {
      abilities: [
        { kind: 'keyword', keyword: { kind: 'flying' } },
        {
          kind: 'triggered',
          trigger: {
            kind: 'combatDamageBatch',
            what: { subtypes: ['Dragon'], controller: 'you' },
            to: 'opponent',
          },
          effect: { kind: 'sequence', effects: [] },
          modes: [
            {
              text: 'Destroy target artifact that opponent controls.',
              targets: [
                {
                  id: 't1',
                  what: {
                    kind: 'object',
                    filter: {
                      zone: 'battlefield',
                      types: ['artifact'],
                      controller: 'triggerPlayer',
                    },
                  },
                },
              ],
              effect: { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
            },
            {
              text: 'SYNTHETIC Card deals 4 damage to each other opponent.',
              effect: { kind: 'dealDamage', amount: 4, to: { kind: 'eachOtherOpponent' } },
            },
            {
              text: 'Exile the top card of your library. You may play it this turn.',
              effect: {
                kind: 'sequence',
                effects: [
                  { kind: 'exileTop', count: 1 },
                  { kind: 'mayPlay', objects: { kind: 'moved' }, lasts: 'endOfTurn' },
                ],
              },
            },
          ],
          chooseModes: { min: 1, max: 1, notRepeatedThisTurn: true },
        },
      ],
    },
  ],
  [
    'Sarkhan, Dragon Ascendant',
    'When ~ enters, you may behold a Dragon. If you do, create a Treasure token. (To behold a Dragon, choose a Dragon you control or reveal a Dragon card from your hand.)\nWhenever a Dragon you control enters, put a +1/+1 counter on ~. Until end of turn, ~ becomes a Dragon in addition to his other types and gains flying.',
    'creature',
    ['Human', 'Druid'],
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
          effect: {
            kind: 'sequence',
            effects: [
              { kind: 'may', effect: { kind: 'behold', filter: { subtypes: ['Dragon'] } } },
              {
                kind: 'conditional',
                condition: { kind: 'didPrevious' },
                effect: {
                  kind: 'createToken',
                  token: { kind: 'preset', preset: 'Treasure' },
                  count: 1,
                },
              },
            ],
          },
        },
        {
          kind: 'triggered',
          trigger: { kind: 'entersBattlefield', what: { subtypes: ['Dragon'], controller: 'you' } },
          effect: {
            kind: 'sequence',
            effects: [
              { kind: 'addCounters', objects: { kind: 'this' }, counter: '+1/+1', count: 1 },
              {
                kind: 'setTypes',
                objects: { kind: 'this' },
                subtypes: ['Dragon'],
                additive: true,
                duration: 'untilEndOfTurn',
              },
              {
                kind: 'grantKeyword',
                objects: { kind: 'this' },
                keyword: { kind: 'flying' },
                duration: 'untilEndOfTurn',
              },
            ],
          },
        },
      ],
    },
  ],
  [
    'Scourge of the Throne',
    "Flying\nDethrone (Whenever this creature attacks the player with the most life or tied for most life, put a +1/+1 counter on it.)\nWhenever this creature attacks for the first time each turn, if it's attacking the player with the most life or tied for most life, untap all attacking creatures. After this phase, there is an additional combat phase.",
    'creature',
    ['Dragon'],
    {
      abilities: [
        { kind: 'keyword', keyword: { kind: 'flying' } },
        { kind: 'keyword', keyword: { kind: 'dethrone' } },
        {
          kind: 'triggered',
          trigger: { kind: 'attacks', what: { kind: 'this' }, firstTimeEachTurn: true },
          effect: {
            kind: 'sequence',
            effects: [
              {
                kind: 'untap',
                objects: {
                  kind: 'each',
                  filter: { zone: 'battlefield', types: ['creature'], attacking: true },
                },
              },
              { kind: 'extraCombat' },
            ],
          },
          interveningIf: { kind: 'attackingMostLife' },
        },
      ],
    },
  ],
  [
    'Spinerock Knoll',
    'Hideaway 4 (When this land enters, look at the top four cards of your library, exile one face down, then put the rest on the bottom in a random order.)\nThis land enters tapped.\n{T}: Add {R}.\n{R}, {T}: You may play the exiled card without paying its mana cost if an opponent was dealt 7 or more damage this turn.',
    'land',
    [],
    {
      abilities: [
        { kind: 'keyword', keyword: { kind: 'hideaway', count: 4 } },
        { kind: 'replacement', replacement: { kind: 'entersTapped' } },
        { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['R'] } },
        {
          kind: 'activated',
          cost: [{ kind: 'mana', symbols: ['R'] }, { kind: 'tap' }],
          effect: {
            kind: 'conditional',
            condition: { kind: 'playerDealtDamage', player: 'opponent', atLeast: 7 },
            effect: { kind: 'castFree', objects: { kind: 'linkedExile' }, play: true },
          },
        },
      ],
    },
  ],
  [
    'Spit Flame',
    '~ deals 4 damage to target creature.\nWhenever a Dragon you control enters, you may pay {R}. If you do, return this card from your graveyard to your hand.',
    'instant',
    [],
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'entersBattlefield', what: { subtypes: ['Dragon'], controller: 'you' } },
          effect: {
            kind: 'mayPay',
            cost: [{ kind: 'mana', symbols: ['R'] }],
            effect: { kind: 'moveToZone', objects: { kind: 'this' }, to: 'hand' },
          },
          functionsIn: 'graveyard',
        },
      ],
      spell: {
        targets: [
          {
            id: 't1',
            what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
          },
        ],
        effect: { kind: 'dealDamage', amount: 4, to: { kind: 'target', id: 't1' } },
      },
    },
  ],
  [
    'The Elder Dragon War',
    "Read ahead (Choose a chapter and start with that many lore counters. Add one after your draw step. Skipped chapters don't trigger. Sacrifice after III.)\nI — This Saga deals 2 damage to each creature and each opponent.\nII — Discard any number of cards, then draw that many cards.\nIII — Create a 4/4 red Dragon creature token with flying.",
    'enchantment',
    ['Saga'],
    {
      abilities: [
        { kind: 'keyword', keyword: { kind: 'readAhead' } },
        {
          kind: 'triggered',
          trigger: { kind: 'chapter', from: 1, to: 1 },
          effect: {
            kind: 'sequence',
            effects: [
              {
                kind: 'dealDamage',
                amount: 2,
                to: { kind: 'each', filter: { zone: 'battlefield', types: ['creature'] } },
              },
              { kind: 'dealDamage', amount: 2, to: { kind: 'eachOpponent' } },
            ],
          },
        },
        {
          kind: 'triggered',
          trigger: { kind: 'chapter', from: 2, to: 2 },
          effect: {
            kind: 'sequence',
            effects: [
              { kind: 'discard', player: { kind: 'you' }, count: 0, anyNumber: true },
              {
                kind: 'draw',
                player: { kind: 'you' },
                count: { kind: 'thisWay', what: 'discarded' },
              },
            ],
          },
        },
        {
          kind: 'triggered',
          trigger: { kind: 'chapter', from: 3, to: 3 },
          effect: {
            kind: 'createToken',
            token: {
              kind: 'custom',
              definition: {
                name: 'Dragon',
                manaCost: null,
                supertypes: [],
                types: ['creature'],
                subtypes: ['Dragon'],
                colors: ['R'],
                power: 4,
                toughness: 4,
                loyalty: null,
                defense: null,
                oracleText: '',
                abilities: [{ kind: 'keyword', keyword: { kind: 'flying' } }],
              },
            },
            count: 1,
          },
        },
      ],
    },
  ],
  [
    'Thundermane Dragon',
    'Flying\nYou may look at the top card of your library any time.\nYou may cast creature spells with power 4 or greater from the top of your library. If you cast a creature spell this way, it gains haste until end of turn.',
    'creature',
    ['Dragon'],
    {
      abilities: [
        { kind: 'keyword', keyword: { kind: 'flying' } },
        { kind: 'static', static: { kind: 'lookAtTopOfLibrary' } },
        {
          kind: 'static',
          static: {
            kind: 'castFromTopOfLibrary',
            spells: { types: ['creature'], power: { cmp: 'atLeast', value: 4 } },
            gainsHaste: true,
          },
        },
      ],
    },
  ],
  [
    "Tyrant's Familiar",
    'Flying, haste\nLieutenant — As long as you control your commander, this creature gets +2/+2 and has "Whenever this creature attacks, it deals 7 damage to target creature defending player controls."',
    'creature',
    ['Dragon'],
    {
      abilities: [
        { kind: 'keyword', keyword: { kind: 'flying' } },
        { kind: 'keyword', keyword: { kind: 'haste' } },
        {
          kind: 'static',
          static: { kind: 'modifyPt', subject: { kind: 'this' }, power: 2, toughness: 2 },
          condition: { kind: 'controlCommander', yours: true },
        },
        {
          kind: 'static',
          static: {
            kind: 'grantAbility',
            subject: { kind: 'this' },
            ability: {
              kind: 'triggered',
              trigger: { kind: 'attacks', what: { kind: 'this' } },
              targets: [
                {
                  id: 't1',
                  what: {
                    kind: 'object',
                    filter: {
                      zone: 'battlefield',
                      types: ['creature'],
                      controller: 'defendingPlayer',
                    },
                  },
                },
              ],
              effect: { kind: 'dealDamage', amount: 7, to: { kind: 'target', id: 't1' } },
            },
          },
          condition: { kind: 'controlCommander', yours: true },
        },
      ],
    },
  ],
];

describe('the thirty real cards of the Dragons precon read as the engine runs them (D-151)', () => {
  test.each(REAL)('%s', (_name, text, type, subtypes, expected) => {
    const parsed = readAll(text, type, subtypes);
    if (expected.abilities !== undefined) expect(parsed.abilities).toEqual(expected.abilities);
    else expect(parsed.abilities).toEqual([]);
    if (expected.spell !== undefined) expect(parsed.spell).toEqual(expected.spell);
    else expect(parsed.spell ?? undefined).toBeUndefined();
  });
});

// ---- The engine's own SYNTHETIC cards say the same things

/**
 * The same value with the details that mean the same to the engine left out: a battlefield zone of a filter, the text of a mode and the creature
 * type of "attacking creatures" (only a creature attacks).
 */
function plain(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(plain);
  if (value === 'art') return 't1';
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const attacking = record.attacking === true;
    // A Dragon is a creature: a filter of the Dragons that enters says no more with the card type.
    const dragons = Array.isArray(record.subtypes) && record.subtypes.includes('Dragon');
    const creatureOnly = (v: unknown) => JSON.stringify(v) === '["creature"]';
    const entries = Object.entries(record)
      .filter(([key, v]) => !(key === 'zone' && v === 'battlefield') && key !== 'text')
      .filter(([key, v]) => !((attacking || dragons) && key === 'types' && creatureOnly(v)))
      .map(([key, v]) => [key, plain(v)] as const);
    return Object.fromEntries(entries);
  }
  return value;
}

/** Each line is read by the grammar and must be what an engine fixture of the slice holds (the scenario tests of the engine play these). */
const CROSS: readonly (readonly [string, string, FaceType, readonly string[]])[] = [
  [
    'Charge Wyrm',
    'Flying, haste\nWhenever ~ attacks, you may pay {2}{R}. If you do, untap all attacking creatures and after this phase, there is an additional combat phase.',
    'creature',
    ['Dragon'],
  ],
  [
    'Usurper Wyrm',
    "Flying\nDethrone\nWhenever ~ attacks for the first time each turn, if it's attacking the player with the most life or tied for most life, untap all attacking creatures. After this phase, there is an additional combat phase.",
    'creature',
    ['Dragon'],
  ],
  ['Echo Drake', 'Flying\nMyriad', 'creature', ['Dragon']],
  [
    'Rolling Ignition',
    'Target creature you control deals damage equal to its power to each other creature and each opponent.',
    'sorcery',
    [],
  ],
  [
    'Maw Dragon',
    'Flying\nWhenever ~ attacks, it deals 4 damage to any target and 3 damage to each of up to two other targets.',
    'creature',
    ['Dragon'],
  ],
  [
    'Thrashing Wyrm',
    "Flying, double strike\nWhenever one or more Dragons you control deal combat damage to an opponent, choose one that hasn't been chosen this turn —\n• Destroy target artifact that opponent controls.\n• ~ deals 4 damage to each other opponent.\n• Exile the top card of your library. You may play it this turn.",
    'creature',
    ['Dragon'],
  ],
  [
    'Ember Tyrant',
    'Flying\nWhen ~ dies, you may pay any amount of {R}. When you do, it deals that much damage to any target.',
    'creature',
    ['Dragon'],
  ],
  [
    'Lieutenant Wyrm',
    'Flying, haste\nLieutenant — As long as you control your commander, ~ gets +2/+2 and has "Whenever ~ attacks, it deals 7 damage to target creature defending player controls."',
    'creature',
    ['Dragon'],
  ],
  [
    'Siege of Choices',
    'As ~ enters, choose Khans or Dragons.\n• Khans — At the beginning of your upkeep, exile the top card of your library. Until end of turn, you may play that card.\n• Dragons — Whenever a creature you control leaves the battlefield, ~ deals 1 damage to any target.',
    'enchantment',
    [],
  ],
  [
    'Cursed Looking Glass',
    'As ~ enters, you may have it become a copy of any creature on the battlefield until end of turn, except it has haste.',
    'artifact',
    [],
  ],
  [
    'Storm Globe',
    'Each Dragon you control enters with an additional +1/+1 counter on it.\n{T}: Add one mana of any color.',
    'artifact',
    [],
  ],
  [
    'Dragon Sanctum',
    '{2}, {T}, Sacrifice ~: Return target Dragon creature card or Ugin planeswalker card from your graveyard to your hand.',
    'land',
    [],
  ],
  [
    'Dragon Seeker',
    '{R}, {T}, Sacrifice ~: Look at the top seven cards of your library. You may reveal a Dragon card from among them and put it into your hand. Put the rest on the bottom of your library in a random order.',
    'artifact',
    [],
  ],
  [
    'Grave Spark',
    'Haste\nAs long as this card is in your graveyard and you control a Mountain, creatures you control have haste.',
    'creature',
    ['Incarnation'],
  ],
  [
    'Grave Chorus',
    'As long as this card is in your graveyard and you have 20 or more life, creatures you control get +1/+0.',
    'creature',
    ['Spirit'],
  ],
  [
    'Ember Return',
    '~ deals 4 damage to target creature.\nWhenever a Dragon you control enters, you may pay {R}. If you do, return this card from your graveyard to your hand.',
    'instant',
    [],
  ],
  [
    'Impulse Rite',
    'Exile the top card of your library. You may play that card this turn.',
    'sorcery',
    [],
  ],
  [
    'Long Impulse Rite',
    'Exile the top two cards of your library. Until the end of your next turn, you may play those cards.',
    'sorcery',
    [],
  ],
  [
    'Luck Altar',
    'At the beginning of your upkeep, exile the top card of your library. You may play that card this turn.',
    'enchantment',
    [],
  ],
  [
    'Hawk of Fortune',
    'Flying\nWhenever ~ enters or attacks, exile the top X cards of your library, where X is the number of creatures you control with power 4 or greater. You may play those cards until your next end step. At the beginning of your next end step, ~ deals 2 damage to each opponent for each of those cards that are still exiled.',
    'creature',
    ['Bird', 'Dragon'],
  ],
  [
    'Dying Dragon',
    'Flying, trample\nWhen ~ dies, choose one —\n• Exile the top two cards of your library. Until the end of your next turn, you may play those cards.\n• Create three Treasure tokens.',
    'creature',
    ['Dragon', 'Spirit'],
  ],
  [
    'Seer Drake',
    'Flying\nYou may look at the top card of your library any time.\nYou may cast creature spells with power 4 or greater from the top of your library. If you cast a creature spell this way, it gains haste until end of turn.',
    'creature',
    ['Dragon'],
  ],
  ['Artifact Oracle', 'You may cast artifact spells from the top of your library.', 'artifact', []],
  ['Tap Geyser', 'Add {R} for each tapped land your opponents control.', 'sorcery', []],
  ['Creature Geyser', 'Add {G}{G} for each creature you control.', 'sorcery', []],
  [
    'Dragon Orb',
    '{1}, {T}: Add two mana in any combination of colors. Spend this mana only to cast Dragon spells or activate abilities of Dragons.',
    'artifact',
    [],
  ],
  [
    'Dragon Haven',
    '{T}: Add {C}.\n{T}: Add one mana of any color. Spend this mana only to cast a Dragon creature spell.',
    'land',
    [],
  ],
  [
    'Hasty Orb',
    '{T}: Add {R}. If that mana is spent on a Dragon creature spell, it gains haste until end of turn.',
    'artifact',
    [],
  ],
  [
    'Mana Keeper Drake',
    "Flying\nYou don't lose unspent red mana as steps and phases end.",
    'creature',
    ['Dragon'],
  ],
  [
    'Warp Bolt',
    "The owner of target permanent shuffles it into their library, then reveals the top card of their library. If it's a permanent card, they put it onto the battlefield.",
    'instant',
    [],
  ],
  [
    'Breaching Hoard',
    "When ~ enters, exile cards from the top of your library until you exile a nonland card. You may cast it without paying its mana cost if that spell's mana value is 4 or less. If you don't, put that card into your hand.\nWhen a Dragon you control enters, return ~ to its owner's hand.",
    'enchantment',
    [],
  ],
  [
    'Discovery Rite',
    "Discover 4. If the discovered card's mana value is less than 4, create a number of tapped Treasure tokens equal to the difference.",
    'sorcery',
    [],
  ],
  [
    'Herald Trumpet',
    "As ~ enters, choose a creature type.\nCreature spells you cast of the chosen type cost {1} less to cast.\nAt the beginning of your upkeep, look at the top card of your library. If it's a creature card of the chosen type, you may reveal it and put it into your hand.",
    'artifact',
    [],
  ],
  [
    'Dragon Scout',
    'When ~ enters, you may behold a Dragon. If you do, create a Treasure token.\nWhenever a Dragon you control enters, put a +1/+1 counter on ~. Until end of turn, ~ becomes a Dragon in addition to its other types and gains flying.',
    'creature',
    ['Human', 'Druid'],
  ],
  [
    'Festive Chief',
    'Haste\nCelebration — As long as two or more nonland permanents entered the battlefield under your control this turn, ~ is a Dragon with base power and toughness 4/4, flying, and "{R}: Dragons you control get +1/+0 until end of turn."',
    'creature',
    ['Human', 'Noble'],
  ],
  [
    'Token Cheerer',
    'As long as two or more tokens entered the battlefield under your control this turn, ~ has base power and toughness 5/5.',
    'creature',
    ['Goblin'],
  ],
  [
    'Scorched Hideaway',
    'Hideaway 4\n~ enters tapped.\n{T}: Add {R}.\n{R}, {T}: You may play the exiled card without paying its mana cost if an opponent was dealt 3 or more damage this turn.',
    'land',
    [],
  ],
];

describe('the lines read as the SYNTHETIC cards of the engine hold them (D-151)', () => {
  test.each(CROSS)('%s', (name, text, type, subtypes) => {
    const parsed = readAll(text, type, subtypes);
    const fixture = syntheticCard(`SYNTHETIC ${name}`).faces[0];
    if (fixture === undefined) throw new Error(`no face of ${name}`);
    expect(plain(parsed.abilities)).toEqual(plain(fixture.abilities ?? []));
    expect(plain(parsed.spell ?? undefined)).toEqual(plain(fixture.spell ?? undefined));
  });
});

// ---- Siblings: the same rules over other numbers, types and words (SYNTHETIC lines)

const SIBLINGS: readonly (readonly [
  string,
  FaceType,
  readonly string[],
  { abilities?: unknown; spell?: unknown },
])[] = [
  [
    'Exile the top three cards of your library. You may play them this turn.',
    'sorcery',
    [],
    {
      spell: {
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'exileTop', count: 3 },
            { kind: 'mayPlay', objects: { kind: 'moved' }, lasts: 'endOfTurn' },
          ],
        },
      },
    },
  ],
  [
    'Exile the top X cards of your library. You may play them this turn.',
    'sorcery',
    [],
    {
      spell: {
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'exileTop', count: { kind: 'x' } },
            { kind: 'mayPlay', objects: { kind: 'moved' }, lasts: 'endOfTurn' },
          ],
        },
        x: true,
      },
    },
  ],
  [
    'Exile the top card of your library. Until the end of your next turn, you may play that card.',
    'instant',
    [],
    {
      spell: {
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'exileTop', count: 1 },
            { kind: 'mayPlay', objects: { kind: 'moved' }, lasts: 'endOfYourNextTurn' },
          ],
        },
      },
    },
  ],
  [
    'Whenever ~ attacks, you may pay {3}{G}. If you do, untap all attacking creatures and after this phase, there is an additional combat phase.',
    'creature',
    [],
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'attacks', what: { kind: 'this' } },
          effect: {
            kind: 'mayPay',
            cost: [{ kind: 'mana', symbols: ['3', 'G'] }],
            effect: {
              kind: 'sequence',
              effects: [
                {
                  kind: 'untap',
                  objects: {
                    kind: 'each',
                    filter: { zone: 'battlefield', types: ['creature'], attacking: true },
                  },
                },
                { kind: 'extraCombat' },
              ],
            },
          },
        },
      ],
    },
  ],
  [
    'Whenever ~ attacks, after this phase, there is an additional combat phase.',
    'creature',
    [],
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'attacks', what: { kind: 'this' } },
          effect: { kind: 'extraCombat' },
        },
      ],
    },
  ],
  [
    'Discover 5.',
    'sorcery',
    [],
    { spell: { effect: { kind: 'exileUntilCast', foundAtMost: 5, rest: 'bottomRandom' } } },
  ],
  [
    "Discover 4. If the discovered card's mana value is less than 4, create a number of Treasure tokens equal to the difference.",
    'sorcery',
    [],
    {
      spell: {
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'exileUntilCast', foundAtMost: 4, rest: 'bottomRandom' },
            {
              kind: 'createToken',
              token: { kind: 'preset', preset: 'Treasure' },
              count: { kind: 'shortfall', limit: 4, of: { kind: 'moved' } },
            },
          ],
        },
      },
    },
  ],
  [
    "When ~ enters, exile cards from the top of your library until you exile a nonland card. You may cast it without paying its mana cost if that spell's mana value is 3 or less. If you don't, put that card into your hand.",
    'enchantment',
    [],
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
          effect: { kind: 'exileUntilCast', castAtMost: 3, rest: 'stayExiled' },
        },
      ],
    },
  ],
  [
    "The owner of target creature shuffles it into their library, then reveals the top card of their library. If it's a creature card, they put it onto the battlefield.",
    'instant',
    [],
    {
      spell: {
        targets: [
          {
            id: 't1',
            what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
          },
        ],
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'moveToZone', objects: { kind: 'target', id: 't1' }, to: 'library' },
            { kind: 'shuffle', player: { kind: 'ownerOf', of: { kind: 'target', id: 't1' } } },
            {
              kind: 'revealTop',
              player: { kind: 'ownerOf', of: { kind: 'target', id: 't1' } },
              ifMatches: { types: ['creature'] },
              to: 'battlefield',
            },
          ],
        },
      },
    },
  ],
  [
    "At the beginning of your upkeep, look at the top card of your library. If it's a Dragon card, you may reveal it and put it into your hand.",
    'enchantment',
    [],
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'upkeep', whose: 'you' },
          effect: {
            kind: 'lookAtTop',
            count: 1,
            take: { filter: { subtypes: ['Dragon'] }, max: 1 },
            rest: 'top',
          },
        },
      ],
    },
  ],
  [
    'When ~ enters, you may behold an artifact. If you do, draw a card.',
    'creature',
    [],
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
          effect: {
            kind: 'sequence',
            effects: [
              { kind: 'may', effect: { kind: 'behold', filter: { types: ['artifact'] } } },
              {
                kind: 'conditional',
                condition: { kind: 'didPrevious' },
                effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
              },
            ],
          },
        },
      ],
    },
  ],
  [
    'When ~ dies, you may pay any amount of {G}. When you do, it deals that much damage to any target.',
    'creature',
    [],
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'dies', what: { kind: 'this' } },
          effect: {
            kind: 'payAnyAmount',
            symbol: 'G',
            reflexive: {
              targets: [{ id: 't1', what: { kind: 'anyTarget' } }],
              effect: {
                kind: 'dealDamage',
                amount: { kind: 'triggerDamage' },
                to: { kind: 'target', id: 't1' },
              },
            },
          },
        },
      ],
    },
  ],
  [
    '{T}: Add {G}. If that mana is spent on an Elf creature spell, it gains haste until end of turn.',
    'artifact',
    [],
    {
      abilities: [
        {
          kind: 'mana',
          cost: [{ kind: 'tap' }],
          production: { kind: 'fixed', mana: ['G'] },
          spentRider: { spells: { types: ['creature'], subtypes: ['Elf'] }, grants: 'haste' },
        },
      ],
    },
  ],
  [
    '{T}: Add one mana of any color. Spend this mana only to cast artifact spells or activate abilities of artifacts.',
    'artifact',
    [],
    {
      abilities: [
        {
          kind: 'mana',
          cost: [{ kind: 'tap' }],
          production: { kind: 'anyColor' },
          spendOnly: { types: ['artifact'], alsoAbilities: true },
        },
      ],
    },
  ],
  [
    "You don't lose unspent green mana as steps and phases end.",
    'creature',
    [],
    { abilities: [{ kind: 'static', static: { kind: 'unspentManaStays', colors: ['G'] } }] },
  ],
  [
    "You don't lose unspent mana as steps and phases end.",
    'enchantment',
    [],
    {
      abilities: [
        {
          kind: 'static',
          static: { kind: 'unspentManaStays', colors: ['W', 'U', 'B', 'R', 'G', 'C'] },
        },
      ],
    },
  ],
  [
    'You may cast artifact spells with mana value 3 or less from the top of your library.',
    'artifact',
    [],
    {
      abilities: [
        {
          kind: 'static',
          static: {
            kind: 'castFromTopOfLibrary',
            spells: { types: ['artifact'], manaValue: { cmp: 'atMost', value: 3 } },
          },
        },
      ],
    },
  ],
  [
    'You may cast spells from the top of your library.',
    'enchantment',
    [],
    { abilities: [{ kind: 'static', static: { kind: 'castFromTopOfLibrary', spells: {} } }] },
  ],
  [
    'As long as a creature entered the battlefield under your control this turn, ~ gets +1/+1.',
    'creature',
    [],
    {
      abilities: [
        {
          kind: 'static',
          static: { kind: 'modifyPt', subject: { kind: 'this' }, power: 1, toughness: 1 },
          condition: { kind: 'enteredThisTurn', count: 1, types: ['creature'] },
        },
      ],
    },
  ],
  [
    'As long as this card is in your graveyard, creatures you control get +1/+0.',
    'creature',
    [],
    {
      abilities: [
        {
          kind: 'static',
          static: {
            kind: 'modifyPt',
            subject: { kind: 'filter', filter: { types: ['creature'], controller: 'you' } },
            power: 1,
            toughness: 0,
          },
          functionsIn: 'graveyard',
        },
      ],
    },
  ],
  [
    'Whenever a Goblin you control enters, you may pay {1}. If you do, return this card from your graveyard to your hand.',
    'sorcery',
    [],
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'entersBattlefield', what: { subtypes: ['Goblin'], controller: 'you' } },
          effect: {
            kind: 'mayPay',
            cost: [{ kind: 'mana', symbols: ['1'] }],
            effect: { kind: 'moveToZone', objects: { kind: 'this' }, to: 'hand' },
          },
          functionsIn: 'graveyard',
        },
      ],
    },
  ],
  [
    'Whenever another creature you control attacks for the first time each turn, draw a card.',
    'creature',
    [],
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: {
            kind: 'attacks',
            what: { types: ['creature'], other: true, controller: 'you' },
            firstTimeEachTurn: true,
          },
          effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
        },
      ],
    },
  ],
  [
    "Whenever ~ attacks, if it's attacking the player with the most life or tied for most life, draw a card.",
    'creature',
    [],
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'attacks', what: { kind: 'this' } },
          effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
          interveningIf: { kind: 'attackingMostLife' },
        },
      ],
    },
  ],
  [
    'Whenever ~ attacks, if you attacked with creatures with total power 10 or greater this combat, draw a card.',
    'creature',
    [],
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'attacks', what: { kind: 'this' } },
          effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
          interveningIf: { kind: 'attackersTotalPower', atLeast: 10 },
        },
      ],
    },
  ],
  [
    'If an opponent was dealt 7 or more damage this turn, draw a card.',
    'sorcery',
    [],
    {
      spell: {
        effect: {
          kind: 'conditional',
          condition: { kind: 'playerDealtDamage', player: 'opponent', atLeast: 7 },
          effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
        },
      },
    },
  ],
  [
    'Draw a card if an opponent was dealt 3 or more damage this turn.',
    'sorcery',
    [],
    {
      spell: {
        effect: {
          kind: 'conditional',
          condition: { kind: 'playerDealtDamage', player: 'opponent', atLeast: 3 },
          effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
        },
      },
    },
  ],
  [
    '~ deals 3 damage to each other opponent.',
    'sorcery',
    [],
    { spell: { effect: { kind: 'dealDamage', amount: 3, to: { kind: 'eachOtherOpponent' } } } },
  ],
  [
    'Target creature you control deals damage equal to its power to each other creature.',
    'sorcery',
    [],
    {
      spell: {
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
            },
          },
        ],
        effect: {
          kind: 'dealDamage',
          amount: { kind: 'powerOf', of: { kind: 'target', id: 't1' } },
          to: {
            kind: 'each',
            filter: { zone: 'battlefield', types: ['creature'] },
            except: { kind: 'target', id: 't1' },
          },
          from: { kind: 'target', id: 't1' },
        },
      },
    },
  ],
  [
    'Whenever ~ attacks, ~ deals 2 damage to any target and 1 damage to each of up to three other targets.',
    'creature',
    [],
    {
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'attacks', what: { kind: 'this' } },
          targets: [
            { id: 't1', what: { kind: 'anyTarget' } },
            { id: 't2', what: { kind: 'anyTarget' }, min: 0, max: 3, differentFrom: 't1' },
          ],
          effect: {
            kind: 'sequence',
            effects: [
              { kind: 'dealDamage', amount: 2, to: { kind: 'target', id: 't1' } },
              { kind: 'dealDamage', amount: 1, to: { kind: 'target', id: 't2' } },
            ],
          },
        },
      ],
    },
  ],
  [
    'As ~ enters, choose Khans, Dragons, or Wolves.\n• Khans — At the beginning of your upkeep, draw a card.\n• Dragons — At the beginning of your end step, you gain 1 life.\n• Wolves — Whenever a creature you control dies, you gain 1 life.',
    'enchantment',
    [],
    {
      abilities: [
        {
          kind: 'replacement',
          replacement: {
            kind: 'asEntersChoose',
            what: 'option',
            options: ['Khans', 'Dragons', 'Wolves'],
          },
        },
        {
          kind: 'triggered',
          trigger: { kind: 'upkeep', whose: 'you' },
          effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
          triggerCondition: { kind: 'chosenOption', option: 'Khans' },
        },
        {
          kind: 'triggered',
          trigger: { kind: 'endStep', whose: 'you' },
          effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
          triggerCondition: { kind: 'chosenOption', option: 'Dragons' },
        },
        {
          kind: 'triggered',
          trigger: { kind: 'dies', what: { types: ['creature'], controller: 'you' } },
          effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
          triggerCondition: { kind: 'chosenOption', option: 'Wolves' },
        },
      ],
    },
  ],
  [
    'As ~ enters, you may have it become a copy of any artifact on the battlefield, except it has flying.',
    'artifact',
    [],
    {
      abilities: [
        {
          kind: 'replacement',
          replacement: {
            kind: 'entersAsCopy',
            what: { types: ['artifact'] },
            optional: true,
            duration: 'permanent',
            gains: [{ kind: 'flying' }],
          },
        },
      ],
    },
  ],
  [
    'Discard any number of cards, then draw that many cards.',
    'sorcery',
    [],
    {
      spell: {
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'discard', player: { kind: 'you' }, count: 0, anyNumber: true },
            {
              kind: 'draw',
              player: { kind: 'you' },
              count: { kind: 'thisWay', what: 'discarded' },
            },
          ],
        },
      },
    },
  ],
  [
    'Each Zombie you control enters with an additional +1/+1 counter on it.',
    'artifact',
    [],
    {
      abilities: [
        {
          kind: 'replacement',
          replacement: {
            kind: 'othersEnterWithCounters',
            what: { subtypes: ['Zombie'], controller: 'you' },
            counter: '+1/+1',
            count: 1,
          },
        },
      ],
    },
  ],
  [
    '~ gets +1/+1 as long as a creature entered the battlefield under your control this turn.',
    'creature',
    [],
    {
      abilities: [
        {
          kind: 'static',
          static: { kind: 'modifyPt', subject: { kind: 'this' }, power: 1, toughness: 1 },
          condition: { kind: 'enteredThisTurn', count: 1, types: ['creature'] },
        },
      ],
    },
  ],
  [
    "Choose one that hasn't been chosen this turn —\n• You gain 1 life.\n• Draw a card.",
    'sorcery',
    [],
    {
      spell: {
        modes: [
          {
            text: 'You gain 1 life.',
            effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
          },
          { text: 'Draw a card.', effect: { kind: 'draw', player: { kind: 'you' }, count: 1 } },
        ],
        chooseModes: { min: 1, max: 1, notRepeatedThisTurn: true },
      },
    },
  ],
];

describe('the siblings of the new rules read', () => {
  test.each(SIBLINGS)('%s', (text, type, subtypes, expected) => {
    const parsed = readAll(text, type, subtypes);
    const shape = JSON.parse(
      JSON.stringify({
        ...(parsed.abilities.length > 0 ? { abilities: parsed.abilities } : {}),
        ...(parsed.spell === null || parsed.spell === undefined ? {} : { spell: parsed.spell }),
      }),
    );
    expect(shape).toEqual(expected);
  });
});

// ---- Refusals: a line that says more or less than the rule reads is flagged, never half run

const REFUSED: readonly (readonly [string, FaceType, readonly string[], string])[] = [
  ['You may play that card this turn.', 'sorcery', [], 'notRunnable'],
  ['Exile the top two cards of your library. You may play them.', 'sorcery', [], 'unrecognised'],
  [
    "If the discovered card's mana value is less than 4, create a number of tapped Treasure tokens equal to the difference.",
    'sorcery',
    [],
    'notRunnable',
  ],
  [
    '{T}: Add {C}. Spend this mana only to cast Dragon spells or activate abilities of Elves.',
    'artifact',
    [],
    'unrecognised',
  ],
  ['Add three mana in any combination of colors.', 'sorcery', [], 'notRunnable'],
];

describe('the lines the new rules must not read are flagged', () => {
  test.each(REFUSED)('%s', (text, type, subtypes, reason) => {
    expect(drop(text, type, subtypes).reason).toBe(reason);
  });
});
