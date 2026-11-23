/**
 * The Zone Picker of a pending question, for every board (the 1v1 `Board` and the `TableBoard`): a
 * question whose cards are in a library, a graveyard or exile opens its picker by itself and closes
 * it when the question is answered; the player can close it to look at the board and open it again
 * with the button of the decision layer, which holds Confirm back while it is closed
 * (`decisions/zone-decision.ts`). Without this the layer waits for a picker no board opens.
 */
import type { GameView } from '@commander-arena/engine';
import { useEffect, useRef } from 'react';
import { useZoneGate } from '../decisions/zone-decision';
import type { ZoneRef } from './PlayerStrip';
import { questionZoneToOpen, sameZone, targetZoneToOpen } from './target-zone';
import { useCloseOnDecision } from './useCloseOnDecision';

export function useQuestionZone(
  view: GameView | null,
  zone: ZoneRef | null,
  setZone: (zone: ZoneRef | null) => void,
): void {
  useCloseOnDecision(view, () => setZone(null));
  // #23: a question whose legal targets are all in one graveyard opens it, and closing it again
  // when the question is answered is the board's doing too, not the player's chore.
  const toOpen = view === null ? null : (questionZoneToOpen(view)?.zone ?? null);
  // What the effects below depend on: the zone as a key, so a new view of the same question does not reopen it.
  const toOpenKey = toOpen === null ? null : `${toOpen.kind}${'seat' in toOpen ? toOpen.seat : ''}`;
  const toOpenRef = useRef(toOpen);
  toOpenRef.current = toOpen;
  // The graveyard of a targets question opens only when the player asks for it (the panel's button).
  const askable = view === null ? null : targetZoneToOpen(view);
  const askableRef = useRef(askable);
  askableRef.current = askable;
  const setZoneRef = useRef(setZone);
  setZoneRef.current = setZone;
  const autoOpened = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `toOpenKey` is what tells a new question; the zone itself is read from the ref
  useEffect(() => {
    if (toOpenRef.current !== null) {
      setZoneRef.current(toOpenRef.current);
      autoOpened.current = true;
    } else if (autoOpened.current) {
      setZoneRef.current(null);
      autoOpened.current = false;
    }
  }, [toOpenKey]);
  // The picker of the question's zone can be closed to look at the board and opened again.
  const gate = useZoneGate();
  const questionOpen = toOpen !== null && zone !== null && sameZone(zone, toOpen);
  const { setOpen: reportOpen, request } = gate;
  useEffect(() => reportOpen(questionOpen), [questionOpen, reportOpen]);
  const lastRequest = useRef(request);
  useEffect(() => {
    if (request === lastRequest.current) return;
    lastRequest.current = request;
    const asked = toOpenRef.current ?? askableRef.current;
    if (asked !== null) setZoneRef.current(asked);
  }, [request]);
}
