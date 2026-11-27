/**
 * Condition of Arvinox, the Mind Flail: "you control three or more permanents you don't own" (CR 108.3, 110.2, 611.3a), a count of the permanents the controller controls whose owner is
 * another player. The lowering is the engine's `controlsAtLeast` over a filter with `notOwnedByYou`.
 */
import { literal, pattern, satisfy, sequence } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { quantity } from '../amount/index';
import { defineRule, spanned } from '../registry';

const ID = 'condition.control-at-least-not-owned';

/**
 * `condition.control-at-least-not-owned`: "you control three or more permanents you don't own" (Arvinox, the Mind Flail; CR 108.3: the owner of a card is the player who started the game
 * with it in their deck; 110.2, 613.1d): the permanents of any kind that the controller controls and does not own (a stolen creature, a token an opponent made). It is not "an opponent controls":
 * the count is by owner, not by who else controls anything. The engine's `controlsAtLeast` with `notOwnedByYou`. Not read: "own", a kind of permanent, "other", a count of one or "N" without "or
 * more", "or fewer", another player than "you", a second condition.
 */
export const CONDITION_CONTROL_AT_LEAST_NOT_OWNED = defineRule<IrCondition>({
  id: ID,
  family: 'condition',
  leading: ['you'],
  cites: [
    'CR 108.3 (Cards)',
    'CR 110.2 (Permanents)',
    'CR 611.3a (Continuous Effects)',
    'CR 613.1d (Interaction of Continuous Effects)',
  ],
  examples: [
    "you control three or more permanents you don't own",
    'you control three or more permanents you don’t own',
    "you control two or more permanents you don't own",
  ],
  rejects: [
    "you control three or more creatures you don't own",
    'you control three or more permanents you own',
    'you control three or more permanents your opponents own',
    "you control three or more other permanents you don't own",
    "you control a permanent you don't own",
    "you control three permanents you don't own",
    "you control three or fewer permanents you don't own",
    "an opponent controls three or more permanents you don't own",
    "you control three or more permanents you don't own and a creature",
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      sequence(
        literal('you control '),
        satisfy(quantity, (n) => n >= 2),
        pattern(/ or more permanents you don['’]t own(?![\p{L}\p{N}])(?! and\b)/iu),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const { span } = r.value;
    const count = r.value.value[1];
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: {
          kind: 'control',
          noun: {
            kind: 'noun',
            det: 'a',
            filter: { notOwnedByYou: true, raw: "permanents you don't own" },
            upTo: false,
            plural: true,
            other: false,
            span,
            rule: ID,
          },
          atLeast: { kind: 'number', value: count, span },
        },
        span,
        rule: ID,
      },
      pos: r.pos,
    };
  },
});

export const ARVINOX_CONDITION_RULES = [CONDITION_CONTROL_AT_LEAST_NOT_OWNED];
