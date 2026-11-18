/**
 * Effect rule of issue 230 (Forgotten Ancient): "move any number of +1/+1 counters from ~ onto other creatures" (CR 122.1, 608.2d). The controller moves counters, one at a time, from
 * the permanent of the ability onto other creatures; the engine runs `moveCountersOnto` (`rules/move-counters.ts`).
 */
import { pattern } from '../../combinators';
import type { IrCounterSpec } from '../../ir/types';
import { defineRule, quietly, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

const ID = 'effect.move-counters-onto-others';

/**
 * `effect.move-counters-onto-others`: "move any number of +1/+1 counters from ~ onto other creatures" (the permanent itself, a named kind of counter, the other creatures of
 * any controller). Not read: a number of counters ("move a +1/+1 counter"), the counters of another permanent, a target ("onto target creature", which is a choice at cast time),
 * "onto creatures you control", or another kind of permanent.
 */
export const EFFECT_MOVE_COUNTERS_ONTO_OTHERS = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['move'],
  cites: [
    'CR 122.1 (Counters)',
    'CR 122.6 (Counters)',
    'CR 608.2d (Resolving Spells and Abilities)',
  ],
  examples: [
    'move any number of +1/+1 counters from ~ onto other creatures',
    'move any number of -1/-1 counters from ~ onto other creatures',
  ],
  rejects: [
    'move a +1/+1 counter from ~ onto another creature',
    'move any number of +1/+1 counters from target creature onto other creatures',
    'move any number of +1/+1 counters from ~ onto target creature',
    'move any number of +1/+1 counters from ~ onto other creatures you control',
    'move any number of counters from ~ onto other creatures',
    'move any number of +1/+1 counters from ~ onto other permanents',
    'move any number of +1/+1 counters from ~ onto other creatures and draw a card',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        /move any number of ([+-]\d+\/[+-]\d+) counters from ~ onto other creatures(?![\p{L}\p{N}])(?!\s+(?:you|and|then))/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const counter: IrCounterSpec = {
      kind: 'counterSpec',
      name: (r.value.value[1] ?? '').toLowerCase(),
      span: r.value.span,
      rule: ID,
    };
    return {
      ok: true,
      value: [makeClause(ID, 'moveCountersOnto', { counter }, r.value.span)],
      pos: r.pos,
    };
  },
});

export const MOVE_COUNTERS_EFFECT_RULES = [EFFECT_MOVE_COUNTERS_ONTO_OTHERS].map(quietly);
