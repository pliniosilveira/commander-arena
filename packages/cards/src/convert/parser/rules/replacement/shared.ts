import {
  choice,
  fail,
  literal,
  map,
  optional,
  type Parser,
  pattern,
  quiet,
  sequence,
} from '../../combinators';
import type { IrAbility, IrAmount, IrClause, IrCounterSpec, Span } from '../../ir/types';
import { positiveCount } from '../amount/index';
import { family, spanned } from '../registry';

/** "~ enters" and the pre-2024 "~ enters the battlefield" (the longer one first). */
export const ENTERS = choice(literal('~ enters the battlefield'), literal('~ enters'));

/** A replacement ability whose event is `event`. */
export function replacement(rule: string, span: Span, event: IrClause): IrAbility {
  return { kind: 'replacement', event, span, rule };
}

/**
 * " with two +1/+1 counters on it.": the tail of "~ enters with N counters on it." (CR 122.6,
 * 614.1c). The count is a number, a number word or "a"/"an"; the counter is "+1/+1", "-1/-1" or a
 * named kind ("charge"). `rule` is the id of the rule reading it. With `allowX` the count may be "X"
 * (stage P16, D-103: the X of the spell that became the permanent, CR 107.3m). With `allowEach` the count may be
 * counted by what the permanent finds as it enters: " with a +1/+1 counter on it for each Zombie card in your
 * graveyard" (stage P28, D-131, CR 614.12: counted as it enters, for its controller).
 */
export function countersTail(
  rule: string,
  allowX = false,
  allowEach = false,
): Parser<{ count: IrAmount; counter: IrCounterSpec }> {
  const count: Parser<IrAmount> = (ctx, pos) => {
    if (allowX) {
      const x = pattern(/X(?![\p{L}\p{N}])/u)(ctx, pos);
      if (x.ok)
        return { ok: true, value: { kind: 'x', span: { start: pos, end: x.pos } }, pos: x.pos };
    }
    const n = spanned(positiveCount)(ctx, pos);
    if (!n.ok) return n;
    return {
      ok: true,
      value: { kind: 'number', value: n.value.value, span: n.value.span },
      pos: n.pos,
    };
  };
  return (ctx, pos) => {
    const r = sequence(
      literal(' with '),
      count,
      literal(' '),
      spanned(pattern(/[+-]\d+\/[+-]\d+|[a-z]+/i)),
      pattern(/ counters? on it/i),
      allowEach
        ? optional(
            quiet(
              map(
                sequence(literal(' '), family<IrAmount>('amount', { only: ['amount.for-each'] })),
                ([, each]) => each,
              ),
            ),
            null,
          )
        : (_ctx, p) => ({ ok: true, value: null, pos: p }),
      literal('.'),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, quantity, , kind, , each] = r.value;
    // The engine counts as the permanent enters (CR 614.12), one counter for each: "two counters for each" and an X
    // counted by "for each" are other statements.
    if (each !== null && (quantity.kind !== 'number' || quantity.value !== 1))
      return fail(ctx, pos);
    const amount = each ?? quantity;
    const counter: IrCounterSpec = {
      kind: 'counterSpec',
      name: kind.value[0].toLowerCase(),
      span: kind.span,
      rule,
    };
    return { ok: true, value: { count: amount, counter }, pos: r.pos };
  };
}
