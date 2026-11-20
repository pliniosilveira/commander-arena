/**
 * Effect rule of the Sliver Swarm deck (issue 133, Diffusion Sliver): "counter that spell or ability unless its controller pays {2}", the body of a trigger about a permanent
 * becoming the target of a spell or ability (the Ward trigger of CR 702.21a, written out).
 */
import { literal, pattern, sequence } from '../../combinators';
import type { IrCost, IrNoun } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, family, quietly, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

/** What may follow the clause on its sentence: a join says a second instruction, which is not read. */
const CLAUSE_END = pattern(/(?=\.|$)/u);

/**
 * `effect.counter-that-unless`: "counter that spell or ability unless its controller pays {2}", "counter that spell unless its controller pays {1}{U}" (CR 701.6 counter; CR 118.12a:
 * "unless" a player pays a cost, that player may pay it as the effect resolves; CR 608.2d: the controller of the spell or ability decides, not the controller of this one; CR 113.7a:
 * the spell or ability is read from last-known information when it has left the stack). The spell or ability is the one that caused the trigger, the engine's `triggerSubject` of a
 * `becomesTarget` trigger, so the noun is made here and not left to the binding pass (whose "it" of that trigger would be the permanent). The lowering accepts it only in a trigger
 * about becoming a target, and "that spell" only when the trigger is about spells. The cost is plain mana (as `effect.counter-unless`). Not read: a target ("counter target spell"),
 * "that ability", "that spell or ability unless that player pays", a cost that is not mana, a second instruction after the clause.
 */
export const EFFECT_COUNTER_THAT_UNLESS = defineRule<Clauses>({
  id: 'effect.counter-that-unless',
  family: 'effect',
  leading: ['counter'],
  cites: [
    'CR 701.6 (Counter)',
    'CR 118.12a (Costs)',
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 113.7a (Abilities)',
  ],
  examples: [
    'counter that spell or ability unless its controller pays {2}',
    'counter that spell unless its controller pays {1}{U}',
    'counter that spell or ability unless its controller pays {1}',
  ],
  rejects: [
    'counter that spell or ability',
    'counter that ability unless its controller pays {2}',
    'counter that spell or ability unless that player pays {2}',
    'counter that spell or ability unless its controller pays {X}',
    'counter that spell or ability unless its controller pays 2 life',
    'counter that spell or ability unless you pay {2}',
    'counter that spell or ability unless its controller pays {2} and draw a card',
    'counter target spell or ability unless its controller pays {2}',
    'counter those spells unless its controller pays {2}',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      sequence(
        literal('counter '),
        spanned(pattern(new RegExp(`that spell(?: or ability)?${BOUNDARY}`, 'iu'))),
        literal(' unless its controller pays '),
        spanned(family<IrCost>('cost', { only: ['cost.mana'] })),
        CLAUSE_END,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, word, , cost] = r.value.value;
    const objects: IrNoun = {
      kind: 'noun',
      det: 'triggerSubject',
      filter: { raw: word.value[0].toLowerCase() },
      upTo: false,
      plural: false,
      other: false,
      span: word.span,
      rule: 'effect.counter-that-unless',
    };
    return {
      ok: true,
      value: [
        makeClause(
          'effect.counter-that-unless',
          'counterUnlessPays',
          {
            objects,
            cost: {
              kind: 'costList',
              costs: [cost.value],
              span: cost.span,
              rule: 'effect.counter-that-unless',
            },
          },
          r.value.span,
        ),
      ],
      pos: r.pos,
    };
  },
});

export const COUNTER_TRIGGER_EFFECT_RULES = [EFFECT_COUNTER_THAT_UNLESS].map(quietly);
