/**
 * SYNTHETIC CARDS FOR A SEARCH THAT FINDS CARDS WHICH SHARE A TYPE. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-257 and D-258 (the Bruna deck). The wording of a real card, the name replaced: "Whenever equipped creature dies, you may reveal
 * cards from the top of your library until you reveal a creature card that shares a creature type with it. Put that card into your hand and the rest on the
 * bottom of your library in a random order." and "{2}, {T}, Sacrifice this land: Search your library for up to two basic land cards that share a land type, put
 * them onto the battlefield tapped, then shuffle.", with the creatures and lands they look for. Names start with "SYNTHETIC "; oracleId is null. The text
 * describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const creature = (name: string, subtypes: readonly string[], power: number, toughness: number) =>
  singleFace({
    name,
    manaCost: ['1'],
    types: ['creature'],
    subtypes,
    colors: [],
    colorIdentity: [],
    power,
    toughness,
    oracleText: '',
  });

export const SYNTHETIC_BRUNA_SEARCH_LIST: readonly CardDefinition[] = [
  // "Whenever equipped creature dies, you may reveal cards from the top of your library until you reveal a creature card that shares a creature type with it.
  //  Put that card into your hand and the rest on the bottom of your library in a random order. Equip {1}"
  singleFace({
    name: 'SYNTHETIC Echo Blade',
    manaCost: ['3'],
    types: ['artifact'],
    subtypes: ['Equipment'],
    colors: [],
    colorIdentity: [],
    oracleText:
      'Whenever equipped creature dies, you may reveal cards from the top of your library until you reveal a creature card that shares a creature type with it. Put that card into your hand and the rest on the bottom of your library in a random order.\nEquip {1}',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'dies', what: { kind: 'attached' } },
        optional: true,
        effect: {
          kind: 'revealUntil',
          filter: { types: ['creature'], sharesCreatureTypeWith: 'triggerSubject' },
          put: 'hand',
        },
      },
      {
        kind: 'keyword',
        keyword: { kind: 'equip', cost: [{ kind: 'mana', symbols: ['1'] }] },
      },
    ],
  }),
  // "This land enters tapped. {T}: Add {C}. {2}, {T}, Sacrifice this land: Search your library for up to two basic land cards that share a land type, put them onto
  //  the battlefield tapped, then shuffle."
  singleFace({
    name: 'SYNTHETIC Twin Landscape',
    manaCost: null,
    types: ['land'],
    colors: [],
    colorIdentity: [],
    oracleText:
      'This land enters tapped.\n{T}: Add {C}.\n{2}, {T}, Sacrifice this land: Search your library for up to two basic land cards that share a land type, put them onto the battlefield tapped, then shuffle.',
    abilities: [
      { kind: 'replacement', replacement: { kind: 'entersTapped' } },
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production: { kind: 'fixed', mana: ['C'] },
      },
      {
        kind: 'activated',
        cost: [
          { kind: 'mana', symbols: ['2'] },
          { kind: 'tap' },
          { kind: 'sacrifice', what: { kind: 'this' } },
        ],
        effect: {
          kind: 'search',
          player: { kind: 'you' },
          filter: { types: ['land'], supertypes: ['basic'] },
          max: 2,
          sharedLandType: true,
          destinations: [{ zone: 'battlefield', tapped: true, count: 2 }],
          reveal: false,
          shuffle: true,
        },
      },
    ],
  }),
  // A basic land with two land types, for the cards that share one of them: Swamp and Forest.
  singleFace({
    name: 'SYNTHETIC Bog Forest',
    manaCost: null,
    supertypes: ['basic'],
    types: ['land'],
    subtypes: ['Swamp', 'Forest'],
    colors: [],
    colorIdentity: ['B', 'G'],
    oracleText: '({T}: Add {B} or {G}.)',
    abilities: [],
  }),
  creature('SYNTHETIC Goblin Knight', ['Goblin', 'Knight'], 2, 2),
  creature('SYNTHETIC Goblin Scout', ['Goblin', 'Scout'], 1, 1),
  creature('SYNTHETIC Human Knight', ['Human', 'Knight'], 2, 1),
  creature('SYNTHETIC Lone Wizard', ['Wizard'], 1, 1),
];
