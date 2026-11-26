/**
 * The pure parts of the "choose one of the names the card gives" question (D-151, CR 614.12a, 607.2d, 702.155b): a `chooseOption`
 * decision of purpose `option`. Two cards ask it: "As this enchantment enters, choose Khans or Dragons" (the options are the names) and
 * a Saga with read ahead (the options are the numbers 1 to the final chapter, "choose a chapter to start with"). The dialog
 * (`OptionNamesDialog.tsx`) draws what these return, so the words are unit tested without a DOM.
 */
import type { ChooseOptionDecision } from '@commander-arena/engine';
import { colorName, optionText } from '../../game/chosen';
import { destroyReplacementPrompt, destroyReplacementThen } from '../../game/danitha-g4-text';
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

/**
 * True for the order of the two cards a melded permanent became as it left the battlefield (CR 712.21a, 712.21b, D-279): the options are the names of the two cards,
 * and the answer is the one that goes on top of the graveyard or the library, or, in exile, is exiled last.
 */
export function isMeldOrderChoice(d: Asked): boolean {
  return d.purpose === 'meldOrder';
}

/** "SYNTHETIC Dusk Squire and SYNTHETIC Dawn Squire were one permanent. Choose which goes on top of your graveyard." (CR 712.21a, 712.21b) */
export function meldOrderPrompt(
  sourceName: string,
  zone: NonNullable<ChooseOptionDecision['meldOrder']>['zone'] | undefined,
): string {
  const where =
    zone === 'exile'
      ? 'Choose which card is exiled last (has the later timestamp).'
      : `Choose which card goes on top of your ${zone ?? 'graveyard'}${zone === 'library' ? ' (the order is not revealed)' : ''}.`;
  return `${sourceName} were one permanent. ${where}`;
}

/** True for a vote (CR 701.38a, D-194): "starting with you, each player votes for profit or security". The options are the words of the card. */
export function isVoteChoice(d: Asked): boolean {
  return d.purpose === 'vote';
}

/**
 * True for "Remove any number of counters from among permanents" and "Move a counter from ... onto ..." (CR 122.1, 122.5, 608.2d): the controller takes one counter at a time. The options
 * are the counters that may be taken ("+1/+1 counter on Grizzly Bears") and, when they may stop, "Done".
 */
export function isCounterPickChoice(d: Asked): boolean {
  return d.purpose === 'counterPick';
}

/** True for the choice of a Saga with read ahead (CR 702.155b): every option is a chapter number. */
export function isChapterChoice(d: Asked): boolean {
  return d.purpose === 'option' && d.options.length > 0 && d.options.every((o) => /^\d+$/.test(o));
}

/** True for "As this creature enters, choose a player" (CR 614.12a, 607.2d): the options are `seat:<n>`, the players still in the game. */
export function isPlayerChoice(d: Asked): boolean {
  return d.purpose === 'player';
}

/** True for "As this creature enters, choose a card type" (CR 614.12a, 205.2a, D-376): the options are the card types of the engine. */
export function isCardTypeChoice(d: Asked): boolean {
  return d.purpose === 'cardType';
}

/** True for "gains protection from the color of your choice" (CR 702.16, 608.2d, D-451): the options are the five color letters, chosen as the effect resolves. */
export function isProtectionColorChoice(d: Asked): boolean {
  return d.purpose === 'protectionColor';
}

/** True for "gains protection from the card type of your choice" (CR 702.16a, 608.2d, D-514): the options are the nine card types, chosen as the effect resolves. */
export function isProtectionCardTypeChoice(d: Asked): boolean {
  return d.purpose === 'protectionCardType';
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
    Partial<Pick<ChooseOptionDecision, 'vote' | 'seat' | 'meldOrder' | 'forCost'>>,
): string {
  if (isMeldOrderChoice(d)) return meldOrderPrompt(d.sourceName, d.meldOrder?.zone);
  if (isVoteChoice(d)) return votePrompt(d.options, d.vote, d.seat);
  if (isRiotChoice(d)) return riotPrompt(d.sourceName, d.riotSoFar ?? []);
  if (isReplacementChoice(d)) return replacementPrompt(d.replacement);
  // CR 122.1, 122.5: the permanent and kind of counter taken, asked again while another may be.
  // CR 118.3, 602.2b: the counters removed to pay the cost of an ability, one at a time; Cancel takes the activation back.
  if (isCounterPickChoice(d)) {
    return d.forCost === true
      ? `Choose a counter to remove as a cost for ${d.sourceName}.`
      : `Choose a counter for ${d.sourceName}.`;
  }
  if (isEffectChoice(d)) {
    // D-585 (CR 105.1, 608.2d): "Choose a color." offers the five colors of the game.
    return d.options.join(',') === 'white,blue,black,red,green'
      ? `Choose a color for ${d.sourceName}.`
      : `Choose one for ${d.sourceName}: ${optionList(d.options)}.`;
  }
  if (isCardTypeChoice(d)) return `As ${d.sourceName} enters, choose a card type.`;
  if (isPlayerChoice(d)) return `As ${d.sourceName} enters, choose a player.`;
  // D-451 (CR 702.16, 608.2d): asked as the spell resolves, so there is no "enters".
  if (isProtectionColorChoice(d)) {
    return `Choose a color for ${d.sourceName}: protection from it until end of turn.`;
  }
  // D-514 (CR 702.16a, 608.2d): asked as the ability resolves, so there is no "enters".
  if (isProtectionCardTypeChoice(d)) {
    return `Choose a card type for ${d.sourceName}: protection from it until end of turn.`;
  }
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
  // CR 701.38b: a vote for players or permanents has no words to list; CR 701.38a ("secretly"): nobody sees the votes until all are cast.
  // CR 101.4, 701.38c ("Each opponent chooses fame or fortune"): a choice every player makes in turn, not a vote.
  const choice = vote?.choice === true;
  const question =
    vote?.choices === undefined
      ? `${choice ? 'Choose' : 'Vote for'} ${optionList(options)}.`
      : vote.choices.some((c) => c.kind === 'object')
        ? 'Vote for a creature.'
        : 'Vote for a player.';
  const secret = vote?.secret === true ? ' The votes are secret until everyone has voted.' : '';
  const cast = vote?.cast ?? [];
  if (secret !== '') return `${question}${secret}`;
  if (cast.length === 0) return question;
  const who = (voter: number) => (voter === seat ? 'You' : 'Opponent');
  return `${question} ${cast.map((c) => `${who(c.seat)} ${choice ? 'chose' : 'voted for'} ${c.option}.`).join(' ')}`;
}

