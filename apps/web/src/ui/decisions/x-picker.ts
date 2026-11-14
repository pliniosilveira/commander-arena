/**
 * The pure parts of the "announce X" question (CR 107.3a, 601.2b, D-103, D-107): the starting value,
 * the clamp, the prompt, what each X costs and the keys. `XDialog.tsx` only draws what these return.
 */
import type { ChooseXDecision } from '@commander-arena/engine';
import { unlessCostText } from '../../game/cost-text';
import { repeatedCost } from '../../game/dinosaurs-text';

type Range = Pick<ChooseXDecision, 'min' | 'max'>;

/** True for the number of times a Multikicker cost is paid (CR 702.33c, D-110), asked like X. */
export function isMultikicker(d: Partial<Pick<ChooseXDecision, 'purpose'>>): boolean {
  return d.purpose === 'multikicker';
}

/** True for the number of times a Replicate cost is paid (CR 702.56a, D-129), asked like a Multikicker. */
export function isReplicate(d: Partial<Pick<ChooseXDecision, 'purpose'>>): boolean {
  return d.purpose === 'replicate';
}

/** True for "you may pay any amount of {R}" (CR 118.1, D-151): how many times to pay one symbol, from 0, with no way back. */
export function isPayAnyAmount(d: Partial<Pick<ChooseXDecision, 'purpose'>>): boolean {
  return d.purpose === 'payAnyAmount';
}

/** True for "may draw up to two cards" (CR 121.1, D-217): how many cards the player draws, from 0, with no way back. */
export function isDrawUpTo(d: Partial<Pick<ChooseXDecision, 'purpose'>>): boolean {
  return d.purpose === 'drawUpTo';
}

/** True for a question that counts how many times a cost is paid or how many cards are drawn: Multikicker, Replicate, any amount of a symbol, draw up to. */
export function isCount(d: Partial<Pick<ChooseXDecision, 'purpose'>>): boolean {
  return isMultikicker(d) || isReplicate(d) || isPayAnyAmount(d) || isDrawUpTo(d);
}

/** "Draw up to 2 cards for Arcane Denial?" (D-217): the prompt of the number of cards a player may draw. */
export function drawUpToPrompt(d: Pick<ChooseXDecision, 'sourceName' | 'max'>): string {
  return `${d.sourceName} lets you draw up to ${d.max} ${d.max === 1 ? 'card' : 'cards'}. How many?`;
}

/** "Draw 2 cards" / "Don't draw". */
export function drawUpToButtonText(x: number): string {
  return x === 0 ? "Don't draw" : `Draw ${x} ${x === 1 ? 'card' : 'cards'}`;
}

/**
 * The value shown first: 1 when X can be 1 or more (X = 0 is rarely the point), else the minimum.
 * A multikicker count starts at the minimum, 0: not kicking is an ordinary answer, and a player who
 * confirms without looking should not pay extra.
 */
export function initialX(d: Range & Partial<Pick<ChooseXDecision, 'purpose'>>): number {
  if (isCount(d)) return d.min;
  return Math.min(d.max, Math.max(d.min, 1));
}

/** The value kept between `min` and `max`; text that is not a whole number reads as `min`. */
export function clampX(d: Range, value: number): number {
  if (!Number.isFinite(value)) return d.min;
  return Math.min(d.max, Math.max(d.min, Math.trunc(value)));
}

/**
 * What each point of X costs, in the words of the card: "Each X costs {1}" ({X} once in the cost),
 * "Each X costs {2}" ({X}{X}), "Each X costs 1 life" (pay X life), both joined by "and". No final
 * period: `xPrompt` joins it to what the player can afford.
 */
