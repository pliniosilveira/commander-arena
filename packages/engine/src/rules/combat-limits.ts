/**
 * "No more than one creature can attack each combat" and "No more than one creature can block each combat" (CR 508.1c, 509.1b, 604.1; Silent Arbiter): the static ability
 * `combatCreatureLimit` of a permanent on the battlefield, read from the abilities it has now. The least limit of the permanents that have one applies.
 */
import type { GameState } from '../state/types';
import { derive } from './derive';
import { mayHaveStatic } from './printed-statics';

/** The most creatures that can attack (`attack`) or block (`block`) in a combat, or null when nothing limits them. */
export function combatCreatureLimit(state: GameState, what: 'attack' | 'block'): number | null {
  let least: number | null = null;
  for (const id of state.battlefield) {
    const obj = state.objects[id];
    if (obj === undefined || !mayHaveStatic(state, obj, 'combatCreatureLimit')) continue;
    for (const a of derive(state, obj).abilities) {
      if (
        a.kind === 'static' &&
        a.static.kind === 'combatCreatureLimit' &&
        a.static.what === what
      ) {
        least = least === null ? a.static.max : Math.min(least, a.static.max);
      }
    }
  }
  return least;
}

/** How many more creatures may be declared as blockers in this combat: the limit less the creatures already declared (several defending players declare one after the other); null with no limit. */
export function blockersLeft(state: GameState): number | null {
  const limit = combatCreatureLimit(state, 'block');
  if (limit === null) return null;
  const declared = new Set((state.combat?.blocks ?? []).map((b) => b.blocker)).size;
  return Math.max(0, limit - declared);
}