/** The title of the dialog of the order of replacement effects: "Damage replacement", or "Destruction replacement" for the destruction of a permanent (D-418). */
export function replacementTitle(d: Pick<ChooseOptionDecision, 'replacement'>): string {
  const replacement = d.replacement;
  if (replacement !== undefined && 'lifeGain' in replacement) return 'Life gain replacement';
  return replacement?.destroy === undefined ? 'Damage replacement' : 'Destruction replacement';
}

/**
 * "3 damage from Goblin Chainwhirler would be dealt to you. Several effects apply. Choose which to apply first." (CR 616.1, D-191): the
 * damage event as it is now (what is left of it after the effects already applied), its source and its recipient: "you" (the question goes to
 * the player who would take the damage) or the name of the permanent.
 */
export function replacementPrompt(replacement: ChooseOptionDecision['replacement']): string {
  if (replacement === undefined) return 'Several effects apply. Choose which to apply first.';
  if (replacement.destroy !== undefined) {
    // D-418 (CR 616.1): the permanent that would be destroyed, and the effects that replace it.
    return destroyReplacementPrompt(replacement.destroy.objectName);
  }
  if ('lifeGain' in replacement) {
    return `You would gain ${replacement.lifeGain.amount} life. Several effects change that amount. Choose which to apply first.`;
  }
  if (!('event' in replacement) || replacement.event === undefined) {
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
  { kind: 'prevent' | 'redirect' | 'increase' }
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
  d: Pick<ChooseOptionDecision, 'purpose' | 'options' | 'sourceOracleText' | 'replacement'> &
    Partial<Pick<ChooseOptionDecision, 'vote' | 'seat'>>,
): readonly NamedOptionRow[] {
  // CR 701.38b: a vote for players or for permanents: one button for each, "You" or "Player 2", or the name of the permanent and who controls it.
  const choices = d.vote?.choices;
  if (isVoteChoice(d) && choices !== undefined) {
    const seatWord = (seat: number) => (seat === d.seat ? 'You' : `Player ${seat + 1}`);
    return d.options.map((option, i) => {
      const choice = choices[i];
      if (choice === undefined) return { option, label: option, detail: null };
      return choice.kind === 'player'
        ? { option, label: seatWord(choice.seat), detail: null }
        : {
            option,
            label: choice.name,
            detail: `Controlled by ${choice.controller === d.seat ? 'you' : seatWord(choice.controller)}`,
          };
    });
  }
  if (isReplacementChoice(d)) {
    // One button for each effect, the words of the effect and, under them, what it leads to (the engine's `outcome`).
    return d.options.map((option) => {
      const choice = d.replacement?.choices.find((c) => c.option === option);
      const question = d.replacement;
      let detail: string | null = null;
      if (choice !== undefined && 'aura' in choice.outcome) {
        // D-418: the Aura destroyed in place of the permanent, or the regeneration (tapped, removed from combat).
        detail = destroyReplacementThen(choice.outcome);
      } else if (choice?.kind === 'lifeGain') {
        detail = `Then: ${choice.outcome.amount} life`;
      } else if (
        choice !== undefined &&
        question?.event !== undefined &&
        choice.kind !== 'tokens' &&
        'amount' in choice.outcome
      ) {
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
  if (
    isEffectChoice(d) ||
    isVoteChoice(d) ||
    isCardTypeChoice(d) ||
    isProtectionCardTypeChoice(d)
  ) {
    return d.options.map((option) => ({ option, label: capitalised(option), detail: null }));
  }
  if (isCounterPickChoice(d)) {
    return d.options.map((option) => ({ option, label: option, detail: null }));
  }
  if (isPlayerChoice(d)) {
    return d.options.map((option) => ({
      option,
      label: optionText('player', option).replace(/^p/, 'P'),
      detail: null,
    }));
  }
  if (isProtectionColorChoice(d)) {
    return d.options.map((option) => ({ option, label: colorName(option), detail: null }));
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
