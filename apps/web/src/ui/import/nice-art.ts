/**
 * "Use a special-frame commander art" (an option of the import screen): a commander whose list names no printing is drawn in Scryfall's
 * default one, often a plain frame. With the option on, the import looks the card's printings up and writes the newest special one
 * (borderless, showcase, extended art or full art) on the commander's line, as the printing picker of the deck screen does. The
 * deck then keeps it in its own text, so the board, the lists and the saved deck agree; a printing the list already names is never
 * replaced, and when nothing is found or Scryfall cannot be reached the list is imported as it is.
 */
import { commanderNameOf } from '../../precons';
import type { CardPrint } from './card-prints';
import { printingInText, withPrinting } from './deck-text';

/** The first printing, in the order given (newest first), with a special frame that still shows the card's own name; null when none. */
export function nicePrint(prints: readonly CardPrint[]): CardPrint | null {
  return prints.find((p) => p.frames.length > 0 && !p.renamed) ?? null;
}

export async function withNiceCommanderArt(
  text: string,
  findPrints: (name: string) => Promise<readonly CardPrint[]>,
): Promise<string> {
  const name = commanderNameOf(text);
  if (name === '' || printingInText(text, name) !== null) return text;
  try {
    const nice = nicePrint(await findPrints(name));
    if (nice === null) return text;
    return withPrinting(text, name, nice.setCode.toLowerCase(), nice.collector) ?? text;
  } catch {
    return text;
  }
}

const KEY = 'commander-arena.nice-commander-art';

/** The remembered choice of the option; off until the player turns it on. Storage that cannot be read is off. */
export function loadNiceArt(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function saveNiceArt(on: boolean): void {
  try {
    window.localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    // The option still applies to this import; it is just not remembered.
  }
}
