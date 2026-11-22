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

/** The zone a question opens by itself, and what the player calls it ("Open graveyard"). */
export interface QuestionZone {
  readonly zone: ZoneRef;
  readonly name: string;
}

/**
 * The Zone Picker a question opens by itself: the graveyard of #23, or the cards of a library search
 * (the library is hidden, so the picker lists the matching cards the engine shows the searcher).
 */
export function questionZoneToOpen(view: GameView): QuestionZone | null {
  const graveyard = targetZoneToOpen(view);
  if (graveyard !== null) return { zone: graveyard, name: 'graveyard' };
  const pending = view.pending;
  if (pending?.kind !== 'chooseCards' || pending.seat !== view.viewer) return null;
  if (pending.zone !== 'library' || pending.purpose !== 'search' || pending.legal.length === 0) {
    return null;
  }
  return { zone: { kind: 'cards' }, name: 'library' };
}

/** True when both name the same zone to list. */
export function sameZone(a: ZoneRef, b: ZoneRef): boolean {
  if (a.kind !== b.kind) return false;
  return 'seat' in a && 'seat' in b ? a.seat === b.seat : true;
}
