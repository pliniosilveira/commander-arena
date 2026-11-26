/**
 * Effect rule of the Elven Council deck (issue 98), creature group: "Until end of turn, other Elves you control gain vigilance and get +1/+1 for each +1/+1 counter on ~."
 * (Haldir, Lórien Lieutenant). The lowering is `lower.pump` and `lower.grant-keyword`, as for every other group.
 */
import { defineRule, quietly } from '../registry';
import { leadParser } from './gain';
import type { Clauses } from './operands';

/**
 * `effect.lead-gain-others-subtype`: "Until end of turn, other Elves you control gain vigilance and get +1/+1 for each +1/+1 counter on ~." (CR 611.2a, 611.2c, 613.1f, 613.4c,
 * 205.3m: a continuous effect of a resolving ability on the permanents of a creature type that are not the source, which are fixed as it resolves; the number of counters is counted once,
 * then, and stays). The duration first, then the group of `noun.other-subtype-permanents`, keywords and a pump in either order. Not read: no "other", a creature type that is not a
 * word of CR 205.3m, a verb that does not agree, a duration at the end.
 */
export const EFFECT_LEAD_GAIN_OTHERS_SUBTYPE = defineRule<Clauses>({
  id: 'effect.lead-gain-others-subtype',
  family: 'effect',
  leading: ['until'],
  cites: [
    'CR 611.2a (Continuous Effects)',
    'CR 611.2c (Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 613.4c (Interaction of Continuous Effects)',
    'CR 205.3m (Subtypes)',
  ],
  examples: [
    'Until end of turn, other Elves you control gain vigilance and get +1/+1 for each +1/+1 counter on ~',
    'Until end of turn, other Elves you control gain vigilance',
    'Until end of turn, other Zombies you control get +1/+1',
  ],
  rejects: [
    'Until end of turn, other Elves you control gains vigilance',
    'Until end of turn, Elves you control gain vigilance',
    'Until end of turn, other creatures you control gain vigilance',
    'Until end of turn, other Elves you control gain vigilance until end of turn',
    'Until end of turn, other Elves you control',
    'Until end of turn, other elves you control gain vigilance',
  ],
  parse: leadParser('effect.lead-gain-others-subtype', ['noun.other-subtype-permanents'], true),
});

export const HALDIR_EFFECT_RULES = [quietly(EFFECT_LEAD_GAIN_OTHERS_SUBTYPE)];
