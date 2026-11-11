/**
 * CasualAgent and the cost-payment options of a spell (CR 601.2f-h, 702.51a, 702.126a, 702.66a, D-116, D-120):
 * which creatures to tap for Convoke, which artifacts for Improvise and which graveyard cards to exile for
 * Delve.
 *
 * The engine names a set that is sure to leave a cost the other sources can pay (`suggested`: what its payment
 * planner would tap, the fewest, lands first). The agent starts from it and keeps what it wants out of the
 * taps by swapping a resource for an equivalent one that is worth less to it (same colors, so it pays the same
 * mana, and one that makes no mana of its own, which the planner may have counted on). That is how it
 * taps the creatures it does not need and keeps the ones that attack or block:
 *  - a creature is worth what a permanent is (`permanentValue`), plus a bonus for one that could attack now
 *    (it is the agent's turn, before combat, and the creature is not summoning sick, has no defender),
 *    and for one that could block (the opponent has creatures that could attack it next turn: a creature
 *    tapped now stays tapped through the opponent's turn);
 *  - an artifact is worth what a permanent is, and one that makes mana is never swapped in;
 *  - a graveyard card is worth little when it is a land, an instant or a sorcery, more when it is a creature
 *    or another permanent that could come back (recursion is not weighed).
 * Never more than the engine's `suggested` count: extra taps buy nothing the agent could judge.
 */
import type {
  Action,
  ChoosePayOptionsDecision,
  GameView,
  ObjectId,
  ObjectView,
} from '@commander-arena/engine';
import { permanentValue } from './casual-permanents';
import { findObject, hasKeyword, isCreature, isLand } from './casual-view';

/** What the agent loses by tapping or exiling this one: the higher, the more it wants to keep it. */
function keepValue(view: GameView, d: ChoosePayOptionsDecision, id: ObjectId): number {
  const o = findObject(view, id);
  if (o === undefined) return Number.POSITIVE_INFINITY;
  if (d.mechanism === 'delve') return graveyardValue(o);
  let value = permanentValue(view, o);
  if (d.mechanism === 'convoke') {
    const mine = view.activeSeat === view.viewer;
    const beforeCombat = view.step === 'precombatMain' || view.step === 'beginningOfCombat';
    // A creature that could attack this turn is worth keeping untapped (a tapped creature cannot attack).
    if (mine && beforeCombat && !o.summoningSick && !hasKeyword(o, 'defender')) value += 20;
    // A creature that stays tapped through the opponent's turn cannot block.
    if (opponentCouldAttack(view)) value += 5;
  }
  return value;
}

/** Whether the opponent has a creature that could attack the agent on its next turn. */
function opponentCouldAttack(view: GameView): boolean {
  return view.battlefield.some(
    (o) => o.controller !== view.viewer && isCreature(o) && !hasKeyword(o, 'defender'),
  );
}

/** A card in the graveyard is worth keeping more when it is a permanent a card could bring back. */
function graveyardValue(o: ObjectView): number {
  if (isLand(o)) return 0;
  if (o.types.includes('instant') || o.types.includes('sorcery')) return 1;
  return 2 + (o.manaCost === null ? 0 : o.manaCost.length) / 10;
}

/** Whether the object makes mana of its own, so the planner may have counted on it (a Sol Ring, an Elf). */
const makesMana = (o: ObjectView): boolean => /\{T\}[^.]*:[^.]*\bAdd\b/i.test(o.oracleText);

/** Whether two candidates pay for the same mana: the same colors (convoke), or any (generic only). */
function equivalent(d: ChoosePayOptionsDecision, a: ObjectId, b: ObjectId): boolean {
  const x = [...(d.colors?.[a] ?? [])].sort().join('');
  const y = [...(d.colors?.[b] ?? [])].sort().join('');
  return x === y;
}

export function choosePayOptionsAnswer(view: GameView, d: ChoosePayOptionsDecision): Action {
  const chosen = [...d.suggested];
  const byValue = [...chosen].sort(
    (a, b) => keepValue(view, d, b) - keepValue(view, d, a) || (a < b ? -1 : 1),
  );
  for (const out of byValue) {
    const swapIn = d.candidates
      .filter((c) => {
        if (chosen.includes(c) || !equivalent(d, out, c)) return false;
        const o = findObject(view, c);
        // The planner may have counted on a creature or artifact that makes mana: leave it untapped.
        return o !== undefined && !(d.mechanism !== 'delve' && makesMana(o));
      })
      .filter((c) => keepValue(view, d, c) < keepValue(view, d, out))
      .sort((a, b) => keepValue(view, d, a) - keepValue(view, d, b) || (a < b ? -1 : 1))[0];
    if (swapIn !== undefined) chosen[chosen.indexOf(out)] = swapIn;
  }
  return { kind: 'choosePayOptions', objects: d.candidates.filter((c) => chosen.includes(c)) };
}
