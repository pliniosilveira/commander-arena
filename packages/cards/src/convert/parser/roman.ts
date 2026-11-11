/**
 * Roman numerals as a Saga's chapter symbols write them (CR 714.2a: "The numeral I represents 1,
 * II represents 2, III represents 3, and so on"). Only the numerals a chapter symbol can use are
 * read: the standard forms from I to XX, and nothing the CR does not say.
 */

const VALUES: Readonly<Record<string, number>> = { I: 1, V: 5, X: 10 };

/** The value of a numeral in standard form (I, II, III, IV, V, ... XX), or null. */
export function romanValue(numeral: string): number | null {
  if (!/^(?:X{0,2})(?:IX|IV|V?I{0,3})$/.test(numeral) || numeral === '') return null;
  let total = 0;
  for (let i = 0; i < numeral.length; i++) {
    const here = VALUES[numeral.charAt(i)] ?? 0;
    const next = VALUES[numeral.charAt(i + 1)] ?? 0;
    total += here < next ? -here : here;
  }
  return total;
}

/**
 * The chapter symbols at the start of a normalized line: "I", "I, II" or "I and II", then the em
 * dash (U+2014) that Scryfall prints after them. Group 1 is the numeral list.
 */
export const CHAPTER_PREFIX = /^([IVX]+(?:(?:, | and )[IVX]+)*) — /;

/** The numeral list at the start of a chapter line as numbers, or null for any other line. */
export function chapterNumbers(line: string): number[] | null {
  const m = CHAPTER_PREFIX.exec(line);
  if (m === null) return null;
  const out: number[] = [];
  for (const numeral of (m[1] ?? '').split(/, | and /)) {
    const n = romanValue(numeral);
    if (n === null) return null;
    out.push(n);
  }
  return out;
}
