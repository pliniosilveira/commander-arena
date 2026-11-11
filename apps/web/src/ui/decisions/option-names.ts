/**
 * The pure parts of the "choose one of the names the card gives" question (D-151, CR 614.12a, 607.2d, 702.155b): a `chooseOption`
 * decision of purpose `option`. Two cards ask it: "As this enchantment enters, choose Khans or Dragons" (the options are the names) and
 * a Saga with read ahead (the options are the numbers 1 to the final chapter, "choose a chapter to start with"). The dialog
 * (`OptionNamesDialog.tsx`) draws what these return, so the words are unit tested without a DOM.
 */
import type { ChooseOptionDecision } from '@commander-arena/engine';
import { RIOT_ROWS, riotPrompt } from '../../game/keywords-text';
import { romanNumeral } from '../../game/saga';

type Asked = Pick<ChooseOptionDecision, 'purpose' | 'options'>;

/** True for an instance of riot (CR 702.136a, D-185): the counter or haste, as the permanent enters. */
export function isRiotChoice(d: Asked): boolean {
  return d.purpose === 'riot';
}

/**
 * True for the order of prevention effects on a damage event (CR 616.1, D-191): several effects apply and the order can change the result, so the
 * affected player chooses which to apply first. The options are the keys of the effects; the words are in `replacement`.
 */
export function isReplacementChoice(d: Asked): boolean {
  return d.purpose === 'replacement';
}

/** True for a vote (CR 701.38a, D-194): "starting with you, each player votes for profit or security". The options are the words of the card. */
export function isVoteChoice(d: Asked): boolean {
  return d.purpose === 'vote';
}

/** True for the choice of a Saga with read ahead (CR 702.155b): every option is a chapter number. */
export function isChapterChoice(d: Asked): boolean {
  return d.purpose === 'option' && d.options.length > 0 && d.options.every((o) => /^\d+$/.test(o));
}

/** True for the choice of a name the card gives ("Khans or Dragons"). */
export function isNamedChoice(d: Asked): boolean {
  return d.purpose === 'option' && !isChapterChoice(d);
}

/**
 * True for the choice among the instructions an effect offers as it resolves (D-175, CR 608.2d): "create a Food token or a Treasure
 * token". The options are the instructions, as the card words them.
 */
export function isEffectChoice(d: Asked): boolean {
  return d.purpose === 'effect';
}

