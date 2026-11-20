/**
 * Effect rule of the sentence that adds counters to what the instruction before it put onto the battlefield (Aberrant Return): "Each of them enters with an additional -1/-1 counter
 * on it." (CR 614.1c: "enters with" is a replacement effect; CR 122.6, 122.6a: an object that enters with counters, put on by the controller of the effect). The sentence is not an
 * instruction of its own: the lowering folds it into the `moveToZone` of the sentence before it (`withCounters`), and refuses it after anything else.
 */
import { fail, literal, map, pattern, sequence } from '../../combinators';
import type { IrAmount, IrFlag, IrNameArg } from '../../ir/types';
import { positiveCount } from '../amount/index';
import { defineRule, quietly, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

const ID = 'effect.each-enters-with-additional-counters';

export const EFFECT_EACH_ENTERS_WITH_ADDITIONAL_COUNTERS = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['each'],
  cites: [
    'CR 614.1c (Replacement Effects)',
    'CR 122.6 (Counters)',
    'CR 122.6a (Counters)',
    'CR 400.7 (General)',
  ],
  examples: [
    'each of them enters with an additional -1/-1 counter on it',
    'Each of them enters with an additional -1/-1 counter on it',
    'each of them enters with two additional +1/+1 counters on it',
    'each of them enters with an additional finality counter on it',
  ],
  rejects: [
    'each of them enters with a -1/-1 counter on it',
    'each of them enters with an additional -1/-1 counter',
    'each of them enters with additional -1/-1 counters on it',
    'each of them enters with an additional -1/-1 counter on it and draw a card',
    'each of them enters with an additional counter on it',
    'each of those enters with an additional -1/-1 counter on it',
    'each of them enters tapped with an additional -1/-1 counter on it',
    'each of them enters with an additional -1/-1 counters on it',
    'each of them enters with two additional +1/+1 counter on it',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      sequence(
        literal('each of them enters with '),
        map(sequence(positiveCount, literal(' additional ')), ([n]) => n),
        pattern(/([+-]\d+\/[+-]\d+|[a-z]+) (counters?) on it(?![\p{L}\p{N}])(?=\.|$)/iu),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, count, tail] = r.value.value;
    const plural = (tail[2] ?? '').toLowerCase() === 'counters';
    // "an additional counter" (one) is singular and "two additional counters" plural: a mismatch is not English.
    if (plural !== count > 1) return fail(ctx, pos);
    const span = r.value.span;
    const counter: IrNameArg = {
      kind: 'name',
      name: (tail[1] ?? '').toLowerCase(),
      span,
      rule: ID,
    };
    const amount: IrAmount = { kind: 'number', value: count, span };
    const each: IrFlag = { kind: 'flag', value: true, span, rule: ID };
    return {
      ok: true,
      value: [
        makeClause(ID, 'entersWithAdditionalCounters', { count: amount, counter, each }, span),
      ],
      pos: r.pos,
    };
  },
});

export const ENTERS_WITH_ADDITIONAL_EFFECT_RULES = [
  EFFECT_EACH_ENTERS_WITH_ADDITIONAL_COUNTERS,
].map(quietly);
