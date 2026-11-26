/**
 * The words of the cost "Remove two +1/+1 counters from among creatures you control" (CR 118.3, 122.1), shown in the ability's label and in the prompt of its choice. A leaf next to
 * `untap-cost-text.ts`.
 */
import type { ObjectFilter } from '@commander-arena/engine';
import { NUMBER_WORDS, nounsOf, plural } from './cost-words';
import { thingsPhrase } from './filter-text';

/** "a +1/+1 counter", "two +1/+1 counters" (digits with `numeral`): the counters the cost takes off. */
export function countersTaken(counter: string | undefined, count: number, numeral = false): string {
  const kind = counter === undefined ? 'counter' : `${counter} counter`;
  const amount = numeral ? String(count) : (NUMBER_WORDS[count] ?? String(count));
  return count === 1 ? `a ${kind}` : `${amount} ${kind}s`;
}

/** "an artifact or creature you control": the one permanent the counters of a cost like Moxite Refinery's all come off (`fromOne`). */
export function oneOfWhat(filter: ObjectFilter): string {
  const words = nounsOf(filter);
  return `${/^[aeiou]/i.test(words) ? 'an' : 'a'} ${words} you control`;
}

/** "creatures you control": the permanents the counters come off. A filter the words of `filter-text.ts` cannot say (an `anyOf`) falls back to its nouns. */
export function amongWhat(filter: ObjectFilter): string {
  const things = thingsPhrase({ ...filter, controller: 'you' }, true);
  return things ?? `${plural(nounsOf(filter))} you control`;
}
