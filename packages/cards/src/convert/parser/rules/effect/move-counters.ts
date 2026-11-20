/**
 * Effect rule of issue 230 (Forgotten Ancient): "move any number of +1/+1 counters from ~ onto other creatures" (CR 122.1, 608.2d). The controller moves counters, one at a time, from
 * the permanent of the ability onto other creatures; the engine runs `moveCountersOnto` (`rules/move-counters.ts`).
 */
import { fail, literal, pattern, sequence } from '../../combinators';
import type { IrCounterSpec, IrNoun } from '../../ir/types';
import { defineRule, family, quietly, spanned } from '../registry';
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

/**
 * `effect.move-counter-between-targets`: "move a counter from target permanent you control onto a second target permanent" (Nesting Grounds; CR 122.1, 122.6, 608.2d, 115.1): one
 * counter, of a kind the controller chooses when there are several, from one target permanent onto another. Not read: a number of counters, a named kind, "any number", one target, no
 * "second", another source or destination than a target permanent, "up to".
 */
export const EFFECT_MOVE_COUNTER_BETWEEN_TARGETS = defineRule<Clauses>({
  id: 'effect.move-counter-between-targets',
  family: 'effect',
  leading: ['move'],
  cites: [
    'CR 122.1 (Counters)',
    'CR 122.6 (Counters)',
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 115.1 (Targets)',
  ],
  examples: [
    'move a counter from target permanent you control onto a second target permanent',
    'move a counter from target creature you control onto a second target creature',
  ],
  rejects: [
    'move a counter from target permanent you control onto target permanent',
    'move two counters from target permanent you control onto a second target permanent',
    'move any number of counters from target permanent you control onto a second target permanent',
    'move a +1/+1 counter from target permanent you control onto a second target permanent',
    'move a counter from ~ onto a second target permanent',
    'move a counter from target permanent you control onto ~',
    'move a counter from target permanent you control onto a second target permanent and draw a card',
    'move a counter from up to one target permanent you control onto a second target permanent',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      sequence(
        literal('move a counter from '),
        family<IrNoun>('noun', { only: ['noun.target-permanent'] }),
        literal(' onto a second '),
        family<IrNoun>('noun', { only: ['noun.target-permanent'] }),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, from, , to] = r.value.value;
    if (from.upTo || to.upTo || from.plural || to.plural) return fail(ctx, pos);
    const tail = pattern(/(?![\p{L}\p{N}])(?!\s+(?:and|then))/u)(ctx, r.pos);
    if (!tail.ok) return tail;
    return {
      ok: true,
      value: [makeClause(ID_BETWEEN, 'moveCounterBetween', { from, to }, r.value.span)],
      pos: r.pos,
    };
  },
});

const ID_BETWEEN = 'effect.move-counter-between-targets';

export const MOVE_COUNTERS_EFFECT_RULES = [
  EFFECT_MOVE_COUNTERS_ONTO_OTHERS,
  EFFECT_MOVE_COUNTER_BETWEEN_TARGETS,
].map(quietly);
