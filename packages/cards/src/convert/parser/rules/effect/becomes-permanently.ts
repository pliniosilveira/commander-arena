/**
 * Effect rule of issue 128 (Tezzeret, Betrayer of Flesh): "Target artifact becomes an artifact creature." with no duration. The engine's `setTypes` with the duration `permanent`; only the
 * words are new.
 */
import { pattern, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, family } from '../registry';
import { type Clauses, single } from './operands';

const ID = 'effect.becomes-artifact-creature-permanently';

/**
 * `effect.becomes-artifact-creature-permanently`: "target artifact becomes an artifact creature" (CR 205.1b: it keeps every card type and subtype it had and is also a creature; CR 611.2a,
 * 613.1d: an effect of a resolving spell or ability with no duration lasts for the rest of the game, in layer 4; CR 611.2c: the permanent is the one named as the effect resolves). One
 * target permanent. Not read: a duration (`effect.becomes`), numbers (`effect.each-becomes`), another type, a color, "in addition to", several permanents, a trailing clause.
 */
export const EFFECT_BECOMES_ARTIFACT_CREATURE_PERMANENTLY = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['target'],
  cites: [
    'CR 205.1b (Type Line)',
    'CR 611.2a (Continuous Effects)',
    'CR 613.1d (Interaction of Continuous Effects)',
    'CR 611.2c (Continuous Effects)',
  ],
  examples: ['target artifact becomes an artifact creature'],
  rejects: [
    'target artifact becomes an artifact creature until end of turn',
    'target artifact becomes a 4/4 artifact creature',
    'target artifact becomes an artifact',
    'target artifact becomes a creature',
    'target artifact becomes an artifact creature in addition to its other types',
    'target artifact become an artifact creature',
    'target artifacts become artifact creatures',
    'target artifact becomes an artifact creature and gains flying',
  ],
  parse: single(
    ID,
    sequence(
      family<IrNoun>('noun', { only: ['noun.target-permanent'] }),
      pattern(
        new RegExp(` becomes an artifact creature${BOUNDARY}(?! (?:until|in|and|with|for))`, 'iu'),
      ),
    ),
    ([objects]) => ({ verb: 'becomesArtifactCreaturePermanently', args: { objects } }),
  ),
});

export const BECOMES_PERMANENTLY_EFFECT_RULES = [EFFECT_BECOMES_ARTIFACT_CREATURE_PERMANENTLY];
