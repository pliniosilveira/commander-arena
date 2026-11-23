/**
 * The printings a decklist names, such as `1x Ghoulcaller Gisa (fdc) 6` (an Archidekt export, or a precon made from one). The board
 * draws a card in the printing its deck lists (`useListedArt`, `commander-art.ts`); a card whose list names none is drawn by name.
 * The printings are kept by card name: when both decks list the same card in different printings, the deck prepared last wins.
 */
import { frontFaceName, parseDecklist } from '@commander-arena/cards';

export interface CardPrinting {
  /** Lower-case set code. */
  readonly set: string;
  readonly collector: string;
  /** The player chose this printing for the deck (`CHOSEN_TAG`): it beats the special commander art of issue 366. */
  readonly explicit: boolean;
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
        printing: {
          set: entry.set,
          collector: entry.collector,
          explicit: entry.tags.includes(CHOSEN_TAG),
        },
      };
    }
  }
  return null;
}

/** Remember the printings a deck's text names, for its commander and its main deck, so the board can draw them. */
export function registerDeckPrintings(text: string): void {
  const { sections } = parseDecklist(text);
  for (const entry of [...sections.commander, ...sections.main]) {
    if (entry.set !== null && entry.collector !== null) {
      known.set(keyOf(entry.name), {
        set: entry.set,
        collector: entry.collector,
        explicit: entry.tags.includes(CHOSEN_TAG),
      });
    }
  }
}

/** The printing a registered deck lists for the card `name`, or null. */
export const printingOf = (name: string): CardPrinting | null => known.get(keyOf(name)) ?? null;
