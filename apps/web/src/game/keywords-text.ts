/**
 * The words of Encore, Devour and Riot (D-185, the Korvold slice 6): the reminder texts of the chips and the sentences of the questions, composed
 * from the engine's data. Pure.
 */

/** The reminder of Encore (CR 702.141a), for the tooltip of its chip and the stack. */
export const ENCORE_REMINDER =
  'Exile this card from your graveyard: for each opponent, create a token that is a copy of it that attacks that opponent this turn if able. The tokens gain haste. Sacrifice them at the beginning of the next end step. Activate only as a sorcery.';

/** The reminder of Ninjutsu (CR 702.49a, unverified rule number), for the tooltip of its chip. */
export const NINJUTSU_REMINDER =
  "Pay the cost and return an unblocked attacker you control to its owner's hand: put this card onto the battlefield from your hand tapped and attacking the same player, planeswalker or battle.";

/** The effect of the ability Encore expands into, as the stack shows it (CR 702.141a). */
export const ENCORE_EFFECT_TEXT =
  "For each opponent, create a token that's a copy of this card that attacks that opponent this turn if able. The tokens gain haste. Sacrifice them at the beginning of the next end step";

/** The plural of a devour quality ("Food" is "Foods", CR 702.82c): what the permanents sacrificed are called, "creatures" without one. */
function devourKind(quality?: string): string {
  return quality === undefined ? 'creatures' : `${quality}s`;
}

/** The reminder of Devour N (CR 702.82a) and of "Devour Food 3" (CR 702.82c). */
export function devourReminder(n: number, quality?: string): string {
  const kind = devourKind(quality);
  return `As this enters, you may sacrifice any number of ${kind}. It enters with ${n} +1/+1 counter${n === 1 ? '' : 's'} on it for each ${quality ?? 'creature'} sacrificed this way.`;
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
export function devourPrompt(sourceName: string, quality?: string): string {
  return `Choose any number of ${devourKind(quality)} to sacrifice as ${sourceName} enters (devour). None is fine.`;
}

/** The prompt of "As X enters, remove all counters from any number of ..." (Sin, Unending Cataclysm, CR 614.12, 122.1): which permanents lose every counter. */
export function removeCountersPrompt(sourceName: string): string {
  return `Choose any number of permanents to remove all counters from as ${sourceName} enters. It enters with +1/+1 counters for the counters removed. None is fine.`;
}

/** The second line of the bar of that question: what is chosen so far. */
export function removeCountersDetail(chosen: number): string {
  return chosen === 0
    ? 'Click the permanents to remove every counter from, or confirm to remove none.'
    : `${chosen} chosen: every counter on ${chosen === 1 ? 'it' : 'them'} is removed.`;
}

/** The second line of the devour bar: what is chosen so far. */
export function devourDetail(chosen: number, quality?: string): string {
  return chosen === 0
    ? `Click the ${devourKind(quality)} to sacrifice, or confirm to sacrifice none.`
    : `${chosen} chosen: it enters with that many sets of +1/+1 counters.`;
}
