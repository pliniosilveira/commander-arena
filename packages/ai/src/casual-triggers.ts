/**
 * CasualAgent and the targets of triggered abilities (CR 603.3d): "When this enters, destroy target
 * creature an opponent controls", "Whenever this attacks, put a +1/+1 counter on target creature
 * you control". The agent chooses as the ability goes on the stack, so it reads what the ability
 * does from its own text, which the view carries for an ability on the stack (`ObjectView.ability`),
 * not from the source card's Oracle text (a card may have several abilities).
 *
 * Each target slot gets a stance from the first effect that uses it:
 * - harm (the default): destroy, exile, damage, tap, bounce, lose life, discard, a shrink, "loses
 *   all abilities". It goes on the opponent's best thing, a creature the damage kills first.
 * - help: counters, a pump or keyword gain, untap, life gain, draw, attaching, putting a card onto
 *   the battlefield. It goes on the agent's own best creature (a tapped one for untap).
 * When only the wrong side is legal for a slot that must be filled, the agent does the least harm:
 * its own weakest permanent for a harmful ability, the opponent's weakest for a helpful one. A slot
 * that may stay empty ("up to one") is left empty rather than aimed at the wrong side.
 */
import type {
  ChosenTarget,
  Effect,
  GameView,
  PtAmount,
  StackAbility,
  TargetsDecision,
} from '@commander-arena/engine';
import { findObject, isCreature, powerOf, toughnessOf } from './casual-view';

type Stance = 'help' | 'harm';

export interface SlotPlan {
  readonly stance: Stance;
  /** The damage a `dealDamage` effect deals to this slot, when it is a number. */
  readonly damage: number | null;
  /** True for "untap target ...": a tapped permanent is the one to help. */
  readonly untap: boolean;
  /**
   * D-270: a slot of targets on the battlefield and in graveyards that an `exile` uses ("up to three other target creatures from the battlefield and/or creature cards
   * from graveyards"): a card of a graveyard is left alone, because the exile is undone when the permanent leaves (the card then goes to its owner's hand, which a card
   * the opponent had lost for good would not have). Only the permanents of the battlefield are aimed at.
   */
  readonly battlefieldOnly?: true;
}

/** The triggered ability on the stack that this targets decision is for, when it is one. */
export function triggeredAbilityOf(view: GameView, d: TargetsDecision): StackAbility | undefined {
  if (d.forTrigger !== true) return undefined;
  const ability = findObject(view, d.source)?.ability;
  return ability?.kind === 'triggered' ? ability : undefined;
}

/**
 * Whether a power or toughness amount takes away (D-115): a negative number, or a negative multiple
 * ("-X/-X"). A count or an X adds.
 */
const shrinks = (amount: PtAmount): boolean =>
  typeof amount === 'number' ? amount < 0 : amount.kind === 'times' && amount.factor < 0;

const isTarget = (sel: unknown, id: string): boolean =>
  typeof sel === 'object' && sel !== null && 'kind' in sel && sel.kind === 'target' && 'id' in sel
    ? sel.id === id
    : false;

/** The plan for slot `id` from the first effect that names it; null if no effect does. */
export function planFor(effect: Effect, id: string): SlotPlan | null {
  const harm = (damage: number | null = null): SlotPlan => ({
    stance: 'harm',
    damage,
    untap: false,
  });
  const help = (untap = false): SlotPlan => ({ stance: 'help', damage: null, untap });
  switch (effect.kind) {
    case 'sequence':
      for (const e of effect.effects) {
        const plan = planFor(e, id);
        if (plan !== null) return plan;
      }
      return null;
    case 'conditional':
      return planFor(effect.effect, id) ?? (effect.else ? planFor(effect.else, id) : null);
    case 'dealDamage':
      return isTarget(effect.to, id)
        ? harm(typeof effect.amount === 'number' ? effect.amount : null)
        : null;
    case 'destroy':
    case 'exile':
    case 'tap':
    case 'counter':
    case 'loseAllAbilities':
    case 'setPt':
    case 'setTypes':
    case 'setColors':
      return isTarget(effect.objects, id) ? harm() : null;
    case 'loseLife':
    case 'discard':
      return isTarget(effect.player, id) ? harm() : null;
    case 'gainLife':
    case 'draw':
      return isTarget(effect.player, id) ? help() : null;
    case 'untap':
      return isTarget(effect.objects, id) ? help(true) : null;
    case 'restrict':
      // "Can't be blocked" is good for its creature; "can't block" and "attacks if able" are not.
      return isTarget(effect.objects, id)
        ? effect.restriction === 'cantBeBlocked'
          ? help()
          : harm()
        : null;
    case 'grantKeyword':
    case 'transform':
    case 'becomeCopy':
      return isTarget(effect.objects, id) ? help() : null;
    case 'addCounters':
      return isTarget(effect.objects, id) ? (effect.counter === '-1/-1' ? harm() : help()) : null;
    case 'modifyPt':
      return isTarget(effect.objects, id)
        ? !shrinks(effect.power) && !shrinks(effect.toughness)
          ? help()
          : harm()
        : null;
    case 'moveToZone':
      // A card put onto the battlefield is a gain (a creature from a graveyard); the other moves
      // take something away from whoever has it.
      return isTarget(effect.objects, id) ? (effect.to === 'battlefield' ? help() : harm()) : null;
    case 'attach':
      return isTarget(effect.to, id) ? help() : null;
    default:
      return null;
  }
}