export function perXText(d: Pick<ChooseXDecision, 'perX'>): string {
  const parts: string[] = [];
  if (d.perX.mana > 0) parts.push(`{${d.perX.mana}}`);
  if (d.perX.life > 0) parts.push(`${d.perX.life} life`);
  // D-200 (CR 606.5): the X of "[-X]" removes that many loyalty counters.
  if ((d.perX.loyalty ?? 0) > 0) parts.push(`${d.perX.loyalty} loyalty`);
  // D-1424 (CR 107.3a): "Sacrifice X creatures" sacrifices that many permanents.
  const sacrifices = d.perX.sacrifice ?? 0;
  if (sacrifices > 0)
    parts.push(sacrifices === 1 ? 'a sacrificed permanent' : `${sacrifices} sacrificed permanents`);
  const discard = discardXText(d);
  if (parts.length === 0) return discard === '' ? 'X costs nothing extra' : discard;
  return `Each X costs ${parts.join(' and ')}${discard === '' ? '' : `, and you ${discard.replace(/^D/, 'd')}`}`;
}

/**
 * "Discard X cards" for the additional cost of that name (D-386, CR 701.9: "discard X cards" costs X cards of the hand for each point of X), "Discard 2X cards" when
 * each point costs two; "" when X discards nothing.
 */
export function discardXText(d: Pick<ChooseXDecision, 'perX'>): string {
  const n = d.perX.discard ?? 0;
  if (n <= 0) return '';
  return `Discard ${n === 1 ? 'X' : `${n}X`} cards`;
}

/** "Choose X for SYNTHETIC Fireball." or, for an activated ability, "... for Name's ability." */
export function xHeading(d: Pick<ChooseXDecision, 'sourceName' | 'purpose'>): string {
  return d.purpose === 'ability'
    ? `Choose X for ${d.sourceName}'s ability.`
    : `Choose X for ${d.sourceName}.`;
}

/**
 * The whole prompt: "Choose X for SYNTHETIC Fireball. Each X costs {1}; you can afford up to X = 6."
 * `max` is the engine's own answer to what the player can pay for the whole cost (kicker, tax and
 * reductions included), so the page never computes it.
 */
export function xPrompt(
  d: Pick<ChooseXDecision, 'sourceName' | 'purpose' | 'perX' | 'max' | 'cost'>,
): string {
  if (isMultikicker(d)) return multikickerPrompt(d);
  if (isReplicate(d)) return replicatePrompt(d);
  if (isPayAnyAmount(d)) return payAmountPrompt(d);
  if (isDrawUpTo(d)) return drawUpToPrompt(d);
  // D-386: a cost that is only cards to discard says what it discards and the most X the hand and the targets allow.
  const onlyDiscard = (d.perX.discard ?? 0) > 0 && d.perX.mana + d.perX.life === 0;
  if (onlyDiscard && (d.perX.loyalty ?? 0) === 0) {
    return `${xHeading(d)} ${discardXText(d)}; you can choose up to X = ${d.max}.`;
  }
  return `${xHeading(d)} ${perXText(d)}; you can afford up to X = ${d.max}.`;
}

/** What X = `x` pays for the X part of the cost: "{3}", "3 life", "{6} and 3 life"; "" when free. */
export function xCostAt(d: Pick<ChooseXDecision, 'perX'>, x: number): string {
  const parts: string[] = [];
  if (d.perX.mana > 0) parts.push(`{${d.perX.mana * x}}`);
  if (d.perX.life > 0) parts.push(`${d.perX.life * x} life`);
  if ((d.perX.loyalty ?? 0) > 0) parts.push(`${(d.perX.loyalty ?? 0) * x} loyalty`);
  const discard = (d.perX.discard ?? 0) * x;
  if (discard > 0) parts.push(`discard ${discard} ${discard === 1 ? 'card' : 'cards'}`);
  const sacrifice = (d.perX.sacrifice ?? 0) * x;
  if (sacrifice > 0)
    parts.push(`sacrifice ${sacrifice} ${sacrifice === 1 ? 'permanent' : 'permanents'}`);
  return parts.join(' and ');
}

/** What a key does in the number field: a change of X, or a jump. Null when the field handles it. */
export type XKey =
  | { readonly kind: 'step'; readonly by: number }
  | { readonly kind: 'to'; readonly value: 'min' | 'max' }
  | { readonly kind: 'confirm' }
  | { readonly kind: 'cancel' };

