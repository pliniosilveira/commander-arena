/**
 * "Each player who owns a spell you cast this way loses life equal to its mana value" (Kefka, Dancing Mad, issue 97; CR 202.3, 119.3, 101.4): the `loseLifeManaValue` effect. Of the objects an earlier
 * effect remembered only the spells still on the stack count (a card that was not cast is in exile, and the new object a cast makes is on the stack: CR 400.7, 601.2a); each owner loses life equal to
 * the mana value of their spell, owners in APNAP order. A player who owns several loses once for each.
 */
import type { ObjectId } from '../ids';
import type { GameEvent } from '../state/events';
import type { GameState } from '../state/types';
import { derive } from './derive';
import { loseLifeOf } from './effect-support';
import { manaValueOfCost } from './mana-value';
import { apnapOrder } from './select';
import { done, type StepOutcome } from './step-outcome';

export function runLoseLifeManaValue(state: GameState, moved: readonly ObjectId[]): StepOutcome {
  const spells = [...new Set(moved)].flatMap((id) => {
    const obj = state.objects[id];
    return obj !== undefined && obj.zone === 'stack'
      ? [{ owner: obj.owner, value: manaValueOfCost(derive(state, obj).manaCost, obj) }]
      : [];
  });
  let next = state;
  const events: GameEvent[] = [];
  for (const seat of apnapOrder(
    state,
    spells.map((s) => s.owner),
  )) {
    for (const spell of spells.filter((s) => s.owner === seat)) {
      const r = loseLifeOf(next, seat, spell.value);
      next = r.state;
      events.push(...r.events);
    }
  }
  return done(next, events);
}
