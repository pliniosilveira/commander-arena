/** Maskwood Nexus (issue 57), from the Oracle text supplied in the issue; rules data is unverified. */
import type { TokenDefinition } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const SHAPESHIFTER: TokenDefinition = {
  name: 'Shapeshifter',
  manaCost: null,
  supertypes: [],
  types: ['creature'],
  subtypes: ['Shapeshifter'],
  colors: ['U'],
  power: 2,
  toughness: 2,
  loyalty: null,
  defense: null,
  oracleText: '',
  abilities: [{ kind: 'keyword', keyword: { kind: 'changeling' } }],
};

export const MASKWOOD_NEXUS_FIXTURE: CardDefinition = singleFace({
  name: 'Maskwood Nexus',
  manaCost: ['4'],
  supertypes: [],
  types: ['artifact'],
  subtypes: [],
  colors: [],
  colorIdentity: [],
  oracleText:
    "Creatures you control are every creature type. The same is true for creature spells you control and creature cards you own that aren't on the battlefield.\n{3}, {T}: Create a 2/2 blue Shapeshifter creature token with changeling. (It is every creature type.)",
  abilities: [
    { kind: 'static', static: { kind: 'allCreatureTypes', scope: 'youControl' } },
    { kind: 'static', static: { kind: 'allCreatureTypes', scope: 'youOwn' } },
    {
      kind: 'activated',
      cost: [{ kind: 'mana', symbols: ['3'] }, { kind: 'tap' }],
      effect: {
        kind: 'createToken',
        token: { kind: 'custom', definition: SHAPESHIFTER },
        count: 1,
      },
    },
  ],
});
