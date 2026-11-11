/**
 * The agents and loyalty abilities (D-203, CR 606): a planeswalker the agent controls is used once a turn, in a main phase of its own turn (the engine lists
 * the `activate` options only then, CR 606.3, and only when the cost can be paid, CR 606.6). The rule is small on purpose (docs/design/planeswalkers.md D5):
 *
 * - an ability that leaves the planeswalker with at least 1 loyalty is a candidate; one that takes its last counter is a candidate only when it is an ultimate
 *   (a cost of 6 or more, which every ultimate of a Commander planeswalker is);
 * - the choice among the candidates: an ultimate, else a minus ability that has a target worth spending loyalty on (a removal, a burn, a bounce) while the
 *   planeswalker keeps at least 2, else the highest plus ability, else a zero ability, else a minus ability that leaves at least 2;
 * - "[-X]" abilities are left unused (X would be chosen blind), as the casual agent leaves unused every ability it cannot judge.
 *
 * What the ability asks afterwards (targets, X, a sacrifice) is answered by the handlers of the decision kinds, which do not know it came from a planeswalker.
 */
import type {
  Action,
  ActivatedAbility,
  GameView,
  PriorityDecision,
  PriorityOption,
} from '@commander-arena/engine';
import { findObject } from './casual-view';

type ActivateOption = Extract<PriorityOption, { kind: 'activate' }>;

/** An ultimate: a loyalty cost of this many counters or more (CR 606.4). */
export const ULTIMATE_COST = 6;

/** The loyalty symbol of an ability, or null for any other activated ability (CR 606.2). */
export function loyaltyChangeOf(ability: ActivatedAbility): number | 'x' | null {
  for (const c of ability.cost) if (c.kind === 'loyalty') return c.change;
  return null;
}

/** Whether the ability hurts or removes something of the opponent's: it has a target and says damage, destroy, exile, return or the like. */
function hasHostileTarget(ability: ActivatedAbility): boolean {
  if ((ability.targets?.length ?? 0) === 0) return false;
  const kinds = new Set<string>();
  const walk = (e: { kind: string; effects?: readonly unknown[] } | undefined): void => {
    if (e === undefined) return;
    kinds.add(e.kind);
    for (const inner of e.effects ?? []) walk(inner as { kind: string });
  };
  walk(ability.effect);
  return ['dealDamage', 'destroy', 'exile', 'moveToZone', 'sacrifice', 'tap', 'modifyPt'].some(
    (k) => kinds.has(k),
  );
}

/**
 * The loyalty activation to make now, or null. No loop guard is needed: the engine lists a loyalty ability only until one of that permanent was activated
 * this turn (CR 606.3).
 */
export function chooseLoyaltyActivation(
  view: GameView,
  d: PriorityDecision,
): Extract<Action, { kind: 'activate' }> | null {
  const candidates: { option: ActivateOption; rank: number }[] = [];
  for (const o of d.options) {
    if (o.kind !== 'activate') continue;
    const obj = findObject(view, o.object);
    const ability = obj?.activated?.find((a) => a.abilityIndex === o.abilityIndex)?.ability;
    if (obj === undefined || ability === undefined || obj.controller !== view.viewer) continue;
    const change = loyaltyChangeOf(ability);
    if (change === null || change === 'x') continue;
    const after = (obj.counters.loyalty ?? 0) + change;
    // The last counter only for an ultimate.
    if (after < 1 && -change < ULTIMATE_COST) continue;
    let rank: number;
    if (after < 1) rank = 100;
    else if (change < 0 && after >= 2 && hasHostileTarget(ability)) rank = 60 + -change;
    else if (change > 0) rank = 40 + change;
    else if (change === 0) rank = 30;
    else if (after >= 2) rank = 10 - -change;
    else continue;
    candidates.push({ option: o, rank });
  }
  const best = candidates.sort((a, b) => b.rank - a.rank)[0];
  if (best === undefined) return null;
  return {
    kind: 'activate',
    object: best.option.object,
    abilityIndex: best.option.abilityIndex,
  };
}
