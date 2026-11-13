/**
 * CasualAgent and X (D-103): the value it announces for a spell or ability with an {X} in its cost,
 * and where the damage of an "X damage" spell goes once X is known.
 *
 * The engine offers every X from 0 to the most the agent could pay (`ChooseXDecision`). The agent
 * spends all of it unless the text it can read says that more would be wasted:
 *  - "deals X damage": enough to kill the opponent when that is within reach, else enough to kill the
 *    opposing creature it would aim at (the one with the most power among those the most it could pay
 *    would kill; the targets decision, `chooseXDamageTarget`, aims the same way), never more than that;
 *    with nothing it can kill, all of it at the opponent's face when the text allows a player;
 *  - "draw X cards": all of it, but one card fewer than its library holds, so it never draws itself out;
 *  - "pay X life": no more X than leaves it above `PAY_LIFE_ABOVE`, as for any life it pays;
 *  - "discard X cards" (D-1190): no more X than the cards it is glad to lose (`expendableCount`);
 *  - anything else ("X +1/+1 counters", "gain X life", "enters with X counters"): all of it;
 *  - a creature that "enters with X +1/+1 counters" (issue 131, D-237): all of it, and never less than the X
 *    that keeps it alive (`minXToSurvive`): a 0/0 that enters with no counter dies at once (CR 704.5f).
 * The view carries only rules text, so what X does is read from it, as in `casual-helpful.ts`.
 */
import type {
  Action,
  ChooseXDecision,
  ChosenTarget,
  GameView,
  ObjectView,
  TargetsDecision,
} from '@commander-arena/engine';
import { expendableCount } from './casual-costs';
import { PAY_LIFE_ABOVE } from './casual-permanents';
import {
  effectiveCost,
  findObject,
  fixedLifeOf,
  opponentLife,
  opposingCreatures,
  ownHand,
  ownLife,
  powerOf,
  toughnessOf,
} from './casual-view';

const DAMAGE_X = /deals X damage/i;
const DRAW_X = /draw X cards?/i;
const CAN_HIT_PLAYER = /any target|target (player|opponent)/i;
const CAN_HIT_CREATURE = /any target|target creature/i;

/** "This creature enters with X +1/+1 counters on it": X is the size of the permanent (CR 107.3m). */
const ENTERS_WITH_X_COUNTERS = /\benters?(?: the battlefield)? with X \+1\/\+1 counters?/i;

/**
 * The least X for which a creature that enters with X +1/+1 counters survives its arrival: its toughness is
 * the printed one plus X, and a creature with toughness 0 or less is put into the graveyard (CR 704.5f), so
 * X must be at least 1 minus the printed toughness (1 for a 0/0). 0 for a creature whose size X does not
 * set, for a body that already survives X = 0, and for anything but a creature. A static effect that
 * would keep a smaller one alive (a lord) is not counted: the agent is cautious, never wrong the other way.
 */
export function minXToSurvive(o: ObjectView): number {
  if (!o.types.includes('creature') || !ENTERS_WITH_X_COUNTERS.test(o.oracleText)) return 0;
  return Math.max(0, 1 - toughnessOf(o));
}

/** The damage it takes to destroy the creature: what it can still take before lethal damage. */
const needed = (o: ObjectView): number => Math.max(1, toughnessOf(o) - o.damage);

/**
 * The creature to aim `x` damage at: the opposing creature with the most power among those `x`
 * kills, the first listed on a tie; undefined when `x` kills none of them. `among` limits the
 * candidates to what the targets decision lists, when it is known.
 */
function killableCreature(
  view: GameView,
  x: number,
  among?: ReadonlySet<string>,
): ObjectView | undefined {
  let best: ObjectView | undefined;
  for (const o of opposingCreatures(view)) {
    if (among !== undefined && !among.has(o.id)) continue;
    if (needed(o) > x) continue;
    if (best === undefined || powerOf(o) > powerOf(best)) best = o;
  }
  return best;
}

