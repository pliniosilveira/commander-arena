/**
 * Effect rule of a pump for a creature and the creatures that share a creature type with it (Haunted One): "it and other creatures you control that share a creature type with it each
 * get +2/+0 and gain undying until end of turn." (CR 611.2a a continuous effect of a resolving ability, CR 611.2c the group is fixed as the effect resolves, CR 205.3m creature types,
 * CR 613.1f layer 6 abilities, CR 613.4c layer 7c). The engine's `modifyPt` and `grantKeyword` of the creature itself and of an `each` selector with `sharesCreatureTypeWith: 'source'`.
 */
import { fail, literal, pattern, sequence } from '../../combinators';
import type { IrNoun, IrNounList } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, family } from '../registry';
import { gainParser } from './gain';
import type { Clauses } from './operands';

/**
 * The subject: "it and other creatures you control that share a creature type with it each". `it` is the creature the ability is about (the binding pass reads it in an ability about
 * `~` alone) and the second noun is its group; "share" is the plural verb, and what they share is a creature type with that creature.
 */
function subject(rule: string) {
  return (ctx: Parameters<ReturnType<typeof sequence>>[0], pos: number) => {
    const r = sequence(
      family<IrNoun>('noun', { only: ['noun.it'] }),
      literal(' and '),
      family<IrNoun>('noun', { only: ['noun.other-permanents'] }),
      pattern(new RegExp(` that share a creature type with it each${BOUNDARY}`, 'iu')),
    )(ctx, pos);
    if (!r.ok) return r;
    const [it, , others] = r.value;
    // The group names a controller ("you control"): the creatures of another player are not "other creatures you control".
    if (others.filter.controller !== 'you') return fail(ctx, pos);
    const list: IrNounList = {
      kind: 'nounList',
      items: [it, { ...others, filter: { ...others.filter, sharesCreatureTypeWithSource: true } }],
      span: { start: pos, end: r.pos },
      rule,
    };
    return { ok: true as const, value: list, pos: r.pos };
  };
}

/**
 * `effect.gain-it-and-type-sharers`: "it and other creatures you control that share a creature type with it each get +2/+0 and gain undying until end of turn." A pump, keywords or
 * both, for the creature the ability is about and the other creatures its controller has that share a creature type with it (a creature with no creature type shares none). Only in an
 * ability about its own permanent (`~`, or the creature that has a granted ability): "it" is that creature. Not read: another subject, a creature of another controller, "all", one
 * of the verbs alone with a singular subject, no "each", no duration.
 */
export const EFFECT_GAIN_IT_AND_TYPE_SHARERS = defineRule<Clauses>({
  id: 'effect.gain-it-and-type-sharers',
  family: 'effect',
  leading: ['it'],
  cites: [
    'CR 611.2a (Continuous Effects)',
    'CR 611.2c (Continuous Effects)',
    'CR 205.3m (Subtypes)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 613.4c (Interaction of Continuous Effects)',
  ],
  examples: [
    'it and other creatures you control that share a creature type with it each get +2/+0 and gain undying until end of turn',
    'it and other creatures you control that share a creature type with it each get +1/+1 and gain trample until end of turn',
    'it and other creatures you control that share a creature type with it each gain trample until end of turn',
  ],
  rejects: [
    // A pump alone is another rule's business (`effect.pump-each` and the like); this rule reads the keywords of one.
    'it and other creatures you control that share a creature type with it each get +2/+0 until end of turn',
    'it and other creatures you control that share a creature type with it get +2/+0 and gain trample until end of turn',
    'it and other creatures you control that share a creature type with it each gets +2/+0 and gains trample until end of turn',
    'it and other creatures you control that share a creature type with it each get +2/+0 and gain trample',
    'it and other creatures you control that share a creature type with it each get +2/+0 and gain trample until your next turn',
    'it and other creatures that share a creature type with it each get +2/+0 until end of turn',
    'it and other creatures your opponents control that share a creature type with it each get +2/+0 until end of turn',
    'it and other creatures you control that share a creature type each get +2/+0 until end of turn',
    'it and all other creatures you control that share a creature type with it each get +2/+0 until end of turn',
    'that creature and other creatures you control that share a creature type with it each get +2/+0 until end of turn',
    'it and other creatures you control that share a creature type with it each get +2/+0 and gain flash until end of turn',
  ],
  parse: gainParser(
    'effect.gain-it-and-type-sharers',
    [],
    true,
    () => true,
    undefined,
    subject('effect.gain-it-and-type-sharers'),
  ),
});

export const TYPE_SHARERS_EFFECT_RULES = [EFFECT_GAIN_IT_AND_TYPE_SHARERS];
