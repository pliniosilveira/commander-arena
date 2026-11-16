/**
 * The words of a tap or sacrifice cost, shared by `cost-text.ts` and `artifacts-text.ts` (a leaf, so neither imports the other: the
 * Behold wording of `dragons-text.ts` needs `artifacts-text.ts`, and `cost-text.ts` needs that wording).
 */
import type { ObjectFilter } from '@commander-arena/engine';
import { thingsPhrase } from './filter-text';
import { COLOR_NAMES } from './words';

/** "artifact or creature", "red creature", "nonland permanent": the nouns of a filter (no article). */
export function nounsOf(filter: ObjectFilter): string {
  if (filter.anyOf !== undefined && filter.anyOf.length > 0) {
    const alternatives = filter.anyOf.map(nounsOf);
    return [...new Set(alternatives)].join(' or ');
  }
  const kinds = filter.types ?? [];
  const base = kinds.length === 0 ? 'permanent' : kinds.join(' or ');
  const not = (filter.notTypes ?? []).map((t) => `non${t}`).join(' ');
  const colors = (filter.colors ?? []).map((c) => COLOR_NAMES[c] ?? c).join(' or ');
  const supers = (filter.supertypes ?? []).join(' ');
  const subtypes = (filter.subtypes ?? []).join(' ');
  return [not, colors, supers, subtypes, base].filter((w) => w !== '').join(' ');
}

export const NUMBER_WORDS: Readonly<Record<number, string>> = {
  2: 'two',
  3: 'three',
  4: 'four',
  5: 'five',
  6: 'six',
};

/** The plural of a noun phrase: "artifact" is "artifacts", "Zombie creature" "Zombie creatures". */
export const plural = (words: string): string => (words.endsWith('s') ? words : `${words}s`);

/**
 * "two untapped artifacts you control", "an untapped Zombie you control", "another untapped creature you
 * control", "three untapped Elves you control" (digits with `numeral`): what a tap cost names (D-133), composed from the filter with the
 * words of `filter-text.ts` (so the plural of any creature type reads right). A filter those words cannot say
 * (an `anyOf`) falls back to its nouns.
 */
export function tappedWhat(filter: ObjectFilter, count: number, numeral = false): string {
  const amount = (n: number): string => (numeral ? String(n) : (NUMBER_WORDS[n] ?? String(n)));
  const things = thingsPhrase({ ...filter, tapped: false, controller: 'you' }, count !== 1);
  if (things === null) {
    const words = nounsOf(filter);
    if (count === 1) {
      const other = filter.other === true ? 'another' : /^[aeiou]/i.test(words) ? 'an' : 'a';
      return `${other} untapped ${words} you control`;
    }
    return `${amount(count)} untapped ${plural(words)} you control`;
  }
  if (count !== 1) return `${amount(count)} ${things}`;
  if (things.startsWith('other ')) return `another ${things.slice('other '.length)}`;
  return /^[aeiou]/i.test(things) ? `an ${things}` : `a ${things}`;
}