/** How much damage the agent wants to deal with at most `max`. */
function damageX(view: GameView, text: string, max: number): number {
  const face = CAN_HIT_PLAYER.test(text);
  if (face && opponentLife(view) <= max) return opponentLife(view);
  if (CAN_HIT_CREATURE.test(text)) {
    const kill = killableCreature(view, max);
    if (kill !== undefined) return needed(kill);
  }
  return max;
}

/** The value to announce for the X of the spell or ability the decision is about. */
export function chooseXAnswer(view: GameView, d: ChooseXDecision): Action {
  if (d.purpose === 'multikicker') return chooseKicksAnswer(view, d);
  if (d.purpose === 'replicate') return chooseReplicasAnswer(view, d);
  // D-151: "pay any amount of {R}. When you do, it deals that much damage": all it can pay, the damage goes to the opponent or a creature it kills.
  if (d.purpose === 'payAnyAmount') return { kind: 'chooseX', value: d.max };
  // D-217: "may draw up to two cards": drawing is a gain, so as many as it may.
  if (d.purpose === 'drawUpTo') return { kind: 'chooseX', value: d.max };
  const source = findObject(view, d.source);
  const text = source?.oracleText ?? '';
  let want = d.max;
  if (DAMAGE_X.test(text)) want = damageX(view, text, d.max);
  else if (DRAW_X.test(text)) {
    const library = view.seats.find((s) => s.id === view.viewer)?.libraryCount ?? 0;
    want = Math.min(want, Math.max(0, library - 1));
  }
  if (d.perX.life > 0) {
    const spare = Math.max(0, ownLife(view) - PAY_LIFE_ABOVE - 1);
    want = Math.min(want, Math.floor(spare / d.perX.life));
  }
  // D-1190: "discard X cards": no more cards than it is glad to lose (surplus lands, cards it cannot cast); the engine offered no X above the cards in
  // hand and the legal targets, so the answer is legal, and one card is the least that does something when it has one to spare.
  const perDiscard = d.perX.discard ?? 0;
  if (perDiscard > 0) {
    const hand = ownHand(view).filter((o) => o.id !== d.source);
    want = Math.min(want, Math.floor(expendableCount(view, hand) / perDiscard));
  }
  // A creature that X sizes is never announced at an X that kills it on arrival, when any larger X is on offer.
  const alive = source === undefined ? 0 : minXToSurvive(source);
  return { kind: 'chooseX', value: Math.max(d.min, Math.min(d.max, Math.max(want, alive))) };
}

/**
 * How many times to pay a Multikicker cost (CR 702.33c, D-110): as many as it can, the engine having
 * offered no more than it can pay, but a cost of life only while the agent stays above `PAY_LIFE_ABOVE`,
 * as for any life it pays. A kicked spell is a better spell.
 */
function chooseKicksAnswer(view: GameView, d: ChooseXDecision): Action {
  const life = (d.cost ?? []).reduce((sum, c) => sum + fixedLifeOf(c), 0);
  let want = d.max;
  if (life > 0) {
    const spare = Math.max(0, ownLife(view) - PAY_LIFE_ABOVE - 1);
    want = Math.min(want, Math.floor(spare / life));
  }
  return { kind: 'chooseX', value: Math.max(d.min, Math.min(d.max, want)) };
}

/**
 * How many times to pay a Replicate cost (CR 702.56a, D-129): every copy is another spell, so as many as it can pay,
 * the engine having offered no more than that. A spell with an {X} in its cost is asked the count before X, so it pays
 * for half of the most it could (rounded up) and leaves the rest of its mana for X.
 */
function chooseReplicasAnswer(view: GameView, d: ChooseXDecision): Action {
  const source = findObject(view, d.source);
  const want = source !== undefined && hasXInCost(source) ? Math.ceil(d.max / 2) : d.max;
  return { kind: 'chooseX', value: Math.max(d.min, Math.min(d.max, want)) };
}

