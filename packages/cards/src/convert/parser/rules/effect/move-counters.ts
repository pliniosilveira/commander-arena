/**
 * Effect rule of issue 230 (Forgotten Ancient): "move any number of +1/+1 counters from ~ onto other creatures" (CR 122.1, 608.2d). The controller moves counters, one at a time, from
 * the permanent of the ability onto other creatures; the engine runs `moveCountersOnto` (`rules/move-counters.ts`).
 */
import { pattern, sequence } from '../../combinators';
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

const FROM_OTHERS_ID = 'effect.move-counters-from-others-onto-self';

/**
 * `effect.move-counters-from-others-onto-self`: "move any number of +1/+1 counters from other permanents you control onto ~" (Aetherborn Marauder; CR 122.5, 608.2d): the controller moves
 * counters of the named kind, one at a time, from any of the other permanents the noun names onto the permanent with the ability, and chooses where each comes from and when to stop. The
 * engine's `moveCounter` with `anyNumber`, a kind and several permanents to take from. Not read: a number of counters, no kind, a target, "~" as the source of the counters, a trailing clause.
 */
export const EFFECT_MOVE_COUNTERS_FROM_OTHERS_ONTO_SELF = defineRule<Clauses>({
  id: FROM_OTHERS_ID,
  family: 'effect',
  leading: ['move'],
  cites: [
    'CR 122.5 (Counters)',
    'CR 122.1 (Counters)',
    'CR 608.2d (Resolving Spells and Abilities)',
  ],
  examples: [
    'move any number of +1/+1 counters from other permanents you control onto ~',
    'move any number of +1/+1 counters from other creatures you control onto ~',
  ],
  rejects: [
    'move a +1/+1 counter from other permanents you control onto ~',
    'move any number of counters from other permanents you control onto ~',
    'move any number of +1/+1 counters from target permanent you control onto ~',
    'move any number of +1/+1 counters from ~ onto other permanents you control',
    'move any number of +1/+1 counters from other permanents you control onto target creature',
    'move any number of +1/+1 counters from other permanents you control onto ~ and draw a card',
    'move any number of +1/+1 counters from other permanent you control onto ~',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      sequence(
        pattern(/move any number of ([+-]\d+\/[+-]\d+) counters from /iu),
        family<IrNoun>('noun', { only: ['noun.other-permanents'] }),
        pattern(/ onto ~(?=\.|$)/iu),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [lead, from] = r.value.value;
    const counter: IrCounterSpec = {
      kind: 'counterSpec',
      name: (lead[1] ?? '').toLowerCase(),
      span: r.value.span,
      rule: FROM_OTHERS_ID,
    };
    return {
      ok: true,
      value: [
        makeClause(FROM_OTHERS_ID, 'moveCountersFromOthers', { counter, from }, r.value.span),
      ],
      pos: r.pos,
    };
  },
});

export const MOVE_COUNTERS_EFFECT_RULES = [
  EFFECT_MOVE_COUNTERS_ONTO_OTHERS,
  EFFECT_MOVE_COUNTERS_FROM_OTHERS_ONTO_SELF,
].map(quietly);
