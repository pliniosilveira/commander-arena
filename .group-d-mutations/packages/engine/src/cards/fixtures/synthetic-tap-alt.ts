/**
 * SYNTHETIC CARDS FOR AN ALTERNATIVE COST THAT TAPS CREATURES AND A GRANT TO "CREATURES WITH FLYING". NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-149 (the Angels slice): "You may pay {W} and tap four untapped creatures you control with flying rather
 * than pay this spell's mana cost" (`alternativeCosts` kind `tapPermanents`) and "Other creatures you control with flying have
 * indestructible" (a `grantKeyword` whose subject names a keyword, read after the effects that give keywords, CR 613.8a). Names start
 * with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the
 * definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { kw, singleFace } from './helpers';

const FLYER = { types: ['creature'], keywords: ['flying'] } as const;

export const SYNTHETIC_TAP_ALT_LIST: readonly CardDefinition[] = [
  // "You may pay {W} and tap four untapped creatures you control with flying rather than pay this spell's mana cost.
  //  Flying, lifelink. Other creatures you control with flying have indestructible."
  singleFace({
    name: 'SYNTHETIC Sky Blade Angel',
    manaCost: ['4', 'W', 'W', 'W'],
    supertypes: ['legendary'],
    types: ['creature'],
    subtypes: ['Angel'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 7,
    toughness: 7,
    oracleText:
      "You may pay {W} and tap four untapped creatures you control with flying rather than pay this spell's mana cost. Flying, lifelink. Other creatures you control with flying have indestructible.",
    alternativeCosts: [
      {
        kind: 'tapPermanents',
        cost: [{ kind: 'mana', symbols: ['W'] }],
        filter: FLYER,
        count: 4,
      },
    ],
    abilities: [
      kw('flying'),
      kw('lifelink'),
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: { kind: 'filter', filter: { ...FLYER, controller: 'you' }, other: true },
          keyword: { kind: 'indestructible' },
        },
      },
    ],
  }),
  // "Flying. {T}: Add {W}." A flier that is also a mana source, to see the payment leave the creatures the cost taps.
  singleFace({
    name: 'SYNTHETIC Mana Bird',
    manaCost: ['W'],
    types: ['creature'],
    subtypes: ['Bird'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 0,
    toughness: 1,
    oracleText: 'Flying. {T}: Add {W}.',
    abilities: [
      kw('flying'),
      { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['W'] } },
    ],
  }),
  // "Creatures you control without flying have flying." Reads the keyword the target lacks.
  singleFace({
    name: 'SYNTHETIC Wind Caller',
    manaCost: ['2', 'W'],
    types: ['creature'],
    subtypes: ['Human', 'Wizard'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 2,
    toughness: 2,
    oracleText: 'Creatures you control without flying have flying.',
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: {
            kind: 'filter',
            filter: { types: ['creature'], controller: 'you', notKeywords: ['flying'] },
          },
          keyword: { kind: 'flying' },
        },
      },
    ],
  }),
];