export function xKey(key: string): XKey | null {
  switch (key) {
    case 'ArrowUp':
      return { kind: 'step', by: 1 };
    case 'ArrowDown':
      return { kind: 'step', by: -1 };
    case 'PageUp':
      return { kind: 'step', by: 5 };
    case 'PageDown':
      return { kind: 'step', by: -5 };
    case 'Enter':
      return { kind: 'confirm' };
    case 'Escape':
      return { kind: 'cancel' };
    default:
      return null;
  }
}

/**
 * The number after the text in the field changed: digits only, empty reads as the minimum, and
 * `shown` is what the field displays afterwards (no leading zeros, kept within the range).
 */
export function typedX(d: Range, text: string): { value: number; shown: string } {
  const digits = text.replace(/\D/g, '');
  if (digits === '') return { value: d.min, shown: '' };
  const value = clampX(d, Number(digits));
  return { value, shown: String(value) };
}

/** "Pay the multikicker cost {2} how many times? You can afford up to 3." */
export function multikickerPrompt(d: Pick<ChooseXDecision, 'cost' | 'max'>): string {
  const cost = d.cost === undefined ? '' : ` ${unlessCostText(d.cost)}`;
  return `Pay the multikicker cost${cost} how many times? You can afford up to ${d.max}.`;
}

/** "Don't kick", "Kick once", "Kick 3 times": the confirm button of the multikicker question. */
export function kickButtonText(times: number): string {
  if (times <= 0) return "Don't kick";
  return times === 1 ? 'Kick once' : `Kick ${times} times`;
}

/** What `times` kicks (or replications) add to the cost: "{1}{G} × 2", "2 life × 3"; "" for none. */
export function kickCostAt(d: Pick<ChooseXDecision, 'cost'>, times: number): string {
  if (times <= 0 || d.cost === undefined) return '';
  return `${unlessCostText(d.cost)} × ${times}`;
}

/** "Replicate {2}: how many times? You can afford up to 3." */
export function replicatePrompt(d: Pick<ChooseXDecision, 'cost' | 'max'>): string {
  const cost = d.cost === undefined ? '' : ` ${unlessCostText(d.cost)}`;
  return `Replicate${cost}: how many times? You can afford up to ${d.max}.`;
}

/** "Don't replicate", "Replicate once", "Replicate 3 times": the confirm button of the replicate question. */
export function replicateButtonText(times: number): string {
  if (times <= 0) return "Don't replicate";
  return times === 1 ? 'Replicate once' : `Replicate ${times} times`;
}

/** The symbols of the cost paid each time: `['R']` for "any amount of {R}"; none when the decision names no cost. */
export function payAmountSymbols(d: Pick<ChooseXDecision, 'cost'>): readonly string[] {
  return (d.cost ?? []).flatMap((c) => (c.kind === 'mana' ? [...c.symbols] : []));
}

/** "Pay any amount of {R} for SYNTHETIC Ember Tyrant's ability. You can pay up to 3." (D-151, CR 118.1). */
export function payAmountPrompt(d: Pick<ChooseXDecision, 'cost' | 'max' | 'sourceName'>): string {
  const symbols = payAmountSymbols(d)
    .map((s) => `{${s}}`)
    .join('');
  const of = symbols === '' ? '' : ` of ${symbols}`;
  return `Pay any amount${of} for ${d.sourceName}'s ability. You can pay up to ${d.max}.`;
}

/** What `times` payments cost: "{R}{R}"; "" for none (the symbols add up as the cost of a Multikicker does). */
export function payAmountCostAt(d: Pick<ChooseXDecision, 'cost'>, times: number): string {
  return repeatedCost(payAmountSymbols(d), times);
}

/** "Don't pay", "Pay {R}{R}": the confirm button of the question (nothing to pay is a way out, never a Cancel). */
export function payAmountButtonText(d: Pick<ChooseXDecision, 'cost'>, times: number): string {
  return times <= 0 ? "Don't pay" : `Pay ${payAmountCostAt(d, times)}`;
}
