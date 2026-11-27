/**
 * Condition of Kodama of the East Tree: "it wasn't put onto the battlefield with this ability" (CR 603.4, 400.7), the intervening "if" of a trigger about a permanent that enters.
 * The lowering reads it as the negation of the engine's `subjectMatches` with `putWithSource`: the permanent the event is about does not remember the source of this ability as the one
 * whose ability put it there. Every object has abilities of its own, so another permanent's ability that puts the same kind of card there does not make it true or false.
 */
import { pattern } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { defineRule } from '../registry';

const ID = 'condition.not-put-with-this-ability';

/**
 * `condition.not-put-with-this-ability`: "it wasn't put onto the battlefield with this ability" (the permanent that entered, not put there by an ability of this permanent). Only the whole
 * phrase. Not read: "it was put ..." (the other way round), another ability ("with that ability"), "this spell", another zone, a missing "with this ability".
 */
export const CONDITION_NOT_PUT_WITH_THIS_ABILITY = defineRule<IrCondition>({
  id: ID,
  family: 'condition',
  leading: ['it'],
  cites: ['CR 603.4 (Handling Triggered Abilities)', 'CR 400.7 (General)'],
  examples: [
    "it wasn't put onto the battlefield with this ability",
    'it wasn’t put onto the battlefield with this ability',
    "It wasn't put onto the battlefield with this ability",
  ],
  rejects: [
    'it was put onto the battlefield with this ability',
    "it wasn't put onto the battlefield with that ability",
    "it wasn't put onto the battlefield with this spell",
    "it wasn't put onto the battlefield",
    "it wasn't put onto the battlefield with this ability or",
    "it wasn't put into your hand with this ability",
    "they weren't put onto the battlefield with this ability",
    "it wasn't put onto the battlefield with this abilityx",
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /it wasn['’]t put onto the battlefield with this ability(?![\p{L}\p{N}'’])(?! or\b)/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'notPutWithThisAbility' },
        span: { start: pos, end: r.pos },
        rule: ID,
      },
      pos: r.pos,
    };
  },
});

export const PUT_WITH_THIS_ABILITY_CONDITION_RULES = [CONDITION_NOT_PUT_WITH_THIS_ABILITY];
