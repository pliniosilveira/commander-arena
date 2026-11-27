/**
 * The printings a decklist names, such as `1x Ghoulcaller Gisa (fdc) 6` (an Archidekt export, or a precon made from one). The board
 * draws a card in the printing its deck lists (`useListedArt`, `commander-art.ts`); a card whose list names none is drawn by name.
 * The printings are kept by seat and card name for the one game on the table (`setGamePrintings`): a card is drawn in the printing
 * its owner's deck lists, so two decks that list the same card in different printings (basic lands, above all) each keep their own.
 * The names of every card the decks list are kept too (`isGameCard`): a token with one of those names is a copy of that card.
 */
import { frontFaceName, parseDecklist } from '@commander-arena/cards';

export interface CardPrinting {
  /** Lower-case set code. */
  readonly set: string;
  readonly collector: string;
}

/** The tag a printing chosen on the deck screen carries on its line: `1 Name (fdc) 6 ^Chosen printing^`. */
export const CHOSEN_TAG = 'Chosen printing';

/** Seat id, then card name. */
const known = new Map<number, Map<string, CardPrinting>>();
/** The names of the cards the game's decks list, commanders included. */
const names = new Set<string>();
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

/** The printings a deck's text names, for its commander and its main deck, by card name. */
function deckPrintings(text: string): Map<string, CardPrinting> {
  const printings = new Map<string, CardPrinting>();
  const { sections } = parseDecklist(text);
  for (const entry of [...sections.commander, ...sections.main]) {
    if (entry.set !== null && entry.collector !== null) {
      printings.set(keyOf(entry.name), { set: entry.set, collector: entry.collector });
    }
  }
  return printings;
}

/**
 * The printings the board draws in the game that starts now: `texts[seat]` is the list of the deck that seat plays (the human is
 * seat 0, the opponents follow). It replaces what an earlier game left, so a printing chosen in one deck never shows in another
 * game, or on another player's copy of the same card.
 */
export function setGamePrintings(texts: readonly string[]): void {
  known.clear();
  names.clear();
  texts.forEach((text, seat) => {
    known.set(seat, deckPrintings(text));
    const { sections } = parseDecklist(text);
    for (const entry of [...sections.commander, ...sections.main]) names.add(keyOf(entry.name));
  });
}

/** Whether a deck of the game on the table lists a card named `name` (any printing, any seat). */
export const isGameCard = (name: string): boolean => names.has(keyOf(name));

/** The printing the deck of seat `owner` lists for the card `name`, or null (the card is then drawn by name). */
export const printingOf = (name: string, owner: number): CardPrinting | null =>
  known.get(owner)?.get(keyOf(name)) ?? null;
