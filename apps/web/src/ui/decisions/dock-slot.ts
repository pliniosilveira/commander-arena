/**
 * Where the action dock is drawn. The dock is the prompt, the buttons and the panels of the pending
 * decision; it lives in the player's own board, at its bottom right, so the player has the button
 * where the hand expects it. The decision layer builds the dock (it owns the decision), the board
 * owns the slot element, so the layer portals the dock into this slot. The board registers its slot
 * through `DockSlotSetContext`; the game screen keeps it and hands it to the layer.
 *
 * `undefined` (no provider: a test that renders the layer alone) draws the dock inside the layer;
 * `null` is a provider whose slot has not mounted yet, and nothing is drawn until it has.
 */
import { createContext, useContext } from 'react';

export const DockSlotSetContext = createContext<(slot: HTMLElement | null) => void>(() => {});

export const DockSlotContext = createContext<HTMLElement | null | undefined>(undefined);

export const useDockSlot = (): HTMLElement | null | undefined => useContext(DockSlotContext);
