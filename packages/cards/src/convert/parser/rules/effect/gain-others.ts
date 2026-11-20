/**
 * Effect rule of the Food and Fellowship deck, group B (Pippin, Warden of Isengard): "Other creatures you control get +3/+3 and gain haste until end of turn." The group of
 * `effect.pump-others` (`noun.other-permanents`) gaining keywords, with or without a pump, as `effect.gain-keyword-all` reads the group with no "other".
 */
import { defineRule, quietly } from '../registry';
import { gainParser } from './gain';
import type { Clauses } from './operands';

/**
 * `effect.gain-keyword-others`: "other creatures you control gain flying until end of turn", "other creatures you control get +3/+3 and gain haste until end of turn" (CR 611.2a,
 * 611.2c, 613.1f, 613.4c): every permanent the group describes, except the source of the ability, as the effect resolves (CR 611.2c: the set is fixed then). Not read: the singular
 * ("another creature you control"), "all other", a creature type after "other", the verb in the singular, no duration, a keyword that cannot be granted.
 */
export const EFFECT_GAIN_KEYWORD_OTHERS = defineRule<Clauses>({
  id: 'effect.gain-keyword-others',
  family: 'effect',
  leading: ['other'],
  cites: [
    'CR 611.2a (Continuous Effects)',
    'CR 611.2c (Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 613.4c (Interaction of Continuous Effects)',
  ],
  examples: [
    'other creatures you control gain flying until end of turn',
    'other creatures you control gain haste until end of turn',
    'other creatures you control get +3/+3 and gain haste until end of turn',
    'other nonland permanents you control gain hexproof until end of turn',
  ],
  rejects: [
    'other creatures you control gains flying until end of turn',
    'other creatures you control gain flying',
    'other creatures you control gain flying until your next turn',
    'other creature you control gains flying until end of turn',
    'all other creatures you control gain flying until end of turn',
    'other Elves you control gain flying until end of turn',
    'other creatures you control get +1/+1 until end of turn',
    'target creature gains flying until end of turn',
  ],
  parse: gainParser('effect.gain-keyword-others', ['noun.other-permanents'], true),
});

/** Quiet: a line this rule does not read ("Other creatures you control have vigilance") stops where it always did. */
export const GAIN_OTHERS_EFFECT_RULES = [quietly(EFFECT_GAIN_KEYWORD_OTHERS)];
