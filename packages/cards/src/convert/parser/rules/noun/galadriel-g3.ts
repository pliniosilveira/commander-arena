/**
 * Noun rules of group 3 of the Galadriel deck (issue 43): "up to one target spell" (Repulsive Mutation).
 */
import { literal, map, sequence } from '../../combinators';
import type { IrFilter, IrNoun } from '../../ir/types';
import { defineRule, node, spanned } from '../registry';
import { spellPhrase } from './phrases';

type Bare = Omit<IrNoun, 'span' | 'rule'>;

/**
 * `noun.up-to-one-target-spell`: "up to one target spell", "up to one target noncreature spell" (CR 115.1, 115.2: "up to" lets the player choose no target, and the instruction is
 * then done to nothing; CR 405.1: a spell is on the stack). The same phrase as `noun.target-spell` after "up to one"; the engine's slot with a minimum of 0 targets. Not read: a
 * plural, "up to two", a spell or ability, no "target", no "one".
 */
export const NOUN_UP_TO_ONE_TARGET_SPELL = defineRule<IrNoun>({
  id: 'noun.up-to-one-target-spell',
  family: 'noun',
  leading: ['up'],
  cites: ['CR 115.1 (Targets)', 'CR 115.2 (Targets)', 'CR 405.1 (Stack)', 'CR 701.6 (Counter)'],
  examples: [
    'up to one target spell',
    'up to one target noncreature spell',
    'up to one target creature spell',
    'up to one target instant or sorcery spell',
  ],
  rejects: [
    'up to one target spells',
    'up to two target spells',
    'up to one spell',
    'up to one target',
    'up to one target spell or ability',
    'up to one target tapped spell',
    'up to one other target spell',
    'one target spell',
    'target spell',
  ],
  parse: node<Bare, IrNoun>(
    'noun.up-to-one-target-spell',
    map(
      sequence(literal('up to '), spanned(literal('one')), literal(' target '), spellPhrase()),
      ([, count, , filter]: [string, { span: IrNoun['span'] }, string, IrFilter]): Bare => ({
        kind: 'noun',
        det: 'target',
        filter,
        count: { kind: 'number', value: 1, span: count.span },
        upTo: true,
        plural: false,
        other: false,
      }),
    ),
    (b) => b,
  ),
});

export const GALADRIEL_G3_NOUN_RULES = [NOUN_UP_TO_ONE_TARGET_SPELL];
