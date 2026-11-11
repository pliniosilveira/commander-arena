import type { PtValue } from '@commander-arena/engine';

/**
 * Power or toughness from Scryfall's string. Integers become numbers; `*` stays `'*'`. Values
 * such as `1+*` or `*+1` are also characteristic-defining; they become `'*'` with a problem so
 * the card is reported, and the engine rejects every `'*'` until those abilities exist.
 */
export function convertPt(
  value: string | null,
  label: string,
): { value: PtValue | null; problems: string[] } {
  if (value === null || value === '') return { value: null, problems: [] };
  if (/^-?\d+$/.test(value)) return { value: Number(value), problems: [] };
  if (value === '*') return { value: '*', problems: [] };
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
