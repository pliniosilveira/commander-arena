/**
 * The words of Gift (CR 702.174, D-135), of the reflexive trigger "When you do, ..." (CR 603.12), of the sacrifice of
 * "any number" and of a library position ("third from the top"): composed from the engine's nodes and decisions, never
 * from a card name. Pure.
 */
import type { SeatId, StackAbility, Trigger } from '@commander-arena/engine';

const ORDINALS: Readonly<Record<number, string>> = {
  2: 'second',
  3: 'third',
  4: 'fourth',
  5: 'fifth',
  6: 'sixth',
  7: 'seventh',
  8: 'eighth',
  9: 'ninth',
  10: 'tenth',
};

/** "third from the top": where a card goes in a library below the first N - 1 cards (CR 401.7). */
export function positionPhrase(position: 'top' | 'bottom' | number): string {
  if (position === 'top') return 'on top of';
  if (position === 'bottom') return 'on the bottom of';
  return `${ORDINALS[position] ?? `${position}th`} from the top of`;
}

/**
 * The words of the Gift question for the opponent it names (`giftTo`), and for when they receive it: a permanent
 * spell's gift is given when it enters (CR 702.174c), an instant's or sorcery's before its other effects (CR 702.174b).
 * `types` are the card types of the spell on the stack (empty when the view does not show it: the timing is then left out).
 */
export function giftPrompt(
  whom: 'you' | 'opponent',
  types: readonly string[],
  spellName: string,
): string {
  const who = whom === 'you' ? 'you' : 'Opponent';
  const head = `Promise ${who} a gift?`;
  const timing =
    types.length === 0
      ? ''
      : types.includes('instant') || types.includes('sorcery')
        ? ` before the other effects of ${spellName}`
        : ` when ${spellName} enters`;
  // The only gift built is "a card" (CR 702.174d): the player draws one.
  return `${head} If you do, ${whom === 'you' ? 'you' : 'they'} draw a card${timing}.`;
}

/** ", promising Opponent a gift" for the log line of a spell cast with its gift promised (CR 702.174a); '' when none. */
export function giftedText(gift: SeatId | undefined, viewer: SeatId): string {
  if (gift === undefined) return '';
  return `, promising ${gift === viewer ? 'you' : 'Opponent'} a gift`;
}

/**
 * True for the triggered ability a "When you do, ..." makes (CR 603.12). The engine gives it a placeholder trigger
 * (the controller's end step) that nothing reads, and the view does not mark it; the one thing that tells it from an
 * "At the beginning of your end step" ability is the source's own text, which says "when you do" and not "end step".
 * A source that says both is worded as the end step it also has (true either way, only less exact).
 */
export function isReflexiveAbility(ability: StackAbility | undefined, sourceText: string): boolean {
  return ability?.kind === 'triggered' && isReflexiveTrigger(ability.trigger, sourceText);
}

/** The same test on a trigger alone (the order-triggers decision carries the trigger and the source's text). */
export function isReflexiveTrigger(trigger: Trigger | undefined, sourceText: string): boolean {
  if (trigger?.kind !== 'step' || trigger.step !== 'endStep' || trigger.whose !== 'you') {
    return false;
  }
  return /\bwhen you do\b/i.test(sourceText) && !/\bend step\b/i.test(sourceText);
}
