/**
 * CasualAgent choices for the "cast later" family (D-128): Suspend (CR 702.62), Madness (CR 702.35), Foretell
 * (CR 702.143) and Miracle (CR 702.94, D-971, D-972). The engine lists the special actions `suspend` and `foretell` as priority options only when the
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
 * - Miracle (CR 702.94a, D-972): the agent reveals the card it just drew only when it is worth casting now (`worth`) and the untapped lands and
 *   mana in its pool cover the miracle cost (an {X} counted as 1 for an instant or sorcery, as 0 for a permanent): revealing is public
 *   and gives the opponent the card for nothing otherwise. The question that follows (cast it for the miracle cost?) is answered as
 *   Madness's is: yes when the card is worth casting.
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

const BASIC_TYPE: Readonly<Record<string, string>> = {
  W: 'Plains',
  U: 'Island',
  B: 'Swamp',
  R: 'Mountain',
  G: 'Forest',
};

/** Whether the land can make mana of the color: its basic land type, or the symbol in its text ("Add {W}", "any color"). */
const makes = (land: ObjectView, color: string): boolean =>
  (land.subtypes as readonly string[]).includes(BASIC_TYPE[color] ?? '') ||
  land.oracleText.includes(`{${color}}`) ||
  /\bany (?:one )?color\b/i.test(land.oracleText);

/**
 * Whether the agent's untapped lands and the mana in its pool cover the mana cost of the decision (a miracle cost): each colored symbol
 * needs an untapped land that makes its color, the rest is paid with what is left and the pool; a number counts for what it is, an {X}
 * for 1 when the card is an instant or a sorcery (X = 0 does nothing) and for 0 otherwise. Mana from other sources is not counted, so
 * the agent is cautious, never wrong the other way.
 */
function coversMiracleCost(view: GameView, d: ConfirmOptionalDecision, card: ObjectView): boolean {
  const nonPermanent = card.types.includes('instant') || card.types.includes('sorcery');
  const seat = view.seats.find((s) => s.id === view.viewer);
  const free = view.battlefield.filter(
    (p) => p.controller === view.viewer && p.types.includes('land') && !p.tapped,
  );
  let generic = 0;
  for (const c of d.cost ?? []) {
    if (c.kind !== 'mana') return false;
    for (const s of c.symbols) {
      if (s === 'X') generic += nonPermanent ? 1 : 0;
      else if (/^[0-9]+$/.test(s)) generic += Number(s);
      else if (BASIC_TYPE[s] === undefined) generic += 1;
      else {
        const at = free.findIndex((land) => makes(land, s));
        if (at < 0) return false;
        free.splice(at, 1);
      }
    }
  }
  return free.length + (seat?.manaPool.length ?? 0) >= generic;
}

/** The answer to the question of a suspend, madness or miracle ability, or null for any other question. */
export function laterAnswer(
  view: GameView,
  d: ConfirmOptionalDecision,
  worth: Worth,
): Action | null {
  if (
    d.purpose !== 'suspend' &&
    d.purpose !== 'madness' &&
    d.purpose !== 'miracle' &&
    d.purpose !== 'miracleReveal'
  ) {
    return null;
  }
  const card = d.subject === undefined ? undefined : findObject(view, d.subject);
  if (card === undefined) return { kind: 'acceptOptional' };
  if (d.purpose === 'miracleReveal') {
    return coversMiracleCost(view, d, card) && worth(view, card)
      ? { kind: 'acceptOptional' }
      : { kind: 'declineOptional' };
  }
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
