/**
 * SYNTHETIC CARDS FOR THE GRAND LARCENY DECK, GROUP D1. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of: "can't be blocked except by creatures with flying" (`cantBeBlockedBy` with blockers that do not have flying, CR 509.1b). Names start with "SYNTHETIC ";
 * oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

export const SYNTHETIC_D1_LIST: readonly CardDefinition[] = [
  // "This creature can't be blocked except by creatures with flying."
  singleFace({
    name: 'SYNTHETIC Skyward Sneak',
    manaCost: ['1', 'G'],
    types: ['creature'],
    subtypes: ['Elf'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 2,
    toughness: 2,
    oracleText: "This creature can't be blocked except by creatures with flying.",
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'cantBeBlockedBy',
          subject: { kind: 'this' },
          blockers: { types: ['creature'], notKeywords: ['flying'] },
        },
      },
    ],
  }),
  // "Whenever an opponent casts a spell from anywhere other than their hand, draw a card."
  singleFace({
    name: 'SYNTHETIC Foreign Cast Watcher',
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      'Whenever an opponent casts a spell from anywhere other than their hand, draw a card.',
    abilities: [
      {
        kind: 'triggered',
        trigger: {
          kind: 'castSpell',
          filter: { stackKind: 'spell', notCastFromHand: true },
          by: 'opponent',
        },
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
      },
    ],
  }),
  // "When this creature enters, search your library and/or graveyard for a card named Grizzly Bears, reveal it, and put it into your hand. If you search your library this way, shuffle."
  singleFace({
    name: 'SYNTHETIC Bear Finder',
    manaCost: ['2', 'G'],
    types: ['creature'],
    subtypes: ['Snake'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 1,
    toughness: 1,
    oracleText:
      'When this creature enters, search your library and/or graveyard for a card named Grizzly Bears, reveal it, and put it into your hand. If you search your library this way, shuffle.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'search',
              player: { kind: 'you' },
              filter: { named: 'Grizzly Bears' },
              max: 1,
              zones: ['library', 'graveyard'],
              destinations: [{ zone: 'hand', count: 1 }],
              reveal: true,
              shuffle: false,
            },
            {
              kind: 'conditional',
              condition: { kind: 'thisWayAtLeast', what: 'searched', count: 1 },
              effect: { kind: 'shuffle', player: { kind: 'you' } },
            },
          ],
        },
      },
    ],
  }),
  // "Whenever this creature deals combat damage to a player, destroy target nonland permanent of that player's choice that one of your opponents controls."
  singleFace({
    name: 'SYNTHETIC Choosing Griffin',
    manaCost: ['4'],
    types: ['artifact', 'creature'],
    subtypes: ['Griffin'],
    colors: [],
    colorIdentity: [],
    power: 3,
    toughness: 3,
    oracleText:
      "Whenever this creature deals combat damage to a player, destroy target nonland permanent of that player's choice that one of your opponents controls.",
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'dealsCombatDamage', what: { kind: 'this' }, to: 'player' },
        targets: [
          {
            id: 't1',
            chosenBy: 'triggerPlayer',
            what: {
              kind: 'object',
              filter: { zone: 'battlefield', notTypes: ['land'], controller: 'opponent' },
            },
          },
        ],
        effect: { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
      },
    ],
  }),
  // "Kicker {X}. X can't be 0. Flying. When this creature enters, if it was kicked, gain control of target artifact with mana value X or less. If that artifact is an Equipment, attach it to this creature."
  singleFace({
    name: 'SYNTHETIC Kicked Magpie',
    manaCost: ['1', 'U'],
    types: ['creature'],
    subtypes: ['Bird'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 2,
    toughness: 1,
    oracleText:
      "Kicker {X}. X can't be 0. Flying. When this creature enters, if it was kicked, gain control of target artifact with mana value X or less. If that artifact is an Equipment, attach it to this creature.",
    abilities: [
      {
        kind: 'keyword',
        keyword: { kind: 'kicker', cost: [{ kind: 'mana', symbols: ['X'] }], xNotZero: true },
      },
      { kind: 'keyword', keyword: { kind: 'flying' } },
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        interveningIf: { kind: 'kicked' },
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: {
                zone: 'battlefield',
                types: ['artifact'],
                manaValueAtMost: { kind: 'enteredX' },
              },
            },
          },
        ],
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'gainControl',
              objects: { kind: 'target', id: 't1' },
              duration: 'permanent',
            },
            {
              kind: 'conditional',
              condition: {
                kind: 'objectMatches',
                of: { kind: 'target', id: 't1' },
                filter: { subtypes: ['Equipment'] },
              },
              effect: {
                kind: 'attach',
                object: { kind: 'target', id: 't1' },
                to: { kind: 'this' },
              },
            },
          ],
        },
      },
    ],
  }),
  // "Flash. Flying. When this creature enters, exile target spell an opponent controls. Whenever this creature attacks, if a card is exiled with it, you may cast the exiled card without paying its mana cost."
  singleFace({
    name: 'SYNTHETIC Spell Hijacker',
    manaCost: ['2', 'U'],
    types: ['creature'],
    subtypes: ['Djinn'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 3,
    toughness: 3,
    oracleText:
      'Flash\nFlying\nWhen this creature enters, exile target spell an opponent controls.\nWhenever this creature attacks, if a card is exiled with it, you may cast the exiled card without paying its mana cost.',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'flash' } },
      { kind: 'keyword', keyword: { kind: 'flying' } },
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: { zone: 'stack', controller: 'opponent', stackKind: 'spell' },
            },
          },
        ],
        effect: { kind: 'exile', objects: { kind: 'target', id: 't1' }, linked: true },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'attacks', what: { kind: 'this' } },
        interveningIf: {
          kind: 'amountIs',
          amount: { kind: 'countOf', filter: { zone: 'exile', exiledWithSource: true } },
          compare: { cmp: 'atLeast', value: 1 },
        },
        effect: { kind: 'castFree', objects: { kind: 'linkedExile' } },
      },
    ],
  }),
  // An Equipment of mana value 2: "Equip {1}".
  singleFace({
    name: 'SYNTHETIC Plain Blade',
    manaCost: ['2'],
    types: ['artifact'],
    subtypes: ['Equipment'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Equip {1}',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'equip', cost: [{ kind: 'mana', symbols: ['1'] }] } },
    ],
  }),
  // An artifact of mana value 4, out of reach of a small X.
  singleFace({
    name: 'SYNTHETIC Heavy Idol',
    manaCost: ['4'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: '',
  }),
  // "Reach"
  singleFace({
    name: 'SYNTHETIC Reach Spider',
    manaCost: ['2', 'G'],
    types: ['creature'],
    subtypes: ['Spider'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 1,
    toughness: 3,
    oracleText: 'Reach',
    abilities: [{ kind: 'keyword', keyword: { kind: 'reach' } }],
  }),
];