/** How much the agent wants to choose `t` for a slot with this plan; below 0 means "avoid". */
function score(view: GameView, t: ChosenTarget, plan: SlotPlan): number {
  const wantsOpponent = plan.stance === 'harm';
  if (t.kind === 'player') return (t.seat !== view.viewer) === wantsOpponent ? 3 : -1;
  const o = findObject(view, t.id);
  if (o === undefined) return -1;
  if (plan.battlefieldOnly === true && !view.battlefield.some((b) => b.id === t.id)) return -1;
  const theirs = o.controller !== view.viewer;
  if (theirs !== wantsOpponent) {
    // The wrong side: the least valuable permanent does the least harm.
    return -1 - powerOf(o) / 100;
  }
  if (!isCreature(o)) return 2;
  const value = 4 + powerOf(o) / 100;
  if (plan.stance === 'harm' && plan.damage !== null) {
    // Damage is worth aiming at a creature only if it kills it; otherwise the player takes it.
    return toughnessOf(o) - o.damage <= plan.damage ? value + 10 : 2;
  }
  return plan.untap && o.tapped ? value + 5 : value;
}

/**
 * The targets of one slot for a plan: each gets between the slot's minimum and maximum of its legal targets,
 * none twice, the best-scored first. Stable sort: equal scores keep the engine's order, so "first legal" is
 * the fallback.
 */
export function chooseSlot(
  view: GameView,
  slot: TargetsDecision['specs'][number],
  plan: SlotPlan,
): ChosenTarget[] {
  const ranked = slot.legal
    .map((t, index) => ({ t, index, score: score(view, t, plan) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const wanted = ranked.filter((r) => r.score >= 0).length;
  const count = Math.min(slot.max, slot.legal.length, Math.max(slot.min, wanted));
  return ranked.slice(0, count).map((r) => r.t);
}

/** The plan a slot gets when no effect names it: harm, the default. */
export const HARM_BY_DEFAULT: SlotPlan = { stance: 'harm', damage: null, untap: false };

/**
 * The targets for every slot of the decision, from the ability's text. Always a legal answer: each
 * slot gets between its minimum and maximum of its legal targets, none twice. A modal ability (D-114)
 * keeps its effects in its modes, whose target ids are unique, so the plan reads them all.
 */
export function chooseTriggerTargets(
  view: GameView,
  d: TargetsDecision,
  ability: StackAbility,
): ChosenTarget[] {
  const effect: Effect = ability.modes
    ? { kind: 'sequence', effects: ability.modes.map((m) => m.effect) }
    : ability.effect;
  return d.specs.flatMap((slot) => {
    const plan = planFor(effect, slot.specId) ?? HARM_BY_DEFAULT;
    // D-270: a slot of two zones (the battlefield and graveyards): only the battlefield side is aimed at.
    const crossZone = ability.targets?.some(
      (t) => t.id === slot.specId && t.what.kind === 'objectOrGraveyardCard',
    );
    return chooseSlot(view, slot, crossZone === true ? { ...plan, battlefieldOnly: true } : plan);
  });
}
