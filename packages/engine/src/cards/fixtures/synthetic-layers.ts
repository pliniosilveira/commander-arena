/**
 * SYNTHETIC LAYER, FLICKER AND PROWESS CARDS. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of the continuous effects of CR 613 (set power and toughness, lose all
 * abilities, change types and colors, gain a keyword), the exile-and-return of CR 400.7 and
 * Prowess (CR 702.108). Names start with "SYNTHETIC "; oracleId is null. The text describes what
 * the AST does; it is not Oracle text. The shapes follow well-known cards (a pump, a "becomes a
 * Frog" effect, a flicker spell) without copying their definitions.
 */
import type { Effect, TargetSpec } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const T1 = { kind: 'target', id: 't1' } as const;
const END = 'untilEndOfTurn' as const;
const CREATURE_TARGET: TargetSpec = {
  id: 't1',
  what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
};

function targetedInstant(
  name: string,
  manaCost: string[],
  color: 'G' | 'U' | 'R',
  oracleText: string,
  effect: Effect,
): CardDefinition {
  return singleFace({
    name,
    manaCost,
    types: ['instant'],
    colors: [color],
    colorIdentity: [color],
    oracleText,
    spell: { targets: [CREATURE_TARGET], effect },
  });
}

export const SYNTHETIC_LAYER_LIST: readonly CardDefinition[] = [
  targetedInstant(
    'SYNTHETIC Growth Spurt',
    ['G'],
    'G',
    'Target creature gets +3/+3 until end of turn.',
    { kind: 'modifyPt', objects: T1, power: 3, toughness: 3, duration: END },
  ),
  targetedInstant(
    'SYNTHETIC Frog Hex',
    ['1', 'U'],
    'U',
    'Target creature loses all abilities and becomes a blue Frog with base power and toughness 1/1 until end of turn.',
    {
      kind: 'sequence',
      effects: [
        { kind: 'loseAllAbilities', objects: T1, duration: END },
        { kind: 'setTypes', objects: T1, subtypes: ['Frog'], duration: END },
        { kind: 'setColors', objects: T1, colors: ['U'], duration: END },
        { kind: 'setPt', objects: T1, power: 1, toughness: 1, duration: END },
      ],
    },
  ),
  targetedInstant(
    'SYNTHETIC Gust of Wings',
    ['U'],
    'U',
    'Target creature gains flying until end of turn.',
    { kind: 'grantKeyword', objects: T1, keyword: { kind: 'flying' }, duration: END },
  ),
  targetedInstant(
    'SYNTHETIC Rust Touch',
    ['U'],
    'U',
    'Target creature becomes an artifact until end of turn.',
    { kind: 'setTypes', objects: T1, types: ['artifact'], duration: END },
  ),
  targetedInstant(
    'SYNTHETIC Flicker Spell',
    ['1', 'U'],
    'U',
    "Exile target creature, then return it to the battlefield under its owner's control.",
    {
      kind: 'sequence',
      effects: [
        { kind: 'exile', objects: T1 },
        { kind: 'moveToZone', objects: { kind: 'moved' }, to: 'battlefield', controller: 'owner' },
      ],
    },
  ),
  singleFace({
    name: 'SYNTHETIC Prowess Adept',
    manaCost: ['1', 'W'],
    types: ['creature'],
    subtypes: ['Monk'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 2,
    toughness: 2,
    oracleText: 'Prowess',
    abilities: [{ kind: 'keyword', keyword: { kind: 'prowess' } }],
  }),
];
