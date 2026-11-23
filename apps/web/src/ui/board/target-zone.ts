/**
 * #23: when the player must pick a target and every legal one is a card in one graveyard, the targets
 * panel offers a button that opens that graveyard (never opened by itself), so they can read the cards
 * (hover shows each in the preview) and pick one. Targets elsewhere (the battlefield, a player, two
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
 * The Zone Picker a question opens by itself: the cards of a library search
 * (the library is hidden, so the picker lists the matching cards the engine shows the searcher), or
 * the cards looked at or revealed from the top of the library.
 */
export function questionZoneToOpen(view: GameView): QuestionZone | null {
  const pending = view.pending;
  if (pending?.kind !== 'chooseCards' || pending.seat !== view.viewer) return null;
  if (pending.zone !== 'library' || pending.legal.length === 0) return null;
  if (pending.purpose === 'search') return { zone: { kind: 'cards' }, name: 'library' };
  // "Look at the top six cards ... you may take one": the cards that can be taken, and the others beside them.
  if (pending.purpose === 'lookTake') return { zone: { kind: 'cards' }, name: 'cards' };
  return null;
}

/** True when both name the same zone to list. */
export function sameZone(a: ZoneRef, b: ZoneRef): boolean {
  if (a.kind !== b.kind) return false;
  return 'seat' in a && 'seat' in b ? a.seat === b.seat : true;
}
