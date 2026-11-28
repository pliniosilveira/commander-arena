/**
 * "When you next cast a creature spell this turn, that creature enters with two additional +1/+1 counters on it" (`spellEntersWithCounters`, Yuna, Grand Summoner; CR 603.7, 614.1c, 122.6).
 * The body of a delayed cast trigger: the spell that was cast (the trigger's subject) remembers the counters (`StackData.entersWithCounters`), and the permanent it becomes enters with them
 * (`moveObject`, rules/zones.ts). A spell that is no longer on the stack as the ability resolves (it was countered in response) gets nothing.
 */
import type { Effect } from '../ast/types';
import { setObject } from '../state/ops';
import type { ChosenTarget, GameState } from '../state/types';
import { amountOf } from './amounts';
import type { SelectContext } from './select';
import { done, type StepOutcome } from './step-outcome';

export function runSpellEntersWithCounters(
  state: GameState,
  effect: Extract<Effect, { kind: 'spellEntersWithCounters' }>,
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
): StepOutcome {
  const id = ctx.triggerSubject;
  const spell = id === undefined ? undefined : state.objects[id];
  const stack = spell?.stack;
  if (spell === undefined || spell.zone !== 'stack' || stack === null || stack === undefined) {
    return done(state);
  }
  // CR 608.2h (Communal Brewing): an amount is read as the ability resolves; 0 adds nothing.
  const count = amountOf(state, effect.count, ctx, targets);
  if (count <= 0) return done(state);
  const counters = { ...(stack.entersWithCounters ?? {}) };
  counters[effect.counter] = (counters[effect.counter] ?? 0) + count;
  return done(setObject(state, { ...spell, stack: { ...stack, entersWithCounters: counters } }));
}
