/**
 * `effect.transform`: "Transform ~" (CR 701.27, Transform). A permanent turns over so that its other
 * face is up (CR 701.27a); nothing happens to a permanent that is not double-faced (CR 701.27c) or
 * whose other face is an instant or sorcery (CR 701.27d), and an ability of the permanent that
 * tries to transform it does so only once (CR 701.27f); the engine's `transform` effect does all
 * of that, so the rule only has to read the sentence. Only "~" is read: the backlog has no line
 * that transforms another permanent, a condition after the effect ("if it's night") is not read,
 * and a pronoun refers to nothing outside a trigger about "~".
 */
import { literal, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, family } from '../registry';
import { type Clauses, single } from './operands';

export const EFFECT_TRANSFORM = defineRule<Clauses>({
  id: 'effect.transform',
  family: 'effect',
  leading: ['transform'],
  cites: ['CR 701.27 (Transform)', 'CR 701.27f (Transform)', 'CR 712 (Double-Faced Cards)'],
  examples: ['transform ~'],
  rejects: [
    'transform target creature',
    'transform it',
    'transform',
    'transform ~ if it’s night',
    'transform ~ and ~',
    'transform all creatures',
  ],
  parse: single(
    'effect.transform',
    sequence(literal('transform '), family<IrNoun>('noun', { only: ['noun.self'] })),
    ([, objects]) => ({ verb: 'transform', args: { objects } }),
  ),
});

export const TRANSFORM_RULES = [EFFECT_TRANSFORM];