/** "Create a Food token": an offered instruction with a capital, for a button. */
export function capitalised(text: string): string {
  return text === '' ? text : `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/** "Khans or Dragons", "A, B or C": the names the card offers, as it prints them. */
export function optionList(options: readonly string[]): string {
  return options.length <= 2
    ? options.join(' or ')
    : `${options.slice(0, -1).join(', ')} or ${options[options.length - 1]}`;
}

/**
 * The prompt: "As SYNTHETIC Siege of Choices enters, choose Khans or Dragons." and, for a Saga with read ahead, "Choose a chapter to
 * start with for SYNTHETIC Reading Rite."
 */
export function namedOptionPrompt(
  d: Pick<
    ChooseOptionDecision,
    'purpose' | 'options' | 'sourceName' | 'riotSoFar' | 'replacement'
  > &
    Partial<Pick<ChooseOptionDecision, 'vote' | 'seat'>>,
): string {
  if (isVoteChoice(d)) return votePrompt(d.options, d.vote, d.seat);
  if (isRiotChoice(d)) return riotPrompt(d.sourceName, d.riotSoFar ?? []);
  if (isReplacementChoice(d)) return replacementPrompt(d.replacement);
  if (isEffectChoice(d)) return `Choose one for ${d.sourceName}: ${optionList(d.options)}.`;
  return isChapterChoice(d)
    ? `Choose a chapter to start with for ${d.sourceName}.`
    : `As ${d.sourceName} enters, choose ${optionList(d.options)}.`;
}

/**
 * "Vote for profit or security. Opponent voted for profit." (CR 701.38a, D-194): the question to the player who votes now, and the votes already
 * cast, in the order they were made (a vote is public). `seat` is the player who votes now ("You"); any other seat is "Opponent" as in the log
 * (the web plays two seats).
 */
export function votePrompt(
  options: readonly string[],
  vote: ChooseOptionDecision['vote'],
  seat?: number,
): string {
  const question = `Vote for ${optionList(options)}.`;
  const cast = vote?.cast ?? [];
  if (cast.length === 0) return question;
  const who = (voter: number) => (voter === seat ? 'You' : 'Opponent');
  return `${question} ${cast.map((c) => `${who(c.seat)} voted for ${c.option}.`).join(' ')}`;
}

/**
 * "3 damage from Goblin Chainwhirler would be dealt to you. Several effects apply. Choose which to apply first." (CR 616.1, D-191): the
 * damage event as it is now (what is left of it after the effects already applied), its source and its recipient: "you" (the question goes to
 * the player who would take the damage) or the name of the permanent.
 */
export function replacementPrompt(replacement: ChooseOptionDecision['replacement']): string {
  if (replacement === undefined) return 'Several effects apply. Choose which to apply first.';
  if (replacement.event === undefined) {
    // D-221 (CR 616.1): the tokens the player would create, and the effects that replace their creation.
    const would = replacement.tokens.would.join(' and ');
    return `You would create ${would}. Several effects replace that. Choose which to apply first.`;
  }
  const { amount, combat, sourceName, to, toName } = replacement.event;
  const recipient = to.kind === 'player' ? 'you' : (toName ?? 'a permanent');
  return `${amount} ${combat ? 'combat ' : ''}damage from ${sourceName} would be dealt to ${recipient}. Several effects apply. Choose which to apply first.`;
}

/**
 * "Then: 0 damage": what reaches the recipient if the effect goes first and the rest follow the default order. It names the recipient when a redirection
 * (CR 614.9, D-192) changes it and something is still dealt: "Then: 3 damage to Ancient Adamantoise" (`to` is the words for the recipient it ends with).
 */
export function replacementThen(amount: number, to?: string): string {
  return `Then: ${amount} damage${amount > 0 && to !== undefined ? ` to ${to}` : ''}`;
}

type Outcome = Extract<
  NonNullable<ChooseOptionDecision['replacement']>['choices'][number],
  { kind: 'prevent' | 'redirect' }
>['outcome'];
type DamageEvent = NonNullable<
  Extract<NonNullable<ChooseOptionDecision['replacement']>, { event: object }>['event']
>;

/** The words of the recipient an outcome ends with when it is not the one asked about, or undefined when it is: "you" for a player, the name of a permanent. */
function newRecipient(asked: DamageEvent['to'], outcome: Outcome): string | undefined {
  const same =
    asked.kind === outcome.to.kind &&
    (asked.kind === 'player'
      ? asked.seat === (outcome.to as typeof asked).seat
      : asked.id === (outcome.to as typeof asked).id);
  if (same) return undefined;
  return outcome.to.kind === 'player' ? 'you' : (outcome.toName ?? 'a permanent');
}

/** What read ahead does with the chapter chosen (CR 702.155a, 702.155b), the line under the prompt of a chapter choice. */
export const CHAPTER_HINT =
  'It enters with that many lore counters. The chapters before it do not trigger this turn.';

/**
 * The text of each chapter of a Saga, read from its Oracle text: "I — Deal 2 damage ...", "II, III — Draw a card". The result maps a
 * chapter number to its words; a line that is not a chapter (the Saga reminder, "Read ahead") is left out.
 */
export function chapterTexts(oracleText: string): ReadonlyMap<number, string> {
  const chapters = new Map<number, string>();
  for (const line of oracleText.split('\n')) {
    const at = line.indexOf(' — ');
    if (at < 0) continue;
    const head = line.slice(0, at);
    if (!/^[IVX]+(?:, [IVX]+)*$/.test(head)) continue;
    const text = line.slice(at + 3).trim();
    for (const numeral of head.split(', ')) {
      const n = fromRoman(numeral);
      if (n !== null && !chapters.has(n)) chapters.set(n, text);
    }
  }
  return chapters;
}

/** The value of a Roman numeral of a chapter symbol, or null for one that is not. */
function fromRoman(numeral: string): number | null {
  for (let n = 1; n <= 20; n += 1) if (romanNumeral(n) === numeral) return n;
  return null;
}

/** One button of the dialog: the option to send, its label and the words under it (a chapter's text; none for a name). */
export interface NamedOptionRow {
  readonly option: string;
  readonly label: string;
  readonly detail: string | null;
}

/** The buttons, in the engine's order: "Chapter II" with its text for a Saga, the name itself for any other choice. */
export function namedOptionRows(
  d: Pick<ChooseOptionDecision, 'purpose' | 'options' | 'sourceOracleText' | 'replacement'>,
): readonly NamedOptionRow[] {
  if (isReplacementChoice(d)) {
    // One button for each effect, the words of the effect and, under them, what it leads to (the engine's `outcome`).
    return d.options.map((option) => {
      const choice = d.replacement?.choices.find((c) => c.option === option);
      const question = d.replacement;
      let detail: string | null = null;
      if (choice !== undefined && question?.event !== undefined && choice.kind !== 'tokens') {
        detail = replacementThen(
          choice.outcome.amount,
          newRecipient(question.event.to, choice.outcome),
        );
      } else if (choice?.kind === 'tokens') {
        // "Then: 3 Dragon": the tokens made if this effect goes first and the rest follow the default order.
        detail = `Then: ${choice.outcome.tokens.join(' and ') || 'no tokens'}`;
      }
      return { option, label: choice?.text ?? option, detail };
    });
  }
  if (isEffectChoice(d) || isVoteChoice(d)) {
    return d.options.map((option) => ({ option, label: capitalised(option), detail: null }));
  }
  if (isRiotChoice(d)) {
    return d.options.map((option) => ({
      option,
      label: RIOT_ROWS[option]?.label ?? option,
      detail: RIOT_ROWS[option]?.detail ?? null,
    }));
  }
  if (!isChapterChoice(d))
    return d.options.map((option) => ({ option, label: option, detail: null }));
  const texts = chapterTexts(d.sourceOracleText);
  return d.options.map((option) => ({
    option,
    label: `Chapter ${romanNumeral(Number(option))}`,
    detail: texts.get(Number(option)) ?? null,
  }));
}
