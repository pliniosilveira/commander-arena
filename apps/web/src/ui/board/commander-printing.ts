/**
 * The printing a decklist names for its commander, such as `1x Ghoulcaller Gisa (fdc) 6` (an Archidekt export or a precon made from
 * one). The board draws that exact printing; a list that names none keeps the search of `commander-art.ts`.
 */
import { frontFaceName, parseDecklist } from '@commander-arena/cards';

export interface CommanderPrinting {
  /** Lower-case set code. */
  readonly set: string;
  readonly collector: string;
}

const known = new Map<string, CommanderPrinting>();
const keyOf = (name: string): string => frontFaceName(name).toLowerCase();

/** The printing of the first commander line of `text` that names one, with the card's name; null when no line does. */
export function commanderPrintingOf(
  text: string,
): { name: string; printing: CommanderPrinting } | null {
  for (const entry of parseDecklist(text).sections.commander) {
    if (entry.set !== null && entry.collector !== null) {
      return { name: entry.name, printing: { set: entry.set, collector: entry.collector } };
    }
  }
  return null;
}

/** Remember the commander printing a deck's text names, so the board can draw it. Later decks replace earlier ones for the same commander. */
export function registerCommanderPrinting(text: string): void {
  const found = commanderPrintingOf(text);
  if (found !== null) known.set(keyOf(found.name), found.printing);
}

export const printingOfCommander = (name: string): CommanderPrinting | null =>
  known.get(keyOf(name)) ?? null;
