/**
 * SYNTHETIC CARDS FOR "THAT MANY PLUS ONE COUNTERS". NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of `countersPlus` (the Quandrix Unlimited deck, group A): "If one or more +1/+1 counters would be put on a creature you control, that many
 * plus one +1/+1 counters are put on it instead", in the kinds the engine reads (a group, with or without "another"; a type union; any permanent; another number).
 * Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability, ObjectFilter } from '../../ast/types';
import type { CardType } from '../../characteristics';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const plus = (what: ObjectFilter, extra = 1): Ability => ({
  kind: 'replacement',
  replacement: { kind: 'countersPlus', what, counter: '+1/+1', extra },
});

const scales = (
  name: string,
  words: string,
  ability: Ability,
  types: readonly CardType[] = ['enchantment'],
): CardDefinition =>
  singleFace({
    name,
    manaCost: ['2', 'G'],
    types: [...types],
    colors: ['G'],
    colorIdentity: ['G'],
    ...(types.includes('creature') ? { power: 2, toughness: 2 } : {}),
    oracleText: words,
    abilities: [ability],
  });

export const SYNTHETIC_COUNTERS_PLUS_LIST: readonly CardDefinition[] = [
  scales(
    'SYNTHETIC Growth Scales',
    'If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are put on it instead.',
    plus({ types: ['creature'], controller: 'you' }),
  ),
  scales(
    'SYNTHETIC Growth Scales Two',
    'If one or more +1/+1 counters would be put on a creature you control, that many plus two +1/+1 counters are put on it instead.',
    plus({ types: ['creature'], controller: 'you' }, 2),
  ),
  scales(
    'SYNTHETIC Other Scales',
    'If one or more +1/+1 counters would be put on another creature you control, that many plus one +1/+1 counters are put on it instead.',
    plus({ types: ['creature'], controller: 'you', other: true }),
    ['creature'],
  ),
  scales(
    'SYNTHETIC Any Scales',
    'If one or more +1/+1 counters would be put on a permanent you control, that many plus one +1/+1 counters are put on that permanent instead.',
    plus({ controller: 'you' }),
  ),
  scales(
    'SYNTHETIC Artifact Scales',
    'If one or more +1/+1 counters would be put on an artifact or creature you control, that many plus one +1/+1 counters are put on it instead.',
    plus({ anyOf: [{ types: ['artifact'] }, { types: ['creature'] }], controller: 'you' }),
  ),
];
