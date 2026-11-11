/**
 * SYNTHETIC CARDS FOR "ENCHANTED CREATURE LOSES ALL ABILITIES AND IS A GREEN ELK CREATURE WITH BASE POWER AND TOUGHNESS 3/3". NOT REAL
 * MAGIC CARDS.
 *
 * Invented for the tests of D-145 (the Dinosaurs slice): an Aura and an Equipment whose static abilities take every ability from what they
 * are attached to (`loseAllAbilities`), replace its colors (`setColors`) and its card types and creature types (`setTypes` without
 * `additive`) and set its base power and toughness (`setPt`); an Aura that only adds a color and a type; and an artifact creature to be
 * changed. Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these
 * is the definition of a real card.
 */
import type { Ability } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const ATTACHED = { kind: 'attached' } as const;

const elkStatics: readonly Ability[] = [
  { kind: 'static', static: { kind: 'loseAllAbilities', subject: ATTACHED } },
  {
    kind: 'static',
    static: { kind: 'setTypes', subject: ATTACHED, types: ['creature'], subtypes: ['Elk'] },
  },
  { kind: 'static', static: { kind: 'setColors', subject: ATTACHED, colors: ['G'] } },
  { kind: 'static', static: { kind: 'setPt', subject: ATTACHED, power: 3, toughness: 3 } },
];
const ELK_WORDS =
  'Enchanted creature loses all abilities and is a green Elk creature with base power and toughness 3/3.';

export const SYNTHETIC_POLYMORPH_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Elk Aura',
    manaCost: ['1', 'G'],
    types: ['enchantment'],
    subtypes: ['Aura'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: `Enchant creature. ${ELK_WORDS}`,
    abilities: [
      { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
      ...elkStatics,
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Elk Blade',
    manaCost: ['2'],
    types: ['artifact'],
    subtypes: ['Equipment'],
    colors: [],
    colorIdentity: [],
    oracleText: `${ELK_WORDS.replace('Enchanted', 'Equipped')} Equip {1}`,
    abilities: [
      ...elkStatics,
      { kind: 'keyword', keyword: { kind: 'equip', cost: [{ kind: 'mana', symbols: ['1'] }] } },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Blue Wizard Aura',
    manaCost: ['1', 'U'],
    types: ['enchantment'],
    subtypes: ['Aura'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText:
      'Enchant creature. Enchanted creature is blue and is a Wizard in addition to its other types.',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
      { kind: 'static', static: { kind: 'setColors', subject: ATTACHED, colors: ['U'] } },
      {
        kind: 'static',
        static: { kind: 'setTypes', subject: ATTACHED, subtypes: ['Wizard'], additive: true },
      },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Clockwork Bear',
    manaCost: ['3'],
    types: ['artifact', 'creature'],
    subtypes: ['Bear'],
    colors: [],
    colorIdentity: [],
    power: 2,
    toughness: 2,
    oracleText: 'Trample',
    abilities: [{ kind: 'keyword', keyword: { kind: 'trample' } }],
  }),
];
