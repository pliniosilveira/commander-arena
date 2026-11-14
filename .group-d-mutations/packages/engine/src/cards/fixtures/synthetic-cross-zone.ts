/**
 * SYNTHETIC CARDS FOR A TARGET SLOT OF TWO ZONES AND A LINKED EXILE THAT RETURNS EVERY CARD TO ITS OWNER'S HAND. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-270 (the Bruna deck). The wording of a real card, the name replaced: "When this creature enters, you may exile up to three
 * other target creatures from the battlefield and/or creature cards from graveyards. When this creature leaves the battlefield, return the exiled cards to their
 * owners' hands.", with a variant that is not optional and a variant that only takes creature cards of graveyards for its second half. Names start with
 * "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { kw, singleFace } from './helpers';

const T1 = { kind: 'target', id: 't1' } as const;

export const SYNTHETIC_CROSS_ZONE_LIST: readonly CardDefinition[] = [
  // "Flying. When this creature enters, you may exile up to three other target creatures from the battlefield and/or creature cards from graveyards.
  //  When this creature leaves the battlefield, return the exiled cards to their owners' hands."
  singleFace({
    name: 'SYNTHETIC Linked Banisher',
    manaCost: ['6'],
    types: ['creature'],
    subtypes: ['Angel'],
    colors: [],
    colorIdentity: [],
    power: 5,
    toughness: 6,
    oracleText:
      "Flying\nWhen this creature enters, you may exile up to three other target creatures from the battlefield and/or creature cards from graveyards.\nWhen this creature leaves the battlefield, return the exiled cards to their owners' hands.",
    abilities: [
      kw('flying'),
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        optional: true,
        targets: [
          {
            id: 't1',
            what: {
              kind: 'objectOrGraveyardCard',
              filter: { types: ['creature'], other: true },
              card: { zone: 'graveyard', types: ['creature'] },
            },
            min: 0,
            max: 3,
          },
        ],
        effect: { kind: 'exile', objects: T1, linked: true },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'leavesBattlefield', what: { kind: 'this' } },
        effect: { kind: 'moveToZone', objects: { kind: 'linkedExile' }, to: 'hand' },
      },
    ],
  }),
  // The same, with no "you may" and exactly one target of either zone: "When this creature enters, exile target creature from the battlefield or a creature
  // card from a graveyard. When this creature leaves the battlefield, return the exiled cards to their owners' hands."
  singleFace({
    name: 'SYNTHETIC Mandatory Banisher',
    manaCost: ['4'],
    types: ['creature'],
    subtypes: ['Angel'],
    colors: [],
    colorIdentity: [],
    power: 2,
    toughness: 2,
    oracleText:
      "When this creature enters, exile target creature from the battlefield or a creature card from a graveyard.\nWhen this creature leaves the battlefield, return the exiled cards to their owners' hands.",
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        targets: [
          {
            id: 't1',
            what: {
              kind: 'objectOrGraveyardCard',
              filter: { types: ['creature'], other: true },
              card: { zone: 'graveyard', types: ['creature'] },
            },
          },
        ],
        effect: { kind: 'exile', objects: T1, linked: true },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'leavesBattlefield', what: { kind: 'this' } },
        effect: { kind: 'moveToZone', objects: { kind: 'linkedExile' }, to: 'hand' },
      },
    ],
  }),
];
