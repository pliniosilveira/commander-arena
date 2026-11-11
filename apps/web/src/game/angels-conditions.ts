/**
 * The conditions of the Angels slice (D-149) as the words after "if": the turn number ("it's your fourth turn or later"), permanents
 * with the same name ("you control 3 or more lands with the same name") and whom the attackers attacked ("none of those creatures
 * attacked you"). A leaf module (`condition-text.ts` imports it), so it imports nothing that imports the conditions. Null for any
 * other condition; never a guess. Pure.
 */
import type { Condition, NumberComparison } from '@commander-arena/engine';
import { thingsPhrase } from './filter-text';
import { SMALL_COUNT_WORDS } from './words';

const ORDINALS: Readonly<Record<number, string>> = {
  1: 'first',
  2: 'second',
  3: 'third',
  4: 'fourth',
  5: 'fifth',
};

/** "first", "second", "7th": the turn of the game as the cards number it. */
export const ordinalWord = (n: number): string => ORDINALS[n] ?? `${n}th`;

/** "three", "12": a small count in words. */
export const cardinalWord = (n: number): string => SMALL_COUNT_WORDS[n] ?? String(n);

/** "your first three turns": a comparison of the turns the player has had, as the cards print it. */
export function turnNumberWords(compare: NumberComparison, negate: boolean): string | null {
  const cmp = negate
    ? compare.cmp === 'atLeast'
      ? 'atMost'
      : compare.cmp === 'atMost'
        ? 'atLeast'
        : 'equal'
    : compare.cmp;
  // "not your second turn" cannot be said as one turn; the rest swap the bound by one.
  if (negate && compare.cmp === 'equal') return `it's not your ${ordinalWord(compare.value)} turn`;
  const value =
    negate && compare.cmp === 'atLeast'
      ? compare.value - 1
      : negate && compare.cmp === 'atMost'
        ? compare.value + 1
        : compare.value;
  // A bound below the first turn says nothing a player could read.
  if (value < 1) return null;
  if (cmp === 'equal') return `it's your ${ordinalWord(value)} turn`;
  if (cmp === 'atLeast') return `it's your ${ordinalWord(value)} turn or later`;
  return value === 1
    ? "it's your first turn"
    : `it's one of your first ${cardinalWord(value)} turns`;
}

/**
 * The conditions of the Angels slice as the words after "if": the turn number ("it's your fourth turn or later"), permanents with
 * the same name ("you control 3 or more lands with the same name"), and whom the attackers attacked ("none of those creatures
 * attacked you"). Null for any other condition.
 */
export function angelsConditionWords(condition: Condition, negate: boolean): string | null {
  switch (condition.kind) {
    case 'ownTurnNumber':
      return turnNumberWords(condition.compare, negate);
    case 'sameNameAtLeast': {
      const things = thingsPhrase({ ...condition.filter, controller: 'you' }, true);
      const at = things === null ? -1 : things.indexOf(' you control');
      if (things === null || at < 0) return null;
      const what = things.slice(0, at);
      const tail = things.slice(at + ' you control'.length);
      return negate
        ? `you control fewer than ${condition.count} ${what}${tail} with the same name`
        : `you control ${condition.count} or more ${what}${tail} with the same name`;
    }
    case 'attackersAttackedYou':
      return negate
        ? 'none of those creatures attacked you'
        : 'at least one of those creatures attacked you';
    default:
      return null;
  }
}
