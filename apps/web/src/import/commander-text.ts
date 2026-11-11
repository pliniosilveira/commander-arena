/**
 * Writing the commander into a decklist (issue 123). A saved deck is only its text, and the menu,
 * the decks page and the game all read the commander from that text. A commander the player
 * chooses on the import screen (the list marks none) lives only in the screen's state, so it has
 * to be written into the text on Save, or the deck forgets it on the next load.
 *
 * The mark is the `*CMDR*` of the line scanner (`scanEntry`): the line moves to the Commander
 * section and its other copies stay in the main deck, exactly what the importer does for a chosen
 * commander. Marking a line changes no section header, so the rest of the list reads as before.
 */
import { normalizeNameKey, parseDecklist } from '@commander-arena/cards';

const LINE_BREAK = /(\r\n|\r|\n)/;

/** The key two spellings of a card share: front face only, case and spacing ignored. */
function frontKey(name: string): string {
  const key = normalizeNameKey(name);
  const at = key.indexOf(' // ');
  return at === -1 ? key : key.slice(0, at);
}

/**
 * `text` with one line of each named card marked `*CMDR*`. Unchanged when the list already marks
 * a commander (the importer ignores a chosen one then), when no name is given, and for a name
 * that is not a line of the main deck. Line endings and every other line stay as they were.
 */
export function markCommanders(text: string, names: readonly string[]): string {
  if (names.length === 0) return text;
  const parsed = parseDecklist(text);
  if (parsed.hasCommanderMarking) return text;
  const lineOf = new Map<string, number>();
  for (const entry of parsed.sections.main) {
    const key = frontKey(entry.name);
    if (!lineOf.has(key)) lineOf.set(key, entry.line);
  }
  const marked = new Set<number>();
  for (const name of names) {
    const line = lineOf.get(frontKey(name));
    if (line !== undefined) marked.add(line);
  }
  if (marked.size === 0) return text;
  // Even indexes are lines, odd ones the line breaks between them: joined again unchanged.
  const parts = text.split(LINE_BREAK);
  for (const line of marked) {
    const at = (line - 1) * 2;
    parts[at] = `${(parts[at] ?? '').trimEnd()} *CMDR*`;
  }
  return parts.join('');
}
