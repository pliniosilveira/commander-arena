/**
 * Where the action dock is drawn (issue 47). The dock is the prompt, the buttons and the panels of
 * the pending decision; it lives in the column of the stack, at its foot just above Settings
 * (D-146), so the player has the button where the hand expects it whatever the stack holds, and the
 * stack above it grows downward. The decision layer builds the dock (it owns the decision), the
 * game screen owns the column, so the layer portals the dock into this slot element.
 *
 * `undefined` (no provider: a test that renders the layer alone) draws the dock inside the layer;
 * `null` is a provider whose slot has not mounted yet, and nothing is drawn until it has.
 */
import { createContext, useContext } from 'react';

export const DockSlotContext = createContext<HTMLElement | null | undefined>(undefined);

export const useDockSlot = (): HTMLElement | null | undefined => useContext(DockSlotContext);
