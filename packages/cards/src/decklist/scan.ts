/**
 * The entry-line scanner (SPEC 6.1): turns one decklist line into a quantity, a card name and its
 * decorations. A small hand-written scanner, not a regex: a line is
 *
 *   line  := [quantity] name decoration*
 *   quantity := digits ['x'|'X'|U+00D7]
 *   decoration := '(' set ')' [collector] | '(F)' | '[' tags ']' | '^' tags '^' | '*' marker '*'
 *              | '#' tag
 *
 * Everything before the first decoration is the card name; anything left after a decoration that
 * is not itself a decoration is an error, so nothing is guessed and nothing is dropped silently.
 */
import { normalizeCardName } from './normalize';

export interface ScannedEntry {
  readonly name: string;
  readonly count: number;
  readonly set: string | null;
  readonly collector: string | null;
  readonly tags: readonly string[];
  readonly foil: boolean;
  /** A `*CMDR*`, `#commander` or `[Commander]` mark on the line. */
  readonly commander: boolean;
  /** A `[Sideboard]` or `[Maybeboard]` style category that moves the line out of its section. */
  readonly sectionTag: 'sideboard' | 'maybeboard' | null;
}

export type ScanResult =
  | { readonly ok: true; readonly entry: ScannedEntry }
  | { readonly ok: false; readonly message: string };

const MAX_COUNT = 999;
const SET_CODE = /^[A-Za-z0-9]{2,6}$/;
const FOIL_WORDS = new Set(['f', 'e', 'foil', 'etched']);
const COMMANDER_WORDS = new Set(['commander', 'cmdr']);

function isSpace(char: string): boolean {
  return /\s/.test(char);
}

function fail(message: string): ScanResult {
  return { ok: false, message };
}

interface Quantity {
  readonly count: number;
  readonly rest: string;
}

/** Read the leading quantity; a line without one has quantity 1. Returns an error message. */
function readQuantity(text: string): Quantity | string {
  const spaced = /^(\d+)[xX×]?(?:\s+|$)/.exec(text);
  const glued = spaced ?? /^(\d+)[xX×](?=\S)/.exec(text);
  if (glued?.[1] === undefined) {
    if (/^[+-]\s*\d/.test(text)) return 'quantity must be a positive whole number';
    if (/^\d+[.,]\d/.test(text)) return 'quantity must be a whole number';
    if (/^\d/.test(text)) return 'a quantity must be followed by a space and the card name';
    return { count: 1, rest: text };
  }
  const digits = glued[1];
  const count = digits.length > 4 ? Number.POSITIVE_INFINITY : Number.parseInt(digits, 10);
  if (count < 1) return 'quantity must be at least 1';
  if (count > MAX_COUNT) return `quantity ${digits} is not a plausible card count`;
  return { count, rest: text.slice(glued[0].length) };
}

/** Tags from a `[...]` or `^...^` group: comma separated, `{modifier}` suffixes removed. */
function groupTags(content: string, caret: boolean): string[] {
  const tags: string[] = [];
  for (const part of content.split(',')) {
    const tag = part.replace(/\{[^}]*\}/g, '').trim();
    // Archidekt writes a tag's color as `#37d67a` inside `^...^`; it is not a tag.
    if (tag.length === 0 || (caret && tag.startsWith('#'))) continue;
    tags.push(tag);
  }
  return tags;
}

/** Scan one trimmed, non-empty line with any `SB:` prefix already removed. */
export function scanEntry(text: string): ScanResult {
  const quantity = readQuantity(text);
  if (typeof quantity === 'string') return fail(quantity);
  const s = quantity.rest;
  const n = s.length;

  let nameText = '';
  let decorated = false;
  let set: string | null = null;
  let collector: string | null = null;
  let awaitingCollector = false;
  let foil = false;
  let commander = false;
  const tags: string[] = [];

  const addTag = (tag: string): void => {
    if (!tags.includes(tag)) tags.push(tag);
  };

  let i = 0;
  while (i < n) {
    const c = s.charAt(i);
    if (isSpace(c)) {
      nameText += ' ';
      i += 1;
      continue;
    }
    if (c === '(') {
      const close = s.indexOf(')', i + 1);
      if (close === -1) return fail('unclosed parenthesis');
      const inner = s.slice(i + 1, close).trim();
      i = close + 1;
      if (inner.length === 0) return fail('empty parentheses');
      if (FOIL_WORDS.has(inner.toLowerCase())) {
        foil = true;
        decorated = true;
        awaitingCollector = false;
      } else if (SET_CODE.test(inner)) {
        if (set !== null) return fail('more than one set code');
        set = inner.toLowerCase();
        decorated = true;
        awaitingCollector = true;
      } else if (decorated) {
        return fail(`unexpected text "(${inner})" after the card details`);
      } else {
        // Parentheses that are part of a name, such as "B.F.M. (Big Furry Monster)".
        nameText += `(${inner})`;
      }
      continue;
    }
    if (c === '[' || c === '^') {
      const closer = c === '[' ? ']' : '^';
      const close = s.indexOf(closer, i + 1);
      if (close === -1) return fail(c === '[' ? 'unclosed bracket' : 'unclosed ^ tag group');
      for (const tag of groupTags(s.slice(i + 1, close), c === '^')) addTag(tag);
      decorated = true;
      awaitingCollector = false;
      i = close + 1;
      continue;
    }
    if (c === '*') {
      const close = s.indexOf('*', i + 1);
      if (close === -1) return fail('unclosed * marker');
      const marker = s
        .slice(i + 1, close)
        .trim()
        .toLowerCase();
      if (FOIL_WORDS.has(marker)) foil = true;
      else if (COMMANDER_WORDS.has(marker)) commander = true;
      decorated = true;
      awaitingCollector = false;
      i = close + 1;
      continue;
    }
    // A plain run up to whitespace or the next decoration character.
    let end = i;
    while (end < n && !isSpace(s.charAt(end)) && !'([^*'.includes(s.charAt(end))) end += 1;
    const run = s.slice(i, end);
    const start = i;
    i = end;
    if (c === '#' && (decorated || start === 0 || isSpace(s.charAt(start - 1)))) {
      const tag = run.slice(1);
      if (tag.length > 0) addTag(tag);
      decorated = true;
      awaitingCollector = false;
    } else if (run.includes(')') || run.includes(']')) {
      return fail('unmatched closing bracket');
    } else if (!decorated) {
      nameText += run;
    } else if (awaitingCollector) {
      collector = run;
      awaitingCollector = false;
    } else {
      return fail(`unexpected text "${run}" after the card details`);
    }
  }

  const name = normalizeCardName(nameText);
  if (name.length === 0) return fail('missing card name');
  if (!/[\p{L}\p{N}_]/u.test(name)) return fail('the card name has no letters or digits');

  let sectionTag: ScannedEntry['sectionTag'] = null;
  for (const tag of tags) {
    const lower = tag.toLowerCase();
    if (COMMANDER_WORDS.has(lower)) commander = true;
    else if (lower === 'sideboard') sectionTag ??= 'sideboard';
    else if (lower === 'maybeboard' || lower === 'considering') sectionTag ??= 'maybeboard';
  }
  return {
    ok: true,
    entry: { name, count: quantity.count, set, collector, tags, foil, commander, sectionTag },
  };
}
