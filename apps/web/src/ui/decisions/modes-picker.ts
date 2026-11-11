/**
 * The pure parts of the "choose modes" question (CR 700.2, 601.2b, D-114): the heading, which modes
 * can be picked, which sets can be confirmed, the digit keys and the words for a chosen set. The
 * dialog (`ModesDialog.tsx`) only draws what these return. A modal spell, an activated ability and a
 * triggered ability all ask the same decision.
 */
import type { ChooseModesDecision, ObjectView } from '@commander-arena/engine';
import { escalateCostOf, repeatedCost } from '../../game/dinosaurs-text';
import { modeText } from '../../game/mode-text';
import { type Index, plural } from './lookup';

export { modeText };

type Counts = Pick<ChooseModesDecision, 'min' | 'max'>;

/** Why a mode cannot be picked: a mode is illegal when its targets cannot all be chosen (CR 700.2a). */
export const NO_LEGAL_MODE = 'No legal target';

/** With escalate (D-145) a mode is also out when no set with it can be paid for: the reason is not told apart. */
export const NO_LEGAL_ESCALATE_MODE = 'No legal target, or not enough mana for the escalate cost';

const COUNT_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
const word = (n: number): string => COUNT_WORDS[n] ?? String(n);

/**
 * How many modes to choose, in the words of the cards: "one", "two", "one or both", "one or more".
 * Shapes the cards do not print ("up to two", "two or three") are said plainly.
 */
export function modesCountWords({ min, max }: Counts): string {
  if (min === max) return word(min);
  if (min === 1 && max === 2) return 'one or both';
  if (min === 1) return 'one or more';
  if (min === 0) return `up to ${word(max)}`;
  return `${word(min)} to ${word(max)}`;
}

/**
 * True when the ability asking is a triggered ability whose modes may not repeat in a turn (D-151, CR 700.2: "choose one that hasn't been
 * chosen this turn"), read from the ability on the stack; false for a spell and for an ability the view does not show.
 */
export function notRepeatedThisTurn(d: Pick<ChooseModesDecision, 'source'>, index: Index): boolean {
  const ability = index.get(d.source)?.ability;
  return ability?.kind === 'triggered' && ability.chooseModes?.notRepeatedThisTurn === true;
}

/** Why a mode cannot be picked when the ability may not repeat a mode: "already chosen this turn" says it, and the targets may too. */
export const NO_REPEAT_MODE = 'Already chosen this turn, or no legal target';

/** The line over the modes, as printed: "Choose one —", "Choose two —", "Choose one that hasn't been chosen this turn —". */
export function modesHeading(d: Counts, repeats = true): string {
  return `Choose ${modesCountWords(d)}${repeats ? '' : " that hasn't been chosen this turn"} \u2014`;
}

/** The name the dialog gives its source: the card for a spell, "Name's ability" otherwise. */
export function modesSourceLabel(d: Pick<ChooseModesDecision, 'sourceName' | 'purpose'>): string {
  return d.purpose === 'spell' ? d.sourceName : `${d.sourceName}'s ability`;
}

/** The prompt of the bar: "Choose one or both modes for SYNTHETIC Both Charm." */
export function modesPrompt(
  d: Pick<ChooseModesDecision, 'sourceName' | 'purpose' | 'min' | 'max'>,
): string {
  const many = !(d.min === d.max && d.max === 1);
  return `Choose ${modesCountWords(d)} ${many ? 'modes' : 'mode'} for ${modesSourceLabel(d)}.`;
}

/** The picks as the engine reads them: indices in printed order. */
export function sortedModes(picks: readonly number[]): readonly number[] {
  return [...picks].sort((a, b) => a - b);
}

/** True when `picks` is one of the legal sets the engine listed (any order). */
export function modesSelectionLegal(
  d: Pick<ChooseModesDecision, 'sets'>,
  picks: readonly number[],
): boolean {
  return d.sets.some((set) => set.length === picks.length && set.every((m) => picks.includes(m)));
}

/** True for "choose one": its modes behave like radio buttons. */
export function isPickOne(d: Pick<ChooseModesDecision, 'max'>): boolean {
  return d.max === 1;
}

