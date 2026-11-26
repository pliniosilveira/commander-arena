/**
 * CasualAgent's answer to "As this creature enters, remove all counters from any number of artifacts, creatures, and enchantments" (`purpose` 'entersRemoveCounters', Sin, Unending
 * Cataclysm, CR 614.12, 122.1). The permanent enters with counters for the number removed, so a permanent whose counters the agent does not value is worth taking them from. Deterministic:
 * it reads the view and uses no randomness.
 */
import type { Action, ChoosePermanentDecision, GameView } from '@commander-arena/engine';
import { findObject } from './casual-view';

/** The counters nobody wants on their permanent: removing them from the agent's own permanents only helps it. */
const DRAWBACKS: readonly string[] = ['-1/-1'];

/**
 * The permanents an opponent controls that have a counter (never a permanent that only has -1/-1 counters, which are the opponent's drawback), and the agent's own permanents that
 * only have counters that hurt them. Answering with none is always legal; the agent never gives up a counter that helps it, its own +1/+1, charge or loyalty-like counters included.
 */
export function chooseCountersToRemove(view: GameView, d: ChoosePermanentDecision): Action {
  const chosen = d.legal.filter((id) => {
    const o = findObject(view, id);
    if (o === undefined) return false;
    const kinds = Object.entries(o.counters)
      .filter(([, n]) => n > 0)
      .map(([kind]) => kind);
    if (kinds.length === 0) return false;
    return o.controller === view.viewer
      ? kinds.every((kind) => DRAWBACKS.includes(kind))
      : kinds.some((kind) => !DRAWBACKS.includes(kind));
  });
  return { kind: 'choosePermanents', objects: chosen.slice(0, d.max) };
}
