/**
 * SYNTHETIC CARDS FOR CASTING FROM THE TOP OF THE LIBRARY. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-151 (the Dragons slice): "You may look at the top card of your library any time. You may cast creature spells with
 * power 4 or greater from the top of your library. If you cast a creature spell this way, it gains haste until end of turn." (`castFromTopOfLibrary`
 * with `gainsHaste`), the same without the haste, and the creatures it is tried on. Names start with "SYNTHETIC "; oracleId is null. The text describes
 * what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { kw, singleFace } from './helpers';

export const SYNTHETIC_DRAGONS_LIBRARY_LIST: readonly CardDefinition[] = [
  // "Flying. You may look at the top card of your library any time. You may cast creature spells with power 4 or greater from the top of your
  //  library. If you cast a creature spell this way, it gains haste until end of turn."
  singleFace({
    name: 'SYNTHETIC Seer Drake',
    manaCost: ['3', 'R'],
    types: ['creature'],
    subtypes: ['Dragon'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 4,
    toughness: 4,
    oracleText:
      'Flying. You may look at the top card of your library any time. You may cast creature spells with power 4 or greater from the top of your library. If you cast a creature spell this way, it gains haste until end of turn.',
    abilities: [
      kw('flying'),
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
  }),
  // "You may cast artifact spells from the top of your library." (no haste, any artifact)
  singleFace({
    name: 'SYNTHETIC Artifact Oracle',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: 'You may cast artifact spells from the top of your library.',
    abilities: [
      {
        kind: 'static',
        static: { kind: 'castFromTopOfLibrary', spells: { types: ['artifact'] } },
      },
    ],
  }),
  // "Flying" (a big Dragon with nothing else on it)
  singleFace({
    name: 'SYNTHETIC Big Plain Drake',
    manaCost: ['3', 'R', 'R'],
    types: ['creature'],
    subtypes: ['Dragon'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 5,
    toughness: 5,
    oracleText: 'Flying.',
    abilities: [kw('flying')],
  }),
  // "You may cast artifact spells from the top of your library. If you cast a creature spell this way, it gains haste until end of turn."
  // (the haste is for a creature spell, and an artifact that is not a creature gets none)
  singleFace({
    name: 'SYNTHETIC Hasty Artifact Oracle',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      'You may cast artifact spells from the top of your library. If you cast a creature spell this way, it gains haste until end of turn.',
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'castFromTopOfLibrary',
          spells: { types: ['artifact'] },
          gainsHaste: true,
        },
      },
    ],
  }),
];
