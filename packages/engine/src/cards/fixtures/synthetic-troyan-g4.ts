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
    colors: ['G', 'U'],
    colorIdentity: ['G', 'U'],
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
];
