/**
 * CasualAgent and the play rules of D-125: extra land drops, the top card of the library, the attack tax and
 * the optional untap. The engine lists only legal options, so the agent never checks a rule; what it decides
 * here is what is worth doing with them.
 *
 * - Extra land drops (CR 305.2): the agent already plays a land whenever one is offered, so an extra drop is
 *   used as soon as the engine lists it. A permanent that grants one is cast before other spells when the hand
 *   holds a land it could not play otherwise.
 */
import {
  type AttackTarget,
  type DeclareAttackersDecision,
  type GameView,
  manaValue,
  type ObjectId,
  type ObjectView,
} from '@commander-arena/engine';
import { isLand, ownHand } from './casual-view';

/** "You may play an additional land on each of your turns", on a permanent card (not a one-shot "this turn"). */
const EXTRA_LAND_TEXT =
  /\byou may play (an|two|three|four) additional lands? on each of your turns\b/i;

/** Whether the spell is a permanent that raises the land limit while a land waits in the hand (CR 305.2). */
export function grantsLandDrops(view: GameView, spell: ObjectView): boolean {
  if (spell.types.includes('instant') || spell.types.includes('sorcery')) return false;
  if (!EXTRA_LAND_TEXT.test(spell.oracleText)) return false;
  return ownHand(view).some((o) => o.id !== spell.id && isLand(o));
}

/**
 * The top card of the agent's own library, when a permanent lets it look (CR 401.5, D-125): `null` when it may
 * not look. The view carries it only for the viewer's own seat, so this never reads another player's library.
 */
export function knownTopCard(view: GameView): ObjectView | null {
  return view.seats.find((s) => s.id === view.viewer)?.libraryTop ?? null;
}

/**
 * Whether the agent knows its next draw is a land. It then does not spend a card and mana on typecycling for
 * a land it is about to draw (`chooseActivation`).
 */
export function landIsOnTop(view: GameView): boolean {
  const top = knownTopCard(view);
  return top !== null && isLand(top);
}

/** One creature the agent means to attack with, and where it could go. */
export interface PlannedAttack {
  readonly attacker: ObjectId;
  readonly object: ObjectView;
  readonly target: AttackTarget;
  readonly targets: readonly AttackTarget[];
}

const sameTarget = (a: AttackTarget, b: AttackTarget): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * The cost of attacking (CR 508.1h, D-125): "Creatures can't attack you unless their controller pays {2} for each
 * creature". The decision says what each taxed target costs per creature and how many creatures can be paid
 * for (`attackCosts`); the agent attacks the taxed target with as many of the creatures it wants to send as it
 * can pay for, the strongest first, or with none. A creature is sent into the tax only when its damage is at
 * least the mana it costs, or when the attack is lethal. One that is not, or that no longer fits the budget, goes
 * to a target that costs nothing (a planeswalker) if there is one and otherwise stays home. A creature that
 * attacks each combat if able and has a target that costs nothing is sent there. Only one taxed target is used at
 * a time, because the budget of the decision is for one.
 */
export function payForAttacks(
  d: DeclareAttackersDecision,
  planned: readonly PlannedAttack[],
  lethal: boolean,
): PlannedAttack[] {
  const costs = d.attackCosts ?? [];
  if (costs.length === 0) return [...planned];
  const costOf = (t: AttackTarget) => costs.find((c) => sameTarget(c.target, t));
  const free = (p: PlannedAttack): AttackTarget | undefined =>
    p.targets.find((t) => costOf(t) === undefined);
  const required = new Set(d.mustAttack);
  const order = [...planned].sort(
    (a, b) =>
      Number(required.has(b.attacker)) - Number(required.has(a.attacker)) ||
      (b.object.power ?? 0) - (a.object.power ?? 0),
  );
  const decided = new Map<ObjectId, PlannedAttack | null>();
  let taxedTarget: AttackTarget | null = null;
  let used = 0;
  for (const p of order) {
    const cost = costOf(p.target);
    if (cost === undefined) {
      decided.set(p.attacker, p);
      continue;
    }
    const elsewhere = free(p);
    const home = required.has(p.attacker) || elsewhere !== undefined;
    const fits = taxedTarget === null || sameTarget(taxedTarget, p.target);
    const worth = lethal || (p.object.power ?? 0) >= manaValue(cost.cost);
    if (!required.has(p.attacker) && fits && worth && used < cost.affordable) {
      taxedTarget = p.target;
      used += 1;
      decided.set(p.attacker, p);
    } else if (home && elsewhere !== undefined) {
      decided.set(p.attacker, { ...p, target: elsewhere });
    } else {
      decided.set(p.attacker, null);
    }
  }
  return planned.flatMap((p) => decided.get(p.attacker) ?? []);
}
