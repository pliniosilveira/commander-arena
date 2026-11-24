/**
 * The printings a decklist names, such as `1x Ghoulcaller Gisa (fdc) 6` (an Archidekt export, or a precon made from one). The board
 * draws a card in the printing its deck lists (`useListedArt`, `commander-art.ts`); a card whose list names none is drawn by name.
 * The printings are kept by card name for the one game on the table (`setGamePrintings`): when both decks list the same card in
 * different printings (basic lands, above all), the player's deck is the one drawn.
 */
import { frontFaceName, parseDecklist } from '@commander-arena/cards';

export interface CardPrinting {
  /** Lower-case set code. */
  readonly set: string;
  readonly collector: string;
}

/** The tag a printing chosen on the deck screen carries on its line: `1 Name (fdc) 6 ^Chosen printing^`. */
export const CHOSEN_TAG = 'Chosen printing';

const known = new Map<string, CardPrinting>();
const keyOf = (name: string): string => frontFaceName(name).toLowerCase();

/** The printing of the first commander line of `text` that names one, with the card's name; null when no line does. */
export function commanderPrintingOf(text: string): { name: string; printing: CardPrinting } | null {
  for (const entry of parseDecklist(text).sections.commander) {
    if (entry.set !== null && entry.collector !== null) {
      return {
        name: entry.name,
        printing: { set: entry.set, collector: entry.collector },
      };
    }
  }
  return null;
}

/** Adds the printings a deck's text names, for its commander and its main deck: a later deck wins on a card both name. */
function registerDeckPrintings(text: string): void {
  const { sections } = parseDecklist(text);
  for (const entry of [...sections.commander, ...sections.main]) {
    if (entry.set !== null && entry.collector !== null) {
      known.set(keyOf(entry.name), { set: entry.set, collector: entry.collector });
    }
  }
}

/**
 * The printings the board draws in the game that starts now, from the lists of the decks in it: the earlier lists first and the
 * player's own last, so on a card that several decks name (a basic land) the player's choice is the one drawn. It replaces what an
 * earlier game left, so a printing chosen in one deck never shows in another game.
 */
export function setGamePrintings(texts: readonly string[]): void {
  known.clear();
  for (const text of texts) registerDeckPrintings(text);
}

/** The printing a registered deck lists for the card `name`, or null. */
export const printingOf = (name: string): CardPrinting | null => known.get(keyOf(name)) ?? null;
