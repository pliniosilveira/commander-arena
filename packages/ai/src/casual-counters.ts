/**
 * CasualAgent and counters (D-149): which permanents and players get another counter from proliferate (CR 701.34a), and what an Aura that
 * enters by an effect enchants (CR 303.4f). Heuristics, deliberately simple.
 */
import type {
  Action,
  ChoosePermanentDecision,
  GameView,
  ObjectView,
} from '@commander-arena/engine';
import { auraIsHostile, isAura } from './casual-attachments';
import { findObject, isCreature, powerOf } from './casual-view';

/** Counters that hurt the permanent that has them; every other kind is taken as good for it. */
const BAD_COUNTERS: readonly string[] = ['-1/-1', 'stun'];

const counted = (o: ObjectView, bad: boolean): number =>
  Object.entries(o.counters).reduce(
    (sum, [kind, n]) => sum + (BAD_COUNTERS.includes(kind) === bad ? n : 0),
    0,
  );

/**
 * Proliferate: every permanent the agent controls that has more good counters than bad (it gets one more of each kind, so a +1/+1 counter
 * next to a -1/-1 counter is a wash), and every opponent's permanent that has more bad counters than good (a -1/-1 or stun counter);
 * and the opponents, who can only have poison counters that hurt them. Never itself.
 */
export function chooseProliferate(view: GameView, d: ChoosePermanentDecision): Action {
  const objects = d.legal.filter((id) => {
    const o = findObject(view, id);
    if (o === undefined) return false;
    const good = counted(o, false);
    const bad = counted(o, true);
    return o.controller === view.viewer ? good > bad : bad > good;
  });
  const players = (d.players ?? []).filter((seat) => seat !== view.viewer);
  return { kind: 'choosePermanents', objects, ...(players.length > 0 ? { players } : {}) };
}

/**
 * What an Aura that enters the battlefield by an effect enchants (`purpose: 'auraHost'`, exactly one of `legal`): on a hostile Aura the
 * opponent's creature with the most power, otherwise the agent's own (the best creature, like an Aura it casts, casual-attachments.ts).
 * With no permanent on the side it wants, the first the engine lists.
 */
export function chooseAuraHost(view: GameView, d: ChoosePermanentDecision): Action {
  const aura = d.subject === undefined ? undefined : findObject(view, d.subject);
  const hostile = aura !== undefined && isAura(aura) && auraIsHostile(aura);
  const hosts = d.legal.flatMap((id, index) => {
    const o = findObject(view, id);
    return o === undefined ? [] : [{ id, index, o }];
  });
  const sided = hosts.filter((h) => (h.o.controller !== view.viewer) === hostile);
  const pool = sided.length > 0 ? sided : hosts;
  // The creature with the most power; a permanent that is not a creature ranks below every creature. The first in the list wins a tie.
  const rank = (h: { o: ObjectView }): number => (isCreature(h.o) ? powerOf(h.o) : -1);
  let best: { id: ChoosePermanentDecision['legal'][number]; o: ObjectView } | undefined;
  for (const h of pool) if (best === undefined || rank(h) > rank(best)) best = h;
  const chosen = best?.id ?? d.legal[0];
  return { kind: 'choosePermanents', objects: chosen === undefined ? [] : [chosen] };
}
