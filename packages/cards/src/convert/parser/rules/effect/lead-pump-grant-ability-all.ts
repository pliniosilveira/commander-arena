/**
 * Effect rule of the Most Wanted deck (group 1, Dead Before Sunrise): "Until end of turn, outlaw creatures you control get +1/+0 and gain "{T}: ~ deals damage equal to its power to
 * target creature."" (CR 611.2a, 611.2c, 613.1f, 613.4c): a group gets a pump and an activated or triggered ability for the turn, both of the same permanents.
 */
import { fail, literal } from '../../combinators';
import type { IrDuration, IrNoun } from '../../ir/types';
import { defineRule, family } from '../registry';
import { readQuotedAbility } from '../static/quoted';
import { type Clauses, makeClause } from './operands';
import { ptChange } from './pump';

const ID = 'effect.lead-pump-grant-ability-all';

/**
 * `effect.lead-pump-grant-ability-all`: "Until end of turn, creatures you control get +1/+0 and gain \"{T}: ~ deals damage equal to its power to target creature.\"": the duration
 * first, a group (`noun.plain-permanents`: which permanents it means is fixed as the effect resolves, CR 611.2c), a pump (layer 7c, CR 613.4c) and an ability granted in layer 6
 * (CR 613.1f). Not read: another duration, a target or "other" subject, a granted ability that is a mana ability or a keyword (`effect.lead-gain-all`), a pump without the grant, the
 * grant first.
 */
export const EFFECT_LEAD_PUMP_GRANT_ABILITY_ALL = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['until'],
  cites: [
    'CR 611.2a (Continuous Effects)',
    'CR 611.2c (Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 613.4c (Interaction of Continuous Effects)',
  ],
  examples: [
    'Until end of turn, creatures you control get +1/+0 and gain "{T}: ~ deals damage equal to its power to target creature."',
    'Until end of turn, outlaw creatures you control get +1/+0 and gain "{T}: ~ deals damage equal to its power to target creature."',
    'Until end of turn, creatures you control get +2/+2 and gain "When ~ dies, draw a card."',
  ],
  rejects: [
    'Until end of turn, creatures you control get +1/+0 and gains "{T}: ~ deals damage equal to its power to target creature."',
    'Until your next turn, creatures you control get +1/+0 and gain "{T}: ~ deals damage equal to its power to target creature."',
    'Until end of turn, target creature gets +1/+0 and gain "{T}: ~ deals damage equal to its power to target creature."',
    'Until end of turn, other creatures you control get +1/+0 and gain "{T}: ~ deals damage equal to its power to target creature."',
    'Until end of turn, creatures you control get +1/+0 and gain "{T}: Add {G}."',
    'Until end of turn, creatures you control get +1/+0 and gain flying',
    'Until end of turn, creatures you control get +1/+0',
  ],
  parse: (ctx, pos) => {
    const duration = family<IrDuration>('duration')(ctx, pos);
    if (!duration.ok) return duration;
    if (duration.value.scope !== 'untilEndOfTurn') return fail(ctx, pos);
    const comma = literal(', ')(ctx, duration.pos);
    if (!comma.ok) return comma;
    const subject = family<IrNoun>('noun', { only: ['noun.plain-permanents'] })(ctx, comma.pos);
    if (!subject.ok) return subject;
    const gets = literal(' get ')(ctx, subject.pos);
    if (!gets.ok) return gets;
    const pt = ptChange(ID)(ctx, gets.pos);
    if (!pt.ok) return pt;
    const gain = literal(' and gain ')(ctx, pt.pos);
    if (!gain.ok) return gain;
    const quoted = readQuotedAbility(ctx, gain.pos, { mana: false });
    if (!quoted.ok) return quoted;
    if (quoted.value.ability.kind !== 'triggered' && quoted.value.ability.kind !== 'activated') {
      return fail(ctx, gain.pos);
    }
    return {
      ok: true,
      value: [
        {
          ...makeClause(ID, 'modifyPt', { objects: subject.value, pt: pt.value }, pt.value.span),
          duration: duration.value,
          connector: 'and' as const,
        },
        {
          ...makeClause(
            ID,
            'grantAbility',
            { objects: subject.value, ability: quoted.value },
            quoted.value.span,
          ),
          duration: duration.value,
        },
      ],
      pos: quoted.pos,
    };
  },
});

export const LEAD_PUMP_GRANT_ABILITY_RULES = [EFFECT_LEAD_PUMP_GRANT_ABILITY_ALL];
