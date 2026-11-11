/**
 * The pure parts of the "choose a creature type / a color" question (D-100, CR 614.12a): the prompt,
 * the short list of suggestions, the search filter and the highlighted row. The dialog
 * (`OptionDialog.tsx`) only draws what these return, so the rules are unit tested without a DOM.
 */
import type { ChooseOptionDecision, GameView, ObjectView } from '@commander-arena/engine';
import { purposeNoun } from '../../game/chosen';
import { namedOptionPrompt } from './option-names';

/** "As SYNTHETIC Rally Banner enters, choose a creature type." */
export function optionPrompt(
  d: Pick<ChooseOptionDecision, 'purpose' | 'sourceName'> &
    Partial<Pick<ChooseOptionDecision, 'options' | 'riotSoFar' | 'replacement' | 'vote' | 'seat'>>,
): string {
  // D-151: a choice among names the card gives, or the chapter a Saga with read ahead starts with.
  if (
    (d.purpose === 'option' ||
      d.purpose === 'effect' ||
      d.purpose === 'riot' ||
      d.purpose === 'replacement' ||
      d.purpose === 'vote') &&
    d.options !== undefined
  ) {
    return namedOptionPrompt({
      purpose: d.purpose,
      options: d.options,
      sourceName: d.sourceName,
      ...(d.riotSoFar === undefined ? {} : { riotSoFar: d.riotSoFar }),
      ...(d.replacement === undefined ? {} : { replacement: d.replacement }),
      ...(d.vote === undefined ? {} : { vote: d.vote }),
      ...(d.seat === undefined ? {} : { seat: d.seat }),
    });
  }
  return `As ${d.sourceName} enters, choose a ${purposeNoun(d.purpose)}.`;
}

/** How many suggestions are listed before the full list. */
export const MAX_SUGGESTIONS = 8;

/**
 * The creature types worth offering first: those of the human's own permanents and of the cards in
 * their hand, most common first (ties keep the order they were seen in), then those of their
 * commander not listed yet. Only types the engine offers count (a Forest or an Aura is a subtype
 * too, but not a creature type).
 */
export function suggestedTypes(
  view: GameView,
  options: readonly string[],
  limit = MAX_SUGGESTIONS,
): readonly string[] {
  const offered = new Set(options);
  const me = view.seats[view.viewer];
  const own: readonly ObjectView[] = [
    ...view.battlefield.filter((o) => o.controller === view.viewer),
    ...(me?.hand ?? []),
  ];
  const counts = new Map<string, number>();
  for (const o of own) {
    for (const type of new Set(o.subtypes)) {
      if (offered.has(type)) counts.set(type, (counts.get(type) ?? 0) + 1);
    }
  }
  const common = [...counts.entries()]
    .map(([type, n], seen) => ({ type, n, seen }))
    .sort((a, b) => b.n - a.n || a.seen - b.seen)
    .map((c) => c.type);
  const commanders = [
    ...(me?.command ?? []),
    ...own.filter((o) => o.isCommander),
    ...view.battlefield.filter((o) => o.isCommander && o.owner === view.viewer),
  ].flatMap((o) => o.subtypes);
  const result: string[] = [];
  for (const type of [...common, ...commanders]) {
    if (offered.has(type) && !result.includes(type)) result.push(type);
  }
  return result.slice(0, limit);
}

/**
 * The options that match a search, best matches first: names that start with the text, then names
 * with a word that starts with it, then names that contain it; each group in the order of `options`.
 * Case is ignored, and so is space around the text. An empty search matches everything.
 */
export function filterOptions(options: readonly string[], query: string): readonly string[] {
  const q = query.trim().toLowerCase();
  if (q === '') return options;
  const prefix: string[] = [];
  const word: string[] = [];
  const inside: string[] = [];
  for (const option of options) {
    const lower = option.toLowerCase();
    if (lower.startsWith(q)) prefix.push(option);
    else if (lower.split(' ').some((w) => w.startsWith(q))) word.push(option);
    else if (lower.includes(q)) inside.push(option);
  }
  return [...prefix, ...word, ...inside];
}

export interface PickerRow {
  /** Unique in the list: a suggested type is listed twice, once in each group. */
  readonly key: string;
  readonly value: string;
  readonly group: 'suggested' | 'all';
}

/**
 * The rows of the list in the order the arrow keys walk them: with no search, the suggestions and
 * then every option alphabetically; with a search, only the matches.
 */
export function pickerRows(
  options: readonly string[],
  suggestions: readonly string[],
  query: string,
): readonly PickerRow[] {
  const all = [...options].sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1));
  const row = (group: PickerRow['group'], value: string): PickerRow => ({
    key: `${group}:${value}`,
    value,
    group,
  });
  if (query.trim() !== '') {
    return filterOptions(all, query).map((value) => row('all', value));
  }
  return [...suggestions.map((v) => row('suggested', v)), ...all.map((v) => row('all', v))];
}

/** The highlighted row after an arrow key: it stops at the first and the last row. */
export function moveHighlight(active: number, delta: number, rows: number): number {
  if (rows === 0) return 0;
  return Math.min(rows - 1, Math.max(0, active + delta));
}
