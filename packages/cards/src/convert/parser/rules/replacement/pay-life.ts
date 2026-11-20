/**
 * Replacement rules of "pay any amount of life" as a permanent enters (Phyrexian Processor, CR 119.4, 614.12): the controller chooses an amount of life from 0 to their life
 * total before the permanent enters and loses that much as it enters; the permanent remembers the amount (CR 400.7: a new object remembers nothing).
 */
import { choice, literal, pattern, sequence } from '../../combinators';
import type { IrAbility, IrClause } from '../../ir/types';
import { defineRule } from '../registry';
import { ENTERS, replacement } from './shared';

/**
 * `replacement.as-enters-pay-life`: "As ~ enters, pay any amount of life." (CR 119.4, 614.12, 614.12a: a choice made before the permanent is on the battlefield; paying life is losing
 * that much life, and 0 can always be paid, CR 119.4b). The engine's `asEntersChoose` of `lifePaid`. Not read: "you may pay", a fixed amount (the shock land's "you may pay 2 life",
 * `replacement.enters-tapped-unless-pays`), "any amount of mana", a missing period, a condition.
 */
export const REPLACEMENT_AS_ENTERS_PAY_LIFE = defineRule<IrAbility>({
  id: 'replacement.as-enters-pay-life',
  family: 'replacement',
  leading: ['as'],
  cites: [
    'CR 119.4 (Life)',
    'CR 119.4b (Life)',
    'CR 614.12 (Replacement Effects)',
    'CR 614.12a (Replacement Effects)',
  ],
  examples: [
    'As ~ enters, pay any amount of life.',
    'As ~ enters the battlefield, pay any amount of life.',
    'as ~ enters, pay any amount of life.',
  ],
  rejects: [
    'As ~ enters, pay any amount of life',
    'As ~ enters, you may pay any amount of life.',
    'As ~ enters, pay 2 life.',
    'As ~ enters, pay any amount of mana.',
    'As ~ enters, pay any amount of life. ~ enters tapped.',
    'As ~ attacks, pay any amount of life.',
    '~ enters, pay any amount of life.',
    'As ~ enters, pay any amount of life or sacrifice it.',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      pattern(/as /i),
      choice(ENTERS, literal('it enters the battlefield'), literal('it enters')),
      literal(', pay any amount of life.'),
    )(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    const id = 'replacement.as-enters-pay-life';
    const event: IrClause = {
      kind: 'clause',
      verb: 'entersChoose',
      args: { what: { kind: 'choiceKind', what: 'lifePaid', span, rule: id } },
      optional: false,
      span,
      rule: id,
    };
    return { ok: true, value: replacement(id, span, event), pos: r.pos };
  },
});

export const PAY_LIFE_REPLACEMENT_RULES = [REPLACEMENT_AS_ENTERS_PAY_LIFE];
