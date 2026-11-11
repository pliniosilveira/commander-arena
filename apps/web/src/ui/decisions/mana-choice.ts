/**
 * Words for the mana a source can make: a color, or one of several combinations ("{R}{R}, {R}{W} or
 * {W}{W}", D-099), and the life a mana ability costs ("{T}, Pay 1 life: Add ...").
 */
import type { ManaColor, ObjectView } from '@commander-arena/engine';

/** "{R}{W}": a combination as it reads on a card. */
export function comboText(combination: readonly ManaColor[]): string {
  return combination.map((c) => `{${c}}`).join('');
}

/** "{R}{R}, {R}{W} or {W}{W}". */
export function comboListText(combinations: readonly (readonly ManaColor[])[]): string {
  const texts = combinations.map(comboText);
  if (texts.length <= 1) return texts[0] ?? '';
  return `${texts.slice(0, -1).join(', ')} or ${texts[texts.length - 1]}`;
}

/** The label of one way to use a mana ability: "Add W", "Add {R}{W}", or the ability's number. */
export function manaChoiceLabel(
  abilityIndex: number,
  color: ManaColor | null,
  combination: readonly ManaColor[] | undefined,
): string {
  if (combination !== undefined) return `Add ${comboText(combination)}`;
  return color === null ? `Ability ${abilityIndex + 1}` : `Add ${color}`;
}

/** "Pay 1 life": what a label says for a source whose mana costs life; empty for none. */
export function lifeNote(life: number): string {
  return life > 0 ? `Pay ${life} life` : '';
}

const MANA_SENTENCE = /^([^:]+):\s*Add\b(.*)$/i;
const ANY_CHOICE = /any (color|type)|could produce|color identity/i;

/**
 * The life a mana ability of the card costs, read from the card's rules text, which is all the view
 * says about a mana ability: the sentence "{T}, Pay 1 life: Add ..." whose mana fits what the option
 * makes. Zero when no sentence says it, or when sentences that fit disagree (the label then says
 * nothing rather than guess; the log's "You pay N life." is read from the engine's own event).
 * A mana ability that a static ability gave the permanent is not in its own text and is not read.
 */
export function lifeCostOf(
  card: Pick<ObjectView, 'oracleText'> | undefined,
  color: ManaColor | null,
  combination?: readonly ManaColor[],
): number {
  // Test doubles of a card may carry no text; a real view always does.
  const text = card?.oracleText ?? '';
  if (text === '') return 0;
  const wanted = combination ?? (color === null ? [] : [color]);
  const costs = new Set<number>();
  for (const sentence of text.split(/\n|(?<=\.)\s+/)) {
    const m = MANA_SENTENCE.exec(sentence.trim());
    if (m === null) continue;
    const [, cost = '', made = ''] = m;
    const fits =
      wanted.length === 0 ||
      wanted.every((c) => made.includes(`{${c}}`)) ||
      (combination === undefined && ANY_CHOICE.test(made));
    if (!fits) continue;
    const life = /pay (\d+) life/i.exec(cost);
    costs.add(life === null ? 0 : Number(life[1]));
  }
  const [only, ...rest] = [...costs];
  return only !== undefined && rest.length === 0 ? only : 0;
}
