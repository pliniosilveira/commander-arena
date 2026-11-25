import type { PtValue } from '@commander-arena/engine';

/**
 * Power or toughness from Scryfall's string. Integers become numbers; `*` stays `'*'`. Values
 * such as `1+*` or `*+1` are also characteristic-defining: the card's own characteristic-defining
 * ability states the whole number ("equal to 1 plus the number of ...", CR 208.2a), so they become
 * `'*'` with the whole number they add (`offset`), which the face conversion requires that ability
 * to state; any other value becomes `'*'` with a problem so the card is reported.
 */
export function convertPt(
  value: string | null,
  label: string,
): { value: PtValue | null; problems: string[]; offset?: number } {
  if (value === null || value === '') return { value: null, problems: [] };
  if (/^-?\d+$/.test(value)) return { value: Number(value), problems: [] };
  if (value === '*') return { value: '*', problems: [] };
  const offset = /^(?:([1-9]\d*)\+\*|\*\+([1-9]\d*))$/.exec(value);
  const n = offset?.[1] ?? offset?.[2];
  if (n !== undefined) return { value: '*', problems: [], offset: Number(n) };
  return { value: '*', problems: [`unsupported ${label} value "${value}"`] };
}

/** Loyalty or defense: a non-negative integer, or null (with a problem for a value like "X"). */
export function convertCount(
  value: string | null,
  label: string,
): { value: number | null; problems: string[] } {
  if (value === null || value === '') return { value: null, problems: [] };
  if (/^\d+$/.test(value)) return { value: Number(value), problems: [] };
  return { value: null, problems: [`unsupported ${label} value "${value}"`] };
}
