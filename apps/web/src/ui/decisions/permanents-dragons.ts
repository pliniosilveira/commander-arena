/**
 * The question of the Dragons slice (D-151) that the engine asks as a `choosePermanent`: "As this artifact enters, you may have it
 * become a copy of any creature on the battlefield" (`entersCopy`, CR 707.9, 614.12). The permanent has not entered yet, so the
 * decision names it as `subject`; `min` is 0 when copying is optional, and the answer is the creature or none. The words read the
 * decision and the objects it names and nothing else; the engine stays the judge of every answer. Pure.
 */
import type { ChoosePermanentDecision, ObjectId } from '@commander-arena/engine';
import { type Index, nameOf, plural } from './lookup';

type Asked = Pick<ChoosePermanentDecision, 'purpose'>;

/** True for the choice of the permanent that a permanent entering becomes a copy of. */
export function isEntersCopy(decision: Asked): boolean {
  return decision.purpose === 'entersCopy';
}

/** The permanent that is entering, by name: its own object while it is in a hand or on the stack, else "it". */
function entering(
  decision: Pick<ChoosePermanentDecision, 'subject' | 'source'>,
  index: Index,
): string {
  const id = decision.subject ?? decision.source;
  return index.get(id) === undefined ? 'the permanent' : nameOf(index, id);
}

/** " until end of turn" when the card's own text says the copy lasts that long ("... until end of turn, except it has haste"), else ''. */
function lasts(
  decision: Pick<ChoosePermanentDecision, 'subject' | 'source'>,
  index: Index,
): string {
  const text = index.get(decision.subject ?? decision.source)?.oracleText ?? '';
  return /\bbecome a copy of [^.]*until end of turn/i.test(text) ? ' until end of turn' : '';
}

/**
 * "Choose a creature to copy until end of turn, or none, as SYNTHETIC Cursed Looking Glass enters." The kind of permanent is read from
 * the permanents the engine lists ("creature" when they all are); "or none" says that declining is an answer.
 */
export function entersCopyPrompt(
  decision: Pick<ChoosePermanentDecision, 'subject' | 'source' | 'legal' | 'min'>,
  index: Index,
  noun: string,
): string {
  const none = decision.min === 0 ? ', or none' : '';
  return `Choose ${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun} to copy${lasts(decision, index)}${none}, as ${entering(decision, index)} enters.`;
}

/** The title of its dock panel: "Copy a creature". */
export function entersCopyTitle(noun: string): string {
  return `Copy ${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`;
}

/** The bar's second line: what a click does, and what Confirm does with nothing chosen. */
export function entersCopyDetail(
  chosen: readonly ObjectId[],
  decision: Pick<ChoosePermanentDecision, 'min'>,
  index: Index,
): string {
  const [one] = chosen;
  if (one !== undefined) return `Copying ${nameOf(index, one)}. Click it again to take it back.`;
  return decision.min === 0
    ? 'Click a creature to copy it, or Confirm to copy none.'
    : 'Click a creature to copy it.';
}

/** The label of Confirm: "Copy it", or "Copy nothing" when none is chosen and that is allowed. */
export function entersCopyConfirm(chosen: readonly ObjectId[]): string {
  return chosen.length === 0 ? 'Copy nothing' : 'Copy it';
}

/** "1 creature chosen": how many are chosen, for the panel. */
export function entersCopyCount(chosen: readonly ObjectId[]): string {
  return `${plural(chosen.length, 'creature')} chosen`;
}
