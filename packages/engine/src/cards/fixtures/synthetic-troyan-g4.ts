/**
 * SYNTHETIC CARDS OF GROUP 4 OF THE TROYAN DECK. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of "Whenever you cast your first spell each turn, reveal the top card of your library. You may cast it without paying its mana cost if it's a
 * spell with lesser mana value. If you don't cast it, put it into your hand" (`revealTopCast`, CR 701.20a, 608.2g) and of the permission to cast one spell of each
 * nonland card type from among exiled cards this turn without paying their mana costs (`mayCastEachType`, CR 601.2, 118.9). Names start with "SYNTHETIC "; oracleId is
 * null. The text describes what the AST does; it is not Oracle text.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

export const SYNTHETIC_TROYAN_G4_LIST: readonly CardDefinition[] = [
  // "Whenever you cast your first spell each turn, reveal the top card of your library. You may cast it without paying its mana cost if it's a spell with lesser
  //  mana value. If you don't cast it, put it into your hand."
  singleFace({
    name: 'SYNTHETIC First Spell Crafter',
    manaCost: ['2', 'G', 'U'],
    supertypes: ['legendary'],
    types: ['creature'],
    subtypes: ['Elf', 'Druid'],
    colors: ['U', 'G'],
    colorIdentity: ['U', 'G'],
    power: 2,
    toughness: 3,
    oracleText:
      "Whenever you cast your first spell each turn, reveal the top card of your library. You may cast it without paying its mana cost if it's a spell with lesser mana value. If you don't cast it, put it into your hand.",
    abilities: [
      {
        kind: 'triggered',
        trigger: {
          kind: 'castSpell',
          filter: { stackKind: 'spell' },
          by: 'you',
          nth: 1,
        },
        effect: {
          kind: 'revealTopCast',
          manaValueBelow: { kind: 'manaValueOf', of: { kind: 'triggerSubject' } },
        },
      },
    ],
  }),
  // "Exile the top eight cards of your library. You may put a land card from among them onto the battlefield. Until end of turn, for each nonland card type, you may cast a
  //  spell of that type from among the exiled cards without paying its mana cost." (the land is put first in the text; it is the same, the permissions name the exiled cards)
  singleFace({
    name: 'SYNTHETIC Types Augury',
    manaCost: ['4', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText:
      'Exile the top eight cards of your library. You may put a land card from among them onto the battlefield. Until end of turn, for each nonland card type, you may cast a spell of that type from among the exiled cards without paying its mana cost.',
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'exileTop', count: 8 },
          { kind: 'mayCastEachType', objects: { kind: 'moved' }, lasts: 'endOfTurn' },
          {
            kind: 'moveToZone',
            objects: {
              kind: 'choose',
              filter: { types: ['land'], zone: 'exile', controller: 'you' },
              optional: true,
              fromMoved: true,
            },
            to: 'battlefield',
          },
        ],
      },
    },
  }),
  // A creature that is also an artifact, to be cast as either type.
  singleFace({
    name: 'SYNTHETIC Types Golem',
    manaCost: ['3'],
    types: ['artifact', 'creature'],
    subtypes: ['Golem'],
    colors: [],
    colorIdentity: [],
    power: 2,
    toughness: 2,
    oracleText: '',
  }),
  singleFace({
    name: 'SYNTHETIC Plain Trinket',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: '',
  }),
];
