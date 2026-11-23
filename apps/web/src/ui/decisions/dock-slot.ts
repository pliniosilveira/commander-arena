/**
 * Where the action dock is drawn. The dock is the panels of the pending decision and then the
 * prompt and the buttons; it lives in the turn panel at the right edge, between the current phase
 * and the stack. The decision layer builds the dock (it owns the decision), the game screen owns the
 * slot element, so the layer portals the dock into it.
 *
 * `undefined` (no provider: a test that renders the layer alone) draws the dock inside the layer;
 * `null` is a provider whose slot has not mounted yet, and nothing is drawn until it has.
 */
import { createContext, useContext } from 'react';

export const DockSlotContext = createContext<HTMLElement | null | undefined>(undefined);

export const useDockSlot = (): HTMLElement | null | undefined => useContext(DockSlotContext);
