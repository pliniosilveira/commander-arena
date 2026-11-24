/**
 * The choices of a vote and what a finished vote came to (CR 701.38a, 701.38b): an option is a word of the card, `seat:<n>` for a player or `object:<id>` for a permanent. Pure helpers with no
 * imports of the rules, so that the selectors, the amounts and the vote itself can all read a record of votes.
 */
import type { ObjectId } from '../ids';

/** The option a vote for a player is: "seat:2". */
export const seatOption = (seat: number): string => `seat:${seat}`;

/** The option a vote for a permanent is: "object:o57". */
export const objectOption = (id: ObjectId): string => `object:${id}`;

/** The player an option of a vote for players names, or null for any other option. */
export function seatOfOption(option: string): number | null {
  const m = /^seat:(\d+)$/u.exec(option);
  return m === null ? null : Number(m[1]);
}

/** The permanent an option of a vote for permanents names, or null for any other option. */
export function objectOfOption(option: string): ObjectId | null {
  const m = /^object:(o\d+)$/u.exec(option);
  return m === null ? null : (m[1] as ObjectId);
}

/** The tally of a finished vote: how many players voted for each choice (a choice nobody chose is left out). */
export function tallyCast(
  cast: readonly { readonly option: string }[],
): Readonly<Record<string, number>> {
  const tally: Record<string, number> = {};
  for (const c of cast) tally[c.option] = (tally[c.option] ?? 0) + 1;
  return tally;
}
