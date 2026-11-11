/**
 * SYNTHETIC CARDS FOR "PROTECTION FROM EACH COLOR THAT'S NOT IN YOUR COMMANDER'S COLOR IDENTITY" AND "EQUIP COMMANDER". NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-256 (the Bruna deck): an Equipment that gives +3/+3 and protection from each color outside its controller's commander's
 * color identity and has an equip ability only a commander can be the target of, one that gives protection from named colors, a creature that has the
 * identity protection printed, and four commanders with different color identities. Names start with "SYNTHETIC "; oracleId is null. The text describes
 * what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability, Cost } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const mana = (...symbols: string[]): Cost => ({ kind: 'mana', symbols });
const ATTACHED = { kind: 'attached' } as const;

/** A commander whose mana cost has the colors of its identity (the fixtures keep identity and cost consistent). */
const commander = (
  name: string,
  identity: readonly ('W' | 'U' | 'B' | 'R' | 'G')[],
): CardDefinition =>
  singleFace({
    name,
    manaCost: identity.length === 0 ? ['2'] : [...identity],
    types: ['creature'],
    subtypes: ['Construct'],
    colors: identity,
    colorIdentity: identity,
    power: 2,
    toughness: 2,
    oracleText: '',
  });

const PLATE_ABILITIES: Ability[] = [
  { kind: 'static', static: { kind: 'modifyPt', subject: ATTACHED, power: 3, toughness: 3 } },
  {
    kind: 'static',
    static: {
      kind: 'grantKeyword',
      subject: ATTACHED,
      keyword: { kind: 'protection', from: 'colorsNotInCommanderIdentity' },
    },
  },
  {
    kind: 'keyword',
    keyword: { kind: 'equip', cost: [mana('3')], restriction: { commander: true } },
  },
  { kind: 'keyword', keyword: { kind: 'equip', cost: [mana('5')] } },
];

export const SYNTHETIC_PLATE_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Plate Armor',
    manaCost: ['1'],
    types: ['artifact'],
    subtypes: ['Equipment'],
    colors: [],
    colorIdentity: [],
    oracleText:
      "Equipped creature gets +3/+3 and has protection from each color that's not in your commander's color identity. Equip commander {3}. Equip {5}",
    abilities: PLATE_ABILITIES,
  }),
  singleFace({
    name: 'SYNTHETIC Red Blue Ward Blade',
    manaCost: ['1'],
    types: ['artifact'],
    subtypes: ['Equipment'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Equipped creature has protection from red and from blue. Equip {1}',
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: ATTACHED,
          keyword: { kind: 'protection', from: 'color', colors: ['R', 'U'] },
        },
      },
      { kind: 'keyword', keyword: { kind: 'equip', cost: [mana('1')] } },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Identity Warder',
    manaCost: ['2'],
    types: ['creature'],
    subtypes: ['Construct'],
    colors: [],
    colorIdentity: [],
    power: 1,
    toughness: 1,
    oracleText: "Protection from each color that's not in your commander's color identity",
    abilities: [
      { kind: 'keyword', keyword: { kind: 'protection', from: 'colorsNotInCommanderIdentity' } },
    ],
  }),
  commander('SYNTHETIC White Blue Commander', ['W', 'U']),
  commander('SYNTHETIC Colorless Commander', []),
  commander('SYNTHETIC Five Color Commander', ['W', 'U', 'B', 'R', 'G']),
  commander('SYNTHETIC Black Partner', ['B']),
];
