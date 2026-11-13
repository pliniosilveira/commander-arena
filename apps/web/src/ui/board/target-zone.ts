/**
 * #23: when the player must pick a target and every legal one is a card in one graveyard, that
 * graveyard is opened for them, so they can read the cards (hover shows each in the preview) and
 * pick one without hunting for the button. Targets elsewhere (the battlefield, a player, two
 * graveyards) would be hidden by the list, so nothing is opened for them.
 */
import type { GameView } from '@commander-arena/engine';
import { allLegalTargets } from '../decisions/targeting';
import type { ZoneRef } from './PlayerStrip';

export function targetZoneToOpen(view: GameView): ZoneRef | null {
  const pending = view.pending;
  if (pending?.kind !== 'targets' || pending.seat !== view.viewer) return null;
  const legal = allLegalTargets(pending.specs);
  if (legal.length === 0) return null;
  let found: number | null = null;
  for (const t of legal) {
    if (t.kind !== 'object') return null;
    const owner = view.seats.find((s) => s.graveyard.some((o) => o.id === t.id))?.id;
    if (owner === undefined || (found !== null && found !== owner)) return null;
    found = owner;
  }
  return found === null ? null : { kind: 'graveyard', seat: found };
}
