/**
 * Helpers shared by agents for choosing among the engine's legal actions.
 */
import {
  type Action,
  type AttackTarget,
  type DeclareAttackersDecision,
  type DeclareBlockersDecision,
  legalActionsForDecision,
  type ObjectId,
  type PendingDecision,
} from '@commander-arena/engine';

/**
 * The legal actions an agent should consider, best class first: real plays, then `cancel`, then
 * `concede`. A random agent never cancels a cast or concedes while a real play exists (a random
 * cancel loop can stall a cast), and concedes only when nothing else is legal.
 */
export function preferredActions(decision: PendingDecision): Action[] {
  const legal = legalActionsForDecision(decision);
  const plays = legal.filter((a) => a.kind !== 'concede' && a.kind !== 'cancel');
  if (plays.length > 0) return plays;
  const cancels = legal.filter((a) => a.kind === 'cancel');
  if (cancels.length > 0) return cancels;
  return legal;
}

/**
 * The first legal action, preferring real plays: the safe choice used when a handler fails. If
 * the engine lists nothing at all, conceding is the only action it always accepts.
 */
export function firstSafeAction(decision: PendingDecision): Action {
  return preferredActions(decision)[0] ?? { kind: 'concede' };
}

/**
 * The cost of attacking (CR 508.1h, D-125): trims a declaration to what the decision's `attackCosts` says can be
 * paid for. Each taxed target takes at most `affordable` attackers, and only one taxed target is used (the
 * budget is for one); an attacker that does not fit goes to a target that costs nothing when it has one, and
 * otherwise stays home. A creature that must attack (`mustAttack`) is sent to a target that costs nothing,
 * since a player is not required to pay (CR 508.1d). Without a tax the declaration is returned as it is.
 */
export function withinAttackBudget(
  d: DeclareAttackersDecision,
  attacks: readonly { attacker: ObjectId; target: AttackTarget }[],
): { attacker: ObjectId; target: AttackTarget }[] {
  const costs = d.attackCosts ?? [];
  if (costs.length === 0) return [...attacks];
  const same = (a: AttackTarget, b: AttackTarget) => JSON.stringify(a) === JSON.stringify(b);
  const taxed = (t: AttackTarget) => costs.find((c) => same(c.target, t));
  const freeTarget = (attacker: ObjectId) =>
    d.candidates.find((c) => c.attacker === attacker)?.targets.find((t) => taxed(t) === undefined);
  let using: AttackTarget | null = null;
  let used = 0;
  return attacks.flatMap((a) => {
    const cost = taxed(a.target);
    if (cost === undefined) return [a];
    const free = freeTarget(a.attacker);
    const mustPay = !d.mustAttack.includes(a.attacker);
    if (mustPay && (using === null || same(using, a.target)) && used < cost.affordable) {
      using = a.target;
      used += 1;
      return [a];
    }
    return free === undefined ? [] : [{ attacker: a.attacker, target: free }];
  });
}

/**
 * CR 509.1c (D-206): an attacker that must be blocked if able is blocked by as many creatures as it needs (one, two for menace), added to the
 * declaration first, from the creatures that can block it and are not blocking yet. Every agent's declaration goes through here.
 */
export function withRequiredBlocks(
  d: DeclareBlockersDecision,
  blocks: readonly { blocker: ObjectId; attacker: ObjectId }[],
): { blocker: ObjectId; attacker: ObjectId }[] {
  const out = [...blocks];
  const used = new Set(out.map((b) => b.blocker));
  const added: { blocker: ObjectId; attacker: ObjectId }[] = [];
  for (const a of d.attackers) {
    if (a.mustBeBlocked !== true) continue;
    const have = out.filter((b) => b.attacker === a.attacker).length;
    if (have >= a.minBlockers) continue;
    const free = d.candidates.filter(
      (c) => !used.has(c.blocker) && c.canBlock.includes(a.attacker),
    );
    if (have + free.length < a.minBlockers) continue;
    // A creature that blocks something else already is not moved: the ones that were free are used.
    for (const c of free.slice(0, a.minBlockers - have)) {
      used.add(c.blocker);
      added.push({ blocker: c.blocker, attacker: a.attacker });
    }
  }
  return [...added, ...out];
}

/**
 * The cost of blocking (CR 509.1d, D-149): trims a declaration to what the decision's `blockCost` says can be paid for, the first
 * `affordable` blocking creatures in the order given (the casual agent lists the attackers it fears most first). An attacker left with
 * fewer blockers than it needs (menace) is not blocked at all. Without a tax the declaration is returned as it is.
 */
export function withinBlockBudget(
  d: DeclareBlockersDecision,
  blocks: readonly { blocker: ObjectId; attacker: ObjectId }[],
): { blocker: ObjectId; attacker: ObjectId }[] {
  const required = withRequiredBlocks(d, blocks);
  if (d.blockCost === undefined) return required;
  const kept = required.slice(0, d.blockCost.affordable);
  const count = new Map<ObjectId, number>();
  for (const b of kept) count.set(b.attacker, (count.get(b.attacker) ?? 0) + 1);
  const need = new Map(d.attackers.map((a) => [a.attacker, a.minBlockers] as const));
  return kept.filter((b) => (count.get(b.attacker) ?? 0) >= (need.get(b.attacker) ?? 1));
}
