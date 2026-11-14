/**
 * SYNTHETIC CARDS FOR MANA THAT CAN BE SPENT ONLY ON SOME SPELLS AND FOR MANA OF A CHOSEN COLOR. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-149 (the Angels slice): "{T}: Add {W}. Spend this mana only to cast an Angel spell." (with the other lines of
 * a commander that makes Angels grow), the same with card types, "As this artifact enters, choose a color. Creatures you control of the
 * chosen color get +1/+0. {T}: Add one mana of the chosen color.", and an artifact with an ability that costs mana to try the restriction
 * against an ability. Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none
 * of these is the definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { kw, singleFace } from './helpers';

export const SYNTHETIC_MANA_RESTRICTED_LIST: readonly CardDefinition[] = [
  // "Flying, vigilance. Each other Angel you control enters with an additional +1/+1 counter on it for each Angel you already control.
  //  {T}: Add {W}. Spend this mana only to cast an Angel spell."
  singleFace({
    name: 'SYNTHETIC Font Angel',
    manaCost: ['1', 'W'],
    supertypes: ['legendary'],
    types: ['creature'],
    subtypes: ['Angel'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 2,
    toughness: 2,
    oracleText:
      'Flying, vigilance. Each other Angel you control enters with an additional +1/+1 counter on it for each Angel you already control. {T}: Add {W}. Spend this mana only to cast an Angel spell.',
    abilities: [
      kw('flying'),
      kw('vigilance'),
      {
        kind: 'replacement',
        replacement: {
          kind: 'othersEnterWithCounters',
          what: { subtypes: ['Angel'], controller: 'you', other: true },
          counter: '+1/+1',
          count: { kind: 'countOf', filter: { subtypes: ['Angel'], controller: 'you' } },
        },
      },
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production: { kind: 'fixed', mana: ['W'] },
        spendOnly: { subtypes: ['Angel'] },
      },
    ],
  }),
  // "{T}: Add {C}{C}. Spend this mana only to cast artifact or creature spells."
  singleFace({
    name: 'SYNTHETIC Builder Rock',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: '{T}: Add {C}{C}. Spend this mana only to cast artifact or creature spells.',
    abilities: [
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production: { kind: 'fixed', mana: ['C', 'C'] },
        spendOnly: { types: ['artifact', 'creature'] },
      },
    ],
  }),
  // "{T}: Add {G}. Spend this mana only to cast an Elf creature spell." (a type and a subtype together)
  singleFace({
    name: 'SYNTHETIC Elf Shrine',
    manaCost: ['1', 'G'],
    types: ['artifact'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: '{T}: Add {G}. Spend this mana only to cast an Elf creature spell.',
    abilities: [
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production: { kind: 'fixed', mana: ['G'] },
        spendOnly: { types: ['creature'], subtypes: ['Elf'] },
      },
    ],
  }),
  // "{2}: You gain 1 life." (an ability that costs mana)
  singleFace({
    name: 'SYNTHETIC Mana Sink',
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: '{2}: You gain 1 life.',
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['2'] }],
        effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
      },
    ],
  }),
  // "As this artifact enters, choose a color. Creatures you control of the chosen color get +1/+0. {T}: Add one mana of the chosen color."
  singleFace({
    name: 'SYNTHETIC Colored Banner',
    manaCost: ['3'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      'As this artifact enters, choose a color. Creatures you control of the chosen color get +1/+0. {T}: Add one mana of the chosen color.',
    abilities: [
      { kind: 'replacement', replacement: { kind: 'asEntersChoose', what: 'color' } },
      {
        kind: 'static',
        static: {
          kind: 'modifyPt',
          subject: {
            kind: 'filter',
            filter: { types: ['creature'], controller: 'you', chosenColor: true },
          },
          power: 1,
          toughness: 0,
        },
      },
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production: { kind: 'chosenColor' },
      },
    ],
  }),
  // "You gain 2 life." for {2}: a spell that is neither an artifact nor a creature, paid with generic mana only
  singleFace({
    name: 'SYNTHETIC Colorless Tonic',
    manaCost: ['2'],
    types: ['sorcery'],
    colors: [],
    colorIdentity: [],
    oracleText: 'You gain 2 life.',
    spell: { effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 2 } },
  }),
];
