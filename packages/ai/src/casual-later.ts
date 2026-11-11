/**
 * CasualAgent choices for the "cast later" family (D-128): Suspend (CR 702.62), Madness (CR 702.35) and Foretell
 * (CR 702.143). The engine lists the special actions `suspend` and `foretell` as priority options only when the
 * player could take them and pay for them, so the agent only decides whether they are worth taking now:
 * - Suspend and Foretell are taken in the agent's own main phase, with the stack empty, and only once no worthwhile
 *   spell is left to cast from the hand (`casual-priority.ts` calls `chooseSpecialAction` after the spells). A suspended
 *   permanent comes back free with haste, a suspended spell is cast free, so the agent suspends a permanent card
 *   (or a spell worth casting at all, `worth`) and prefers the fewest time counters, then the biggest card. It
 *   foretells the card whose later cast saves the most mana (printed mana value against its foretell cost, at least
 *   one mana saved); the {2} it pays now is mana it had no other use for this turn.
 * - A foretold card in exile is cast like any other spell (`casual-alt-costs.ts` picks the `foretell` option).
 * - Questions: "you may play it without paying its mana cost" (Suspend) and "you may cast it by paying [cost]"
 *   (Madness) are answered yes when the card is worth casting now (`worth`: a hostile target exists for a spell that
 *   needs one); the engine asks only when the card could be cast and the cost paid. Declining a madness card costs
 *   it (it goes to the graveyard), so the agent says yes to every creature and permanent.
 * - A card with madness is the first card the agent discards in the cleanup step: discarding it is a gain.
 */
import {
  type Action,
  type ConfirmOptionalDecision,
  type GameView,
  manaValue,
  type ObjectView,
  type PriorityDecision,
} from '@commander-arena/engine';
import { findObject, manaValueOf } from './casual-view';

/** Whether the card has madness (its rules text says so). */
export const hasMadness = (o: ObjectView): boolean => /\bmadness\b/i.test(o.oracleText);

/** Whether a worthwhile permanent or spell: a function the caller gives, `worthCasting` of `casual-priority.ts`. */
export type Worth = (view: GameView, card: ObjectView) => boolean;

/** The answer to the question of a suspend or madness ability, or null for any other question. */
export function laterAnswer(
  view: GameView,
  d: ConfirmOptionalDecision,
  worth: Worth,
): Action | null {
  if (d.purpose !== 'suspend' && d.purpose !== 'madness') return null;
  const card = d.subject === undefined ? undefined : findObject(view, d.subject);
  if (card === undefined) return { kind: 'acceptOptional' };
  return worth(view, card) ? { kind: 'acceptOptional' } : { kind: 'declineOptional' };
}

/** The special action the agent takes now, or null. */
export function chooseSpecialAction(
  view: GameView,
  d: PriorityDecision,
  worth: Worth,
): Action | null {
  const mine = view.activeSeat === view.viewer;
  const main = view.step === 'precombatMain' || view.step === 'postcombatMain';
  if (!mine || !main || view.stack.length > 0) return null;

  type Candidate = { readonly action: Action; readonly rank: readonly number[] };
  const candidates: Candidate[] = [];
  for (const o of d.options) {
    if (o.kind !== 'suspend' && o.kind !== 'foretell') continue;
    const card = findObject(view, o.object);
    if (card === undefined) continue;
    if (o.kind === 'suspend') {
      const special = card.specialActions?.find((a) => a.kind === 'suspend');
      const permanent = !card.types.includes('instant') && !card.types.includes('sorcery');
      if (!permanent && !worth(view, card)) continue;
      // Permanents first, then the fewest time counters, then the biggest card.
      candidates.push({
        action: { kind: 'suspend', object: o.object },
        rank: [permanent ? 0 : 1, special?.counters ?? 99, -manaValueOf(card)],
      });
    } else {
      const special = card.specialActions?.find((a) => a.kind === 'foretell');
      const saved =
        manaValueOf(card) - (special?.castCost === undefined ? 0 : manaValue(special.castCost));
      if (saved < 1) continue;
      candidates.push({ action: { kind: 'foretell', object: o.object }, rank: [2, -saved, 0] });
    }
  }
  candidates.sort((a, b) => {
    for (let i = 0; i < a.rank.length; i += 1) {
      const diff = (a.rank[i] ?? 0) - (b.rank[i] ?? 0);
      if (diff !== 0) return diff;
    }
    return 0;
  });
  return candidates[0]?.action ?? null;
}
