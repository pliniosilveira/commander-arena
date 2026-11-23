/**
 * SYNTHETIC CARDS FOR A STATIC ABILITY THAT GIVES OTHER PERMANENTS A STATIC "+N/+N" ABILITY AND EQUIP ABILITIES. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of a granted static ability that changes power and toughness (CR 613.1f, 613.4c: the ability is given in layer 6 and what it does is applied in
 * layer 7c) and of granted equip abilities with a cost (CR 702.6a, 702.6c) on permanents that are made Equipment in layer 4 (CR 613.1d, 301.5). Names start with
 * "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text.
 */
import type { Ability, StaticSubject, TargetSpec } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const TREASURES_YOU_CONTROL: StaticSubject = {
  kind: 'filter',
  filter: { subtypes: ['Treasure'], controller: 'you' },
};

const GEM_ABILITIES: readonly Ability[] = [
  {
    kind: 'static',
    static: {
      kind: 'setTypes',
      subject: TREASURES_YOU_CONTROL,
      subtypes: ['Equipment'],
      additive: true,
    },
  },
  {
    kind: 'static',
    static: {
      kind: 'grantAbility',
      subject: TREASURES_YOU_CONTROL,
      ability: {
        kind: 'static',
        static: { kind: 'modifyPt', subject: { kind: 'attached' }, power: 2, toughness: 0 },
      },
    },
  },
  {
    kind: 'static',
    static: {
      kind: 'grantKeyword',
      subject: TREASURES_YOU_CONTROL,
      keyword: {
        kind: 'equip',
        cost: [{ kind: 'mana', symbols: ['1'] }],
        restriction: { subtypes: ['Pirate'] },
      },
    },
  },
  {
    kind: 'static',
    static: {
      kind: 'grantKeyword',
      subject: TREASURES_YOU_CONTROL,
      keyword: { kind: 'equip', cost: [{ kind: 'mana', symbols: ['3'] }] },
    },
  },
];

const ANY_PERMANENT: TargetSpec = { id: 't1', what: { kind: 'object', filter: {} } };

export const SYNTHETIC_GRANTED_STATICS_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Gem Cutter',
    manaCost: ['3', 'R'],
    types: ['creature'],
    subtypes: ['Orc', 'Pirate'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 1,
    toughness: 3,
    oracleText:
      'Treasures you control are Equipment in addition to their other types and have "Equipped creature gets +2/+0," equip Pirate {1}, and equip {3}.',
    abilities: GEM_ABILITIES,
  }),
  singleFace({
    name: 'SYNTHETIC Coin Find',
    manaCost: ['R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Create a Treasure token.',
    spell: {
      effect: { kind: 'createToken', token: { kind: 'preset', preset: 'Treasure' }, count: 1 },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Blank Slate',
    manaCost: ['U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Target permanent loses all abilities until end of turn.',
    spell: {
      targets: [ANY_PERMANENT],
      effect: {
        kind: 'loseAllAbilities',
        objects: { kind: 'target', id: 't1' },
        duration: 'untilEndOfTurn',
      },
    },
  }),
];
