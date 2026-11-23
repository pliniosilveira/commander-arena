/**
 * Creature tile scale (issue 560): the table board (3 and 4 seats) draws the creature tiles 10%
 * smaller than the 1v1 board, to leave room for the other battlefields. The 1v1 board has no
 * provider, so its scale stays 1.
 */
import { createContext, useContext } from 'react';

export const TABLE_CREATURE_SCALE = 0.9;

export const CreatureScaleContext = createContext(1);

export function useCreatureScale(): number {
  return useContext(CreatureScaleContext);
}