/**
 * Clicking, or pressing the digit of, a mode. "Choose one" replaces the pick (a radio button: the
 * picked one stays picked); otherwise it toggles, and a mode is not added past `max`. An illegal mode
 * never changes the picks.
 */
export function toggleMode(
  d: Pick<ChooseModesDecision, 'modes' | 'max'>,
  picks: readonly number[],
  index: number,
): readonly number[] {
  const mode = d.modes.find((m) => m.index === index);
  if (mode === undefined || !mode.legal) return picks;
  if (isPickOne(d)) return [index];
  if (picks.includes(index)) return picks.filter((p) => p !== index);
  return picks.length >= d.max ? picks : sortedModes([...picks, index]);
}

/** Why Confirm is disabled (also its tooltip); null when the picks are one of the legal sets. */
export function modesHint(d: ChooseModesDecision, picks: readonly number[]): string | null {
  if (modesSelectionLegal(d, picks)) return null;
  if (picks.length < d.min) return `Choose ${plural(d.min - picks.length, 'more mode')}`;
  // D-145: only the sets whose escalate cost can be paid are offered (CR 702.120a).
  if (modesEscalate(d) !== null) return 'You cannot pay the escalate cost for that many modes';
  return 'That choice of modes is not allowed';
}

/**
 * The escalate cost of the spell being cast, as symbols (D-145, CR 702.120a), read from its Oracle text; null for an ability and
 * for a spell without escalate.
 */
export function modesEscalate(
  d: Partial<Pick<ChooseModesDecision, 'sourceOracleText' | 'purpose'>>,
): readonly string[] | null {
  return d.purpose === 'spell' && d.sourceOracleText !== undefined
    ? escalateCostOf(d.sourceOracleText)
    : null;
}

/** " Escalate {G}: {G}{G} more for 2 modes beyond the first." (CR 702.120a): the extra cost of the picks so far. '' without escalate. */
export function escalateNote(
  d: Partial<Pick<ChooseModesDecision, 'sourceOracleText' | 'purpose'>>,
  picks: readonly number[],
): string {
  const cost = modesEscalate(d);
  if (cost === null) return '';
  const extra = Math.max(0, picks.length - 1);
  const each = repeatedCost(cost, 1);
  return extra === 0
    ? ` Escalate ${each}: pay it for each mode beyond the first.`
    : ` Escalate ${each}: ${repeatedCost(cost, extra)} more for ${extra === 1 ? 'one mode' : `${extra} modes`} beyond the first.`;
}

/** The detail line: how many are picked of how many may be, and the escalate cost of the picks. */
export function modesDetail(
  d: Counts & Partial<Pick<ChooseModesDecision, 'sourceOracleText' | 'purpose'>>,
  picks: readonly number[],
): string {
  const range = d.min === d.max ? String(d.max) : `${d.min} to ${d.max}`;
  const full = picks.length >= d.max && d.max > 1 && d.min !== d.max;
  const base = `${picks.length} of ${range} chosen${full ? '. Clear one to pick another.' : ''}`;
  const note = escalateNote(d, picks);
  return note === '' ? base : `${base.endsWith('.') ? base : `${base}.`}${note}`;
}

/**
 * The mode a key picks: "1" to "9" are the first to the ninth mode (a spell has at most eight);
 * null for any other key.
 */
export function modeKey(key: string): number | null {
  return /^[1-9]$/.test(key) ? Number(key) - 1 : null;
}

/** The texts of the modes chosen for a spell or ability on the stack, in printed order; null when not modal. */
export function chosenModeTexts(object: Pick<ObjectView, 'modes' | 'modeTexts'>): string[] | null {
  const { modes, modeTexts } = object;
  if (modes === undefined || modeTexts === undefined || modes.length === 0) return null;
  const texts = modes.flatMap((i) => {
    const text = modeTexts[i];
    return text === undefined ? [] : [modeText(text)];
  });
  return texts.length === 0 ? null : texts;
}

/** "Chosen: Destroy target artifact; Draw a card" for the stack and the preview; null when not modal. */
export function chosenModesLine(object: Pick<ObjectView, 'modes' | 'modeTexts'>): string | null {
  const texts = chosenModeTexts(object);
  return texts === null ? null : `Chosen: ${texts.join('; ')}`;
}