/**
 * The target of an "X damage" spell whose X is announced (`ObjectView.x` of the spell on the stack):
 * the opposing creature `x` kills with the most power, else the opponent's face when the text allows
 * a player. Null when the spell is not one, or the slot lists none of these (the usual scoring then
 * decides).
 */
export function chooseXDamageTarget(view: GameView, d: TargetsDecision): ChosenTarget[] | null {
  const source = findObject(view, d.source);
  if (source?.x === undefined || !DAMAGE_X.test(source.oracleText)) return null;
  const [slot] = d.specs;
  if (slot === undefined || d.specs.length !== 1) return null;
  const face = slot.legal.find((t) => t.kind === 'player' && t.seat !== view.viewer);
  if (face !== undefined && source.x >= opponentLife(view)) return [face];
  const legalCreatures = new Set(slot.legal.flatMap((t) => (t.kind === 'object' ? [t.id] : [])));
  const kill = CAN_HIT_CREATURE.test(source.oracleText)
    ? killableCreature(view, source.x, legalCreatures)
    : undefined;
  const aimed = slot.legal.find((t) => t.kind === 'object' && t.id === kill?.id);
  if (aimed !== undefined) return [aimed];
  return face === undefined ? null : [face];
}

/**
 * Whether an instant or sorcery with Multikicker would be cast with at least one kick: the agent has at
 * least one more untapped land or mana in its pool than the rest of the cost asks for, so a spell whose
 * whole effect is "for each time it was kicked" is not cast for nothing. A spell with no multikicker, and
 * a permanent, are not judged here.
 */
export function multikickerHasRoom(view: GameView, o: ObjectView, cost: number): boolean {
  if (!/\bmultikicker\b/i.test(o.oracleText) || o.types.includes('creature')) return true;
  const seat = view.seats.find((s) => s.id === view.viewer);
  const lands = view.battlefield.filter(
    (p) => p.controller === view.viewer && p.types.includes('land') && !p.tapped,
  ).length;
  return lands + (seat?.manaPool.length ?? 0) > cost;
}

/** Whether the card's mana cost has an {X}. */
export const hasXInCost = (o: ObjectView): boolean => o.manaCost?.includes('X') === true;

/**
 * Whether a spell with an {X} would be cast with an X that does something: the agent has at least as many
 * untapped lands and mana in its pool as the rest of the cost asks for plus the least X it wants, for each
 * {X} of the cost. That least X is 1 for an instant or sorcery (X = 0 does nothing) and `minXToSurvive` for a
 * creature that enters with X +1/+1 counters (issue 131, D-237: a 0/0 is dead on arrival at X = 0). Roughly:
 * a Signet's extra mana is not counted, which only makes the agent cautious. A permanent whose X does not
 * decide whether it lives (it enters with X counters on a body that survives, or does what it does at any
 * X) is not judged here.
 */
export function xSpellHasRoom(view: GameView, o: ObjectView): boolean {
  if (!hasXInCost(o)) return true;
  const least = o.types.includes('creature') ? minXToSurvive(o) : isNonPermanent(o) ? 1 : 0;
  if (least === 0) return true;
  const seat = view.seats.find((s) => s.id === view.viewer);
  const lands = view.battlefield.filter(
    (p) => p.controller === view.viewer && p.types.includes('land') && !p.tapped,
  ).length;
  const xs = (o.manaCost ?? []).filter((s) => s === 'X').length;
  return lands + (seat?.manaPool.length ?? 0) >= effectiveCost(o) + xs * least;
}

/**
 * Whether a cast of this spell is made for X = 0 whatever the agent wants (a cast for free or with an
 * alternative cost, CR 107.3b), and X = 0 is worth nothing: an instant or sorcery with an {X}, or a
 * creature that X keeps alive.
 */
export const needsPaidX = (o: ObjectView): boolean =>
  hasXInCost(o) && (isNonPermanent(o) || (o.types.includes('creature') && minXToSurvive(o) > 0));

const isNonPermanent = (o: ObjectView): boolean =>
  o.types.includes('instant') || o.types.includes('sorcery');
