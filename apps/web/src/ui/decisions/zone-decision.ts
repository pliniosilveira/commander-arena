/**
 * What the Zone Picker (`board/ZoneViewer.tsx`, docs/BOARD_COMPONENTS.md) needs from the decision
 * in progress: the action bar's prompt, count and buttons, and the spell or ability that asks.
 * The decision layer provides it while a targets or chooseCards question is pending and the bar is
 * not drawn by an overlay of its own; outside that the viewer is a plain list and this is null.
 */
import type { ObjectId } from '@commander-arena/engine';
import { createContext, useContext } from 'react';
import type { BarModel } from './model';

export interface ZoneDecision {
  readonly bar: BarModel;
  /** The spell or ability on the stack that asks (the card whose preview sits beside the list). */
  readonly source: ObjectId;
}

const ZoneDecisionContext = createContext<ZoneDecision | null>(null);

export const ZoneDecisionProvider = ZoneDecisionContext.Provider;

export function useZoneDecision(): ZoneDecision | null {
  return useContext(ZoneDecisionContext);
}
