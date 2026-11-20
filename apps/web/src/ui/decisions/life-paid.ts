/**
 * The pure parts of "As this artifact enters, pay any amount of life" (CR 119.4, 614.12): a `chooseOption` decision of purpose `lifePaid`
 * whose options are the whole numbers from 0 to the player's life total. The dialog (`LifePaidDialog.tsx`) draws what these return, so the
 * words and the clamping are unit tested without a DOM.
 */
import type { ChooseOptionDecision } from '@commander-arena/engine';

type Asked = Pick<ChooseOptionDecision, 'purpose' | 'options'>;

/** True for the question "pay any amount of life" as a permanent enters. */
export function isLifePaidChoice(d: Pick<ChooseOptionDecision, 'purpose'>): boolean {
  return d.purpose === 'lifePaid';
}

/** The most life that can be paid: the last option (the player's life total, or 0 when it cannot change). */
export function maxLifePaid(d: Asked): number {
  const last = d.options[d.options.length - 1];
  const n = last === undefined ? 0 : Number(last);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

/** The amount a typed text stands for, kept between 0 and the most that can be paid; text that is not a number is 0. */
export function clampLifePaid(d: Asked, value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(maxLifePaid(d), Math.max(0, Math.trunc(value)));
}

/** "As Phyrexian Processor enters, pay any amount of life." */
export function lifePaidPrompt(d: Pick<ChooseOptionDecision, 'sourceName'>): string {
  return `As ${d.sourceName} enters, pay any amount of life.`;
}

/** "Pay 4 life" or "Pay no life": the confirm button. */
export function lifePaidButton(amount: number): string {
  return amount === 0 ? 'Pay no life' : `Pay ${amount} life`;
}

/** "You have 40 life." and what is left after the payment: "You would have 36 life." */
export function lifePaidDetail(d: Asked, amount: number): string {
  const max = maxLifePaid(d);
  return `You have ${max} life. You would have ${max - amount} life left.`;
}
