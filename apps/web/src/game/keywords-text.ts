/**
 * The words of Encore, Devour and Riot (D-185, the Korvold slice 6): the reminder texts of the chips and the sentences of the questions, composed
 * from the engine's data. Pure.
 */

/** The reminder of Encore (CR 702.141a), for the tooltip of its chip and the stack. */
export const ENCORE_REMINDER =
  'Exile this card from your graveyard: for each opponent, create a token that is a copy of it that attacks that opponent this turn if able. The tokens gain haste. Sacrifice them at the beginning of the next end step. Activate only as a sorcery.';

/** The effect of the ability Encore expands into, as the stack shows it (CR 702.141a). */
export const ENCORE_EFFECT_TEXT =
  "For each opponent, create a token that's a copy of this card that attacks that opponent this turn if able. The tokens gain haste. Sacrifice them at the beginning of the next end step";

/** The reminder of Devour N (CR 702.82a). */
export function devourReminder(n: number): string {
  return `As this enters, you may sacrifice any number of creatures. It enters with ${n} +1/+1 counter${n === 1 ? '' : 's'} on it for each creature sacrificed this way.`;
}

/** The reminder of Riot (CR 702.136a). */
export const RIOT_REMINDER =
  'This permanent enters with your choice of an additional +1/+1 counter or haste.';

/** The answers of a riot question (CR 702.136a), as the buttons word them: `counter` and `haste`. */
export const RIOT_ROWS: Readonly<
  Record<string, { readonly label: string; readonly detail: string }>
> = {
  counter: {
    label: 'A +1/+1 counter',
    detail: 'It enters with an additional +1/+1 counter on it.',
  },
  haste: { label: 'Haste', detail: 'It gains haste.' },
};

/** "As X enters, choose a +1/+1 counter or haste (riot)." The second instance of riot says so (CR 702.136b). */
export function riotPrompt(sourceName: string, soFar: readonly string[]): string {
  const again = soFar.length === 0 ? '' : ' Another instance of riot asks again.';
  return `As ${sourceName} enters, choose a +1/+1 counter or haste (riot).${again}`;
}

/** What a riot answer reads as in the log: "a +1/+1 counter" or "haste". */
export function riotAnswerText(option: string): string {
  return option === 'counter' ? 'a +1/+1 counter' : option;
}

/** "Sacrifice any number of creatures as X enters (devour)." The prompt of the devour question (CR 702.82a). */
export function devourPrompt(sourceName: string): string {
  return `Choose any number of creatures to sacrifice as ${sourceName} enters (devour). None is fine.`;
}

/** The second line of the devour bar: what is chosen so far. */
export function devourDetail(chosen: number): string {
  return chosen === 0
    ? 'Click the creatures to sacrifice, or confirm to sacrifice none.'
    : `${chosen} chosen: it enters with that many sets of +1/+1 counters.`;
}
