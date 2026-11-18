/**
 * Effect rule of issue 89 (Silverquill Influence, D-601): "Goad target creature." and "goad it." (CR 701.15a).
 */
import { literal, sequence } from '../../combinators';
import { defineRule } from '../registry';
import { type Clauses, operands, single } from './operands';

/**
 * `effect.goad`: "goad target creature", "goad up to one target creature", "goad it" (CR 701.15a: the creature is goaded by the controller of the spell or ability until
 * their next turn; D-589, D-601). One creature: a target or the pronoun an earlier sentence of the text chose. Not read: "goad each creature", "goad all creatures",
 * "goad them", "goad target player", a number of creatures, "goads", a duration.
 */
export const EFFECT_GOAD = defineRule<Clauses>({
  id: 'effect.goad',
  family: 'effect',
  leading: ['goad'],
  cites: ['CR 701.15a (Goad)', 'CR 701.15d (Goad)'],
  examples: [
    'goad target creature',
    'goad up to one target creature',
    'goad it',
    'Goad target creature',
  ],
  rejects: [
    'goad each creature',
    'goad all creatures your opponents control',
    'goad them',
    'goad target player',
    'goads target creature',
    'goad',
    'goad target creature until end of turn',
  ],
  parse: single(
    'effect.goad',
    sequence(literal('goad '), operands(['noun.target-permanent', 'noun.it'], 'effect.goad')),
    ([, objects]) => ({ verb: 'goad', args: { objects } }),
  ),
});

export const GOAD_EFFECT_RULES = [EFFECT_GOAD];
