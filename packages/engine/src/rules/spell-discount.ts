/**
 * "Until your next turn, instant, sorcery, and planeswalker spells that player casts cost {2} less to cast" (`playerSpellsCostLess`, Will Kenrith; CR 601.2f, 118.7a, 611.2a, 500.1).
 * The effect makes one `spellsCostLess` continuous effect for each player it names, with no set of objects, that lasts until the next turn of the controller of the effect begins (the turn
 * it resolves in is not counted, as for `requireAttack`). Every spell that player casts and the filter describes is reduced by it, not only the next one, and the reduction is read where the
 * cost is determined (`reductionFor` in `rules/cast-cost.ts`).
 */
import type { Effect } from '../ast/types';
import type { SeatId } from '../ids';
import { allocateTimestamp } from '../state/ops';
import type { ChosenTarget, ContinuousEffect, GameObject, GameState } from '../state/types';
import { matchesFilter, resolvePlayers, type SelectContext } from './select';
import { done, type StepOutcome } from './step-outcome';

/** The effect: the players are found as it resolves (CR 611.2c); a player who is gone is not reduced. */
export function runPlayerSpellsCostLess(
  state: GameState,
  node: Extract<Effect, { kind: 'playerSpellsCostLess' }>,
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
): StepOutcome {
  let next = state;
  const made: ContinuousEffect[] = [];
  for (const seat of resolvePlayers(state, node.player, ctx, targets)) {
    const [timestamp, stamped] = allocateTimestamp(next);
    next = stamped;
    made.push({
      id: `ce${timestamp}`,
      timestamp,
      objects: [],
      // CR 500.1, 611.2a: it ends as the next turn of the controller of the effect begins, the turn it resolves in not counted.
      until: {
        kind: 'turnStart',
        seat: ctx.controller,
        turnsTaken: (next.seats[ctx.controller]?.turnsTaken ?? 0) + 1,
      },
      change: { kind: 'spellsCostLess', seat, spells: node.spells, lessGeneric: node.amount },
    });
  }
  return done({ ...next, continuousEffects: [...next.continuousEffects, ...made] });
}

/** CR 601.2f, 118.7a: how much generic mana the cost of `spell` goes down by for `seat`, from the effects that name `seat` and describe the spell (a spell being cast: matched as on the stack, CR 601.2a). */
export function playerSpellDiscount(state: GameState, seat: SeatId, spell: GameObject): number {
  const ctx: SelectContext = { controller: seat, source: spell.id };
  let total = 0;
  for (const e of state.continuousEffects) {
    if (e.change.kind !== 'spellsCostLess' || e.change.seat !== seat) continue;
    if (matchesFilter(state, spell, { ...e.change.spells, zone: 'stack' }, ctx)) {
      total += e.change.lessGeneric;
    }
  }
  return total;
}
