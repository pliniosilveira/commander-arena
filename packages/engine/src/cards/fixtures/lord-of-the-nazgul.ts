/**
 * Lord of the Nazgûl (issue 57). This fixture uses the Oracle text supplied in the issue; rulings
 * and the Comprehensive Rules could not be independently checked in this workspace.
 */
import type { TokenDefinition } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const INSTANT_OR_SORCERY = {
  anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }],
} as const;
const WRAITHS_YOU_CONTROL = { subtypes: ['Wraith'], controller: 'you' } as const;

const WRAITH: TokenDefinition = {
  name: 'Wraith',
  manaCost: null,
  supertypes: [],
  types: ['creature'],
  subtypes: ['Wraith'],
  colors: ['B'],
  power: 3,
  toughness: 3,
  loyalty: null,
  defense: null,
  oracleText: 'Menace',
  abilities: [{ kind: 'keyword', keyword: { kind: 'menace' } }],
};

export const LORD_OF_THE_NAZGUL_FIXTURE: CardDefinition = singleFace({
  name: 'Lord of the Nazgûl',
  manaCost: ['3', 'U', 'B'],
  supertypes: ['legendary'],
  types: ['creature'],
  subtypes: ['Wraith', 'Noble'],
  colors: ['U', 'B'],
  colorIdentity: ['U', 'B'],
  power: 4,
  toughness: 3,
  oracleText:
    'Flying\nWraiths you control have protection from Ring-bearers.\nWhenever you cast an instant or sorcery spell, create a 3/3 black Wraith creature token with menace. Then if you control nine or more Wraiths, Wraiths you control have base power and toughness 9/9 until end of turn.',
  abilities: [
    { kind: 'keyword', keyword: { kind: 'flying' } },
    {
      kind: 'static',
      static: {
        kind: 'grantKeyword',
        subject: { kind: 'filter', filter: WRAITHS_YOU_CONTROL },
        keyword: { kind: 'protection', from: 'ringBearer' },
      },
    },
    {
      kind: 'triggered',
      trigger: {
        kind: 'castSpell',
        filter: { ...INSTANT_OR_SORCERY, stackKind: 'spell' },
        by: 'you',
      },
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'createToken',
            count: 1,
            token: { kind: 'custom', definition: WRAITH },
          },
          {
            kind: 'conditional',
            condition: {
              kind: 'controlsAtLeast',
              filter: WRAITHS_YOU_CONTROL,
              count: 9,
            },
            effect: {
              kind: 'setPt',
              objects: { kind: 'each', filter: WRAITHS_YOU_CONTROL },
              power: 9,
              toughness: 9,
              duration: 'untilEndOfTurn',
            },
          },
        ],
      },
    },
  ],
});
