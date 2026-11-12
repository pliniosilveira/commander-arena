/**
 * "Untap all creatures you control during each other player's untap step." (CR 502.3, D-229, Drumbellower), and, with `self` (D-983),
 * "Untap this artifact during each other player's untap step." (the permanent itself). The active player's own
 * permanents untap as the step begins (`rules/flow.ts`); a static ability of another player's permanent adds the permanents it names, that
 * player controls, to the ones that untap with them. It does not ask the player anything and does not look at "doesn't untap during your untap
 * step" (a permanent with that restriction still untaps in the untap step of another player). A stun counter is removed instead
 * (CR 122.1d, `untapPermanent`).
 */
import type { ObjectId, SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import { getObject } from '../state/ops';
import type { GameState } from '../state/types';
import { controllerOf } from './control';
import { derive } from './derive';
import { mayHaveStatic } from './printed-statics';
import { matchesFilter } from './select';
import { untapPermanent } from './untap';

/** The permanents that untap in the untap step of `active` because of a static ability of a permanent of another player, each once, in battlefield order. */
export function untappedByOthers(state: GameState, active: SeatId): ObjectId[] {
  const chosen = new Set<ObjectId>();
  for (const sourceId of state.battlefield) {
    const source = getObject(state, sourceId);
    const holder = controllerOf(state, source);
    if (holder === active || !mayHaveStatic(state, source, 'untapInOthersUntapStep')) continue;
    for (const ability of derive(state, source).abilities) {
      if (ability.kind !== 'static' || ability.static.kind !== 'untapInOthersUntapStep') continue;
      const { what } = ability.static;
      if (what === undefined) {
        // D-983 ("Untap this artifact during each other player's untap step"): the permanent itself, when it is tapped.
        if (source.tapped) chosen.add(sourceId);
        continue;
      }
      for (const id of state.battlefield) {
        const obj = getObject(state, id);
        if (!obj.tapped || chosen.has(id)) continue;
        if (matchesFilter(state, obj, what, { controller: holder, source: sourceId })) {
          chosen.add(id);
        }
      }
    }
  }
  return [...chosen];
}

/** The untap of those permanents, at the same time as the active player's own. */
export function untapForOthers(
  state: GameState,
  active: SeatId,
): { readonly state: GameState; readonly events: readonly GameEvent[] } {
  let next = state;
  const events: GameEvent[] = [];
  for (const id of untappedByOthers(state, active)) {
    const r = untapPermanent(next, id);
    next = r.state;
    events.push(...r.events);
  }
  return { state: next, events };
}
