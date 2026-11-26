/**
 * Effect rule of the Exit from Exile deck (Vivien, Champion of the Wilds): "Until your next turn, up to one target creature gains reach and vigilance." (CR 611.2a: the effect lasts as
 * long as it states; CR 613.1f: a layer 6 effect; CR 500.1: the next turn of its controller). The duration first, then one target that gains keywords.
 */
import { literal, pattern, sequence } from '../../combinators';
import type { IrDuration, IrKeywordArg, IrNoun } from '../../ir/types';
import { KEYWORD_WORDS } from '../keyword/list';
import { defineRule, family, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

const ID = 'effect.lead-gain-next-turn';

/**
 * `effect.lead-gain-next-turn`: "Until your next turn, target creature gains reach", "Until your next turn, up to one target creature gains reach and vigilance". One target (or none, "up to
 * one"), keywords without parameters, no pump. Not read: another duration, a group, a pump, "until end of turn" (`effect.lead-gain`), a quoted ability, a missing comma.
 */
export const EFFECT_LEAD_GAIN_NEXT_TURN = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['until'],
  cites: [
    'CR 611.2a (Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 500.1 (Beginning of Turn)',
  ],
  examples: [
    'Until your next turn, target creature gains reach',
    'Until your next turn, up to one target creature gains reach and vigilance',
  ],
  rejects: [
    'Until end of turn, target creature gains reach',
    'Until your next turn target creature gains reach',
    'Until your next turn, target creatures gain reach',
    'Until your next turn, creatures you control gain reach',
    'Until your next turn, target creature gets +1/+1 and gains reach',
    'Until your next turn, target creature gains',
    'Until your next turn, target creature gains flash',
    'Until your next turn, target creature gains reach until end of turn',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      spanned(pattern(/until your next turn, /iu)),
      family<IrNoun>('noun', { only: ['noun.target-permanent', 'noun.up-to-one-permanent'] }),
      literal(' gains '),
      spanned(KEYWORD_WORDS),
    )(ctx, pos);
    if (!r.ok) return r;
    const [lead, subject, , gains] = r.value;
    const duration: IrDuration = {
      kind: 'duration',
      scope: 'untilYourNextTurn',
      span: lead.span,
      rule: ID,
    };
    const names = gains.value;
    return {
      ok: true,
      value: names.map((name, i) => {
        const keyword: IrKeywordArg = { kind: 'keywordName', name, span: gains.span, rule: ID };
        return {
          ...makeClause(ID, 'grantKeyword', { objects: subject, keyword }, gains.span),
          duration,
          ...(i < names.length - 1 ? { connector: 'and' as const } : {}),
        };
      }),
      pos: r.pos,
    };
  },
});

export const LEAD_GAIN_NEXT_TURN_EFFECT_RULES = [EFFECT_LEAD_GAIN_NEXT_TURN];
