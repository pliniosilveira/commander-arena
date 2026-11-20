/**
 * The words of the cost "Untap two tapped creatures you control" (CR 701.26b), shown in the ability's label and in the prompt of its choice. A leaf next to
 * `cost-words.ts`, which holds the words of the tap cost.
 */
import type { ObjectFilter } from '@commander-arena/engine';
import { NUMBER_WORDS, nounsOf, plural } from './cost-words';
import { thingsPhrase } from './filter-text';

/**
 * "a tapped creature you control", "two tapped creatures you control", "15 tapped creatures you control" (digits with `numeral`, and always above six): what the untap cost
 * names. A filter the words of `filter-text.ts` cannot say (an `anyOf`) falls back to its nouns.
 */
export function untapWhat(filter: ObjectFilter, count: number, numeral = false): string {
  const amount = (n: number): string => (numeral ? String(n) : (NUMBER_WORDS[n] ?? String(n)));
  const things = thingsPhrase({ ...filter, tapped: true, controller: 'you' }, count !== 1);
  if (things === null) {
    const words = nounsOf(filter);
    if (count === 1) return `${/^[aeiou]/i.test(words) ? 'an' : 'a'} tapped ${words} you control`;
    return `${amount(count)} tapped ${plural(words)} you control`;
  }
  if (count !== 1) return `${amount(count)} ${things}`;
  return /^[aeiou]/i.test(things) ? `an ${things}` : `a ${things}`;
}
