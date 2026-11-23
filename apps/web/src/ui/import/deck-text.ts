/**
 * Pure edits of a decklist text for the printing picker of the deck screen. A printing chosen for a card is written on its line
 * (`1 Name (fdc) 6 ^Chosen printing^`): the deck keeps it in its own text, so a saved deck, an edited precon and the game that
 * prepares them from that text all agree, with no second store.
 */
import { type DeckEntry, frontFaceName, parseDecklist } from '@commander-arena/cards';
import { CHOSEN_TAG } from '../board/deck-printings';

export interface ListedPrinting {
  /** Lower-case set code. */
  readonly set: string;
  readonly collector: string;
  /** Written by the picker (`CHOSEN_TAG`), as opposed to a printing the imported list already named. */
  readonly chosen: boolean;
}

const same = (a: string, b: string): boolean =>
  frontFaceName(a).toLowerCase() === frontFaceName(b).toLowerCase();
/** The one entry a line reads as, or null when it is a header, a comment or does not parse. */
function scanEntryLine(line: string): DeckEntry | null {
  const { sections, errors } = parseDecklist(line);
  if (errors.length > 0) return null;
  const all = Object.values(sections).flat();
  return all.length === 1 ? (all[0] ?? null) : null;
}
const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Every printing the text lists, by the lower-case front face of the card's name. */
export function printingsInText(text: string): ReadonlyMap<string, ListedPrinting> {
  const { sections } = parseDecklist(text);
  const out = new Map<string, ListedPrinting>();
  for (const entry of [...sections.commander, ...sections.main]) {
    if (entry.set !== null && entry.collector !== null) {
      out.set(frontFaceName(entry.name).toLowerCase(), {
        set: entry.set,
        collector: entry.collector,
        chosen: entry.tags.includes(CHOSEN_TAG),
      });
    }
  }
  return out;
}

/** The printing the text lists for the card `name`, or null. */
export function printingInText(text: string, name: string): ListedPrinting | null {
  const { sections } = parseDecklist(text);
  for (const entry of [...sections.commander, ...sections.main]) {
    if (same(entry.name, name) && entry.set !== null && entry.collector !== null) {
      return {
        set: entry.set,
        collector: entry.collector,
        chosen: entry.tags.includes(CHOSEN_TAG),
      };
    }
  }
  return null;
}

/**
 * The text with every line of the card `name` set to the printing `set` / `collector`, the rest of the line kept (foil mark, tags).
 * Null when no line of the card can be rewritten so that it reads back as asked (nothing is guessed).
 */
export function withPrinting(
  text: string,
  name: string,
  set: string,
  collector: string,
): string | null {
  let changed = false;
  const lines = text.split('\n').map((raw) => {
    const cr = raw.endsWith('\r') ? '\r' : '';
    const line = raw.trim();
    const scanned = line === '' ? null : scanEntryLine(line);
    if (scanned === null || !same(scanned.name, name)) return raw;
    let base = line.replace(new RegExp(`\\s*\\^${escapeRegExp(CHOSEN_TAG)}\\^`, 'g'), '');
    if (scanned.set !== null) {
      const old = scanned.collector === null ? '' : `(?:\\s+${escapeRegExp(scanned.collector)})?`;
      base = base.replace(
        new RegExp(`\\s*\\(\\s*${escapeRegExp(scanned.set)}\\s*\\)${old}`, 'i'),
        '',
      );
    }
    const next = `${base.trim()} (${set}) ${collector} ^${CHOSEN_TAG}^`;
    const back = scanEntryLine(next);
    const ok =
      back !== null &&
      same(back.name, name) &&
      back.set === set.toLowerCase() &&
      back.collector === collector &&
      back.tags.includes(CHOSEN_TAG);
    if (!ok) return raw;
    changed = true;
    return `${next}${cr}`;
  });
  return changed ? lines.join('\n') : null;
}
