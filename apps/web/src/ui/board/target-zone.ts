/**
 * #23: when the player must pick a target and every legal one is a card in one graveyard, that
 * graveyard is opened for them in the Zone Picker (the targets panel keeps a button to open it again),
 * so they can read the cards (hover shows each in the preview) and pick them. Targets elsewhere (the
 * battlefield, a player, two graveyards) would be hidden by the list, so nothing is opened for them.
 */
import type { ChooseCardsDecision, GameView } from '@commander-arena/engine';
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

/** What each question that opens a picker is called in the picker's title (the cards it lists are in `zone`). */
export function questionTitle(pending: ChooseCardsDecision): string {
  if (pending.purpose === 'search') return 'Search your library';
  if (pending.zone === 'graveyard') return 'Choose from a graveyard';
  if (pending.zone === 'exile') return 'Choose from exile';
  return 'Cards';
}

/** The questions that list their cards one by one in the picker, not as a pile or as a cast (their dock panel keeps those). */
const PICKER_PURPOSES: ReadonlySet<ChooseCardsDecision['purpose']> = new Set([
  'search',
  'lookTake',
  'move',
  'exile',
  'additionalExile',
]);

/**
 * The Zone Picker a question opens by itself: the graveyard of #23, the cards of a library search (the library is hidden,
 * so the picker lists the matching cards the engine shows the searcher), the cards looked at or
 * revealed from the top of the library, or the cards a question chooses in a graveyard or in exile
 * ("return a creature card from your graveyard", "exile a card from your graveyard"). Cards of the
 * hand are already on the board, so a hand question opens nothing.
 */
export function questionZoneToOpen(view: GameView): QuestionZone | null {
  const graveyard = targetZoneToOpen(view);
  if (graveyard !== null) return { zone: graveyard, name: 'graveyard' };
  const pending = view.pending;
  if (pending?.kind !== 'chooseCards' || pending.seat !== view.viewer) return null;
  if (pending.legal.length === 0 || !PICKER_PURPOSES.has(pending.purpose)) return null;
  // "Look at the top six cards ... you may take one": the cards that can be taken, and the others beside them.
  if (pending.zone === 'library') {
    if (pending.purpose === 'search') return { zone: { kind: 'cards' }, name: 'library' };
    return pending.purpose === 'lookTake' ? { zone: { kind: 'cards' }, name: 'cards' } : null;
  }
  if (pending.zone === 'graveyard') return { zone: { kind: 'cards' }, name: 'graveyard' };
  if (pending.zone === 'exile') return { zone: { kind: 'cards' }, name: 'exile' };
  return null;
}

/** True when both name the same zone to list. */
export function sameZone(a: ZoneRef, b: ZoneRef): boolean {
  if (a.kind !== b.kind) return false;
  return 'seat' in a && 'seat' in b ? a.seat === b.seat : true;
}
