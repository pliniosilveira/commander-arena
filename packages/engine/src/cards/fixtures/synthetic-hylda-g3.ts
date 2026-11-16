/**
 * SYNTHETIC CARDS FOR GROUP 3 OF THE HYLDA DECK (issue 42). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of what the real cards of the group need from the engine, written out by hand (the cards package checks that the grammar lowers the real Oracle text to
 * these same nodes, apart from the text of the modes): a sorcery that draws for each tapped creature a target opponent controls, a creature with X in its cost that draws X cards
 * as it enters and taps something when its controller casts a blue spell, a creature that fetches a basic land when an opponent has more lands, a creature that shuffles itself and
 * a creature with a stun counter into their owners' libraries, a Tiered sorcery-speed destruction of tapped creatures (one target, any number of targets with different controllers,
 * all), a creature with a modal trigger of noncreature spells, an enchantment with a modal landfall trigger that may tap or untap, an instant with two named modes and an instant that
 * protects a player and their permanents. Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the
 * definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const YOU = { kind: 'you' } as const;
const THIS = { kind: 'this' } as const;

export const SYNTHETIC_HYLDA_G3_LIST: readonly CardDefinition[] = [
  // "Draw a card for each tapped creature target opponent controls."
  singleFace({
    name: 'SYNTHETIC Dream Raider',
    manaCost: ['2', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Draw a card for each tapped creature target opponent controls.',
    spell: {
      targets: [{ id: 't1', what: { kind: 'player', filter: 'opponent' } }],
      effect: {
        kind: 'draw',
        player: YOU,
        count: {
          kind: 'countOf',
          filter: {
            types: ['creature'],
            tapped: true,
            controlledBy: { kind: 'target', id: 't1' },
          },
        },
      },
    },
  }),
  // "When this creature enters, draw X cards.
  //  Whenever you cast a blue spell, tap target nonland permanent an opponent controls."
  singleFace({
    name: 'SYNTHETIC Mana Scholar',
    manaCost: ['X', 'U', 'U', 'U'],
    supertypes: ['legendary'],
    types: ['creature'],
    subtypes: ['Human', 'Wizard'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 3,
    toughness: 3,
    oracleText:
      'When this creature enters, draw X cards.\nWhenever you cast a blue spell, tap target nonland permanent an opponent controls.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: THIS },
        effect: { kind: 'draw', player: YOU, count: { kind: 'enteredX' } },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'castSpell', filter: { colors: ['U'], stackKind: 'spell' }, by: 'you' },
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: { zone: 'battlefield', notTypes: ['land'], controller: 'opponent' },
            },
          },
        ],
        effect: { kind: 'tap', objects: { kind: 'target', id: 't1' } },
      },
    ],
  }),
  // "Vigilance
  //  When this creature enters, if an opponent controls more lands than you, search your library for a basic Plains card, put it onto the battlefield tapped, then shuffle."
  singleFace({
    name: 'SYNTHETIC Landless Hound',
    manaCost: ['1', 'W'],
    types: ['creature'],
    subtypes: ['Dog'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 3,
    toughness: 1,
    oracleText:
      'Vigilance\nWhen this creature enters, if an opponent controls more lands than you, search your library for a basic Plains card, put it onto the battlefield tapped, then shuffle.',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'vigilance' } },
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: THIS },
        effect: {
          kind: 'search',
          player: YOU,
          filter: { supertypes: ['basic'], subtypes: ['Plains'] },
          max: 1,
          destinations: [{ zone: 'battlefield', tapped: true, count: 1 }],
          reveal: false,
          shuffle: true,
        },
        interveningIf: {
          kind: 'amountIs',
          amount: { kind: 'opponentsWithMore', stat: 'lands' },
          compare: { cmp: 'atLeast', value: 1 },
        },
      },
    ],
  }),
  // "Flash
  //  Vigilance
  //  When this creature enters, tap target creature an opponent controls and put a stun counter on it.
  //  {1}{U}, {T}: Shuffle this creature and target creature with a stun counter on it into their owners' libraries."
  singleFace({
    name: 'SYNTHETIC Tide Shuffler',
    manaCost: ['1', 'U'],
    types: ['creature'],
    subtypes: ['Merfolk'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 2,
    toughness: 1,
    oracleText:
      "Flash\nVigilance\nWhen this creature enters, tap target creature an opponent controls and put a stun counter on it.\n{1}{U}, {T}: Shuffle this creature and target creature with a stun counter on it into their owners' libraries.",
    abilities: [
      { kind: 'keyword', keyword: { kind: 'flash' } },
      { kind: 'keyword', keyword: { kind: 'vigilance' } },
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: THIS },
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: { zone: 'battlefield', types: ['creature'], controller: 'opponent' },
            },
          },
        ],
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'tap', objects: { kind: 'target', id: 't1' } },
            {
              kind: 'addCounters',
              objects: { kind: 'target', id: 't1' },
              counter: 'stun',
              count: 1,
            },
          ],
        },
      },
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['1', 'U'] }, { kind: 'tap' }],
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: { zone: 'battlefield', types: ['creature'], hasCounter: 'stun' },
            },
          },
        ],
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'moveToZone', objects: THIS, to: 'library' },
            { kind: 'moveToZone', objects: { kind: 'target', id: 't1' }, to: 'library' },
            {
              kind: 'shuffle',
              player: {
                kind: 'all',
                of: [
                  { kind: 'ownerOf', of: THIS },
                  { kind: 'ownerOf', of: { kind: 'target', id: 't1' } },
                ],
              },
            },
          ],
        },
      },
    ],
  }),
  // "Tiered
  //  • Cross-Slash — {0} — Destroy target tapped creature.
  //  • Blade Beam — {1} — Destroy any number of target tapped creatures with different controllers.
  //  • Omnislash — {3}{W} — Destroy all tapped creatures."
  singleFace({
    name: 'SYNTHETIC Tiered Smiter',
    manaCost: ['1', 'W'],
    types: ['instant'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText:
      'Tiered\n• Cross-Slash — {0} — Destroy target tapped creature.\n• Blade Beam — {1} — Destroy any number of target tapped creatures with different controllers.\n• Omnislash — {3}{W} — Destroy all tapped creatures.',
    spell: {
      modes: [
        {
          text: 'Cross-Slash — {0} — Destroy target tapped creature.',
          cost: [{ kind: 'mana', symbols: ['0'] }],
          targets: [
            {
              id: 't1',
              what: {
                kind: 'object',
                filter: { zone: 'battlefield', types: ['creature'], tapped: true },
              },
            },
          ],
          effect: { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
        },
        {
          text: 'Blade Beam — {1} — Destroy any number of target tapped creatures with different controllers.',
          cost: [{ kind: 'mana', symbols: ['1'] }],
          targets: [
            {
              id: 't2',
              what: {
                kind: 'object',
                filter: { zone: 'battlefield', types: ['creature'], tapped: true },
              },
              anyNumber: true,
              differentControllers: true,
            },
          ],
          effect: { kind: 'destroy', objects: { kind: 'target', id: 't2' } },
        },
        {
          text: 'Omnislash — {3}{W} — Destroy all tapped creatures.',
          cost: [{ kind: 'mana', symbols: ['3', 'W'] }],
          effect: {
            kind: 'destroy',
            objects: {
              kind: 'each',
              filter: { zone: 'battlefield', types: ['creature'], tapped: true },
            },
          },
        },
      ],
      chooseModes: { min: 1, max: 1 },
    },
  }),
  // "Whenever you cast a noncreature spell, choose one —
  //  • Tap target creature.
  //  • This creature gains first strike and lifelink until end of turn.
  //  • Exile this creature, then return it to the battlefield tapped under its owner's control."
  singleFace({
    name: 'SYNTHETIC Spellcast Monk',
    manaCost: ['2', 'W', 'W'],
    types: ['creature'],
    subtypes: ['Human', 'Monk'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 4,
    toughness: 4,
    oracleText:
      'Whenever you cast a noncreature spell, choose one —\n• Tap target creature.\n• This creature gains first strike and lifelink until end of turn.\n• Exile this creature, then return it to the battlefield tapped under its owner\'s control.',
    abilities: [
      {
        kind: 'triggered',
        trigger: {
          kind: 'castSpell',
          filter: { notTypes: ['creature'], stackKind: 'spell' },
          by: 'you',
        },
        effect: { kind: 'sequence', effects: [] },
        modes: [
          {
            text: 'Tap target creature.',
            targets: [
              {
                id: 't1',
                what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
              },
            ],
            effect: { kind: 'tap', objects: { kind: 'target', id: 't1' } },
          },
          {
            text: 'This creature gains first strike and lifelink until end of turn.',
            effect: {
              kind: 'sequence',
              effects: [
                {
                  kind: 'grantKeyword',
                  objects: THIS,
                  keyword: { kind: 'firstStrike' },
                  duration: 'untilEndOfTurn',
                },
                {
                  kind: 'grantKeyword',
                  objects: THIS,
                  keyword: { kind: 'lifelink' },
                  duration: 'untilEndOfTurn',
                },
              ],
            },
          },
          {
            text: "Exile this creature, then return it to the battlefield tapped under its owner's control.",
            effect: {
              kind: 'sequence',
              effects: [
                { kind: 'exile', objects: THIS },
                {
                  kind: 'moveToZone',
                  objects: { kind: 'moved' },
                  to: 'battlefield',
                  tapped: true,
                  controller: 'owner',
                },
              ],
            },
          },
        ],
        chooseModes: { min: 1, max: 1 },
      },
    ],
  }),
  // "Landfall — Whenever a land you control enters, choose one —
  //  • You may tap or untap target creature.
  //  • Scry 1."
  singleFace({
    name: 'SYNTHETIC Tide Keeper',
    manaCost: ['2', 'U'],
    types: ['enchantment'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText:
      'Landfall — Whenever a land you control enters, choose one —\n• You may tap or untap target creature.\n• Scry 1.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'landfall' },
        effect: { kind: 'sequence', effects: [] },
        modes: [
          {
            text: 'You may tap or untap target creature.',
            targets: [
              {
                id: 't1',
                what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
              },
            ],
            effect: {
              kind: 'chooseOne',
              options: [
                { label: 'Tap it', effect: { kind: 'tap', objects: { kind: 'target', id: 't1' } } },
                {
                  label: 'Untap it',
                  effect: { kind: 'untap', objects: { kind: 'target', id: 't1' } },
                },
              ],
              optional: true,
            },
          },
          { text: 'Scry 1.', effect: { kind: 'scry', count: 1 } },
        ],
        chooseModes: { min: 1, max: 1 },
      },
    ],
  }),
  // "Choose one —
  //  • Distract the Guard — Tap target creature.
  //  • Hide — Target creature you control gains hexproof until end of turn."
  singleFace({
    name: 'SYNTHETIC Sentry Slip',
    manaCost: ['U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText:
      'Choose one —\n• Distract the Guard — Tap target creature.\n• Hide — Target creature you control gains hexproof until end of turn.',
    spell: {
      modes: [
        {
          text: 'Distract the Guard — Tap target creature.',
          targets: [
            {
              id: 't1',
              what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
            },
          ],
          effect: { kind: 'tap', objects: { kind: 'target', id: 't1' } },
        },
        {
          text: 'Hide — Target creature you control gains hexproof until end of turn.',
          targets: [
            {
              id: 't2',
              what: {
                kind: 'object',
                filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
              },
            },
          ],
          effect: {
            kind: 'grantKeyword',
            objects: { kind: 'target', id: 't2' },
            keyword: { kind: 'hexproof' },
            duration: 'untilEndOfTurn',
          },
        },
      ],
      chooseModes: { min: 1, max: 1 },
    },
  }),
  // "You and permanents you control gain hexproof until end of turn. Prevent all damage that black and/or red sources would deal to creatures you control this turn."
  singleFace({
    name: 'SYNTHETIC Warding Prayer',
    manaCost: ['W'],
    types: ['instant'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText:
      'You and permanents you control gain hexproof until end of turn. Prevent all damage that black and/or red sources would deal to creatures you control this turn.',
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'grantPlayerHexproof', player: YOU, duration: 'untilEndOfTurn' },
          {
            kind: 'grantKeyword',
            objects: { kind: 'each', filter: { zone: 'battlefield', controller: 'you' } },
            keyword: { kind: 'hexproof' },
            duration: 'untilEndOfTurn',
          },
          {
            kind: 'preventDamage',
            scope: 'all',
            amount: 'all',
            duration: 'untilEndOfTurn',
            to: { kind: 'each', filter: { types: ['creature'], controller: 'you' } },
            byFilter: { anyOf: [{ colors: ['B'] }, { colors: ['R'] }] },
          },
        ],
      },
    },
  }),
];
