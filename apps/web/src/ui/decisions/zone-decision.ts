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

/**
 * The Zone Picker can be closed to look at the board and opened again while its question is pending,
 * but the question can only be confirmed with it open. The decision layer owns this state: the board
 * reports whether the picker of the question's zone is open and obeys a request to open it again;
 * the layer disables Confirm while it is closed and offers the button that opens it.
 */
export interface ZoneGate {
  /** True while the picker of the question's zone is open. */
  readonly open: boolean;
  setOpen(open: boolean): void;
  /** Changes each time the player asks to open the picker again. */
  readonly request: number;
}

const NO_GATE: ZoneGate = { open: false, setOpen: () => {}, request: 0 };

const ZoneGateContext = createContext<ZoneGate>(NO_GATE);

export const ZoneGateProvider = ZoneGateContext.Provider;

export function useZoneGate(): ZoneGate {
  return useContext(ZoneGateContext);
}

/** The bar while the picker is closed: Confirm and the other buttons wait, and one opens the picker. */
export function barWhileClosed(bar: BarModel, zoneName: string, reopen: () => void): BarModel {
  return {
    ...bar,
    buttons: [
      ...bar.buttons.map((b) => ({
        ...b,
        disabled: true,
        hint: `Open the ${zoneName} to choose and confirm`,
      })),
      {
        key: 'open-zone',
        label: `Open ${zoneName}`,
        variant: 'secondary' as const,
        disabled: false,
        hint: null,
        run: reopen,
      },
    ],
  };
}
