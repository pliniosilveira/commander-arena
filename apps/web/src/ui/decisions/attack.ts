/** Declare attackers (CR 508.1): the attack set the player is building, as pure reducers. */
import type {
  AttackTarget,
  DeclareAttackersDecision,
  ObjectId,
  SeatId,
} from '@commander-arena/engine';
import { sameAttackTarget } from './lookup';

export interface AttackPick {
  readonly attacker: ObjectId;
  readonly target: AttackTarget;
}

type Candidates = DeclareAttackersDecision['candidates'];

function candidateOf(candidates: Candidates, id: ObjectId): Candidates[number] | undefined {
  return candidates.find((c) => c.attacker === id);
}

/** The target a newly chosen attacker gets: the preferred one if legal, else a player, else any. */
export function defaultAttackTarget(
  targets: readonly AttackTarget[],
  preferred: AttackTarget | null,
): AttackTarget | null {
  if (preferred !== null) {
    const match = targets.find((t) => sameAttackTarget(t, preferred));
    if (match !== undefined) return match;
  }
  return targets.find((t) => t.kind === 'player') ?? targets[0] ?? null;
}

/**
 * The attack a declaration starts with: every creature that attacks each combat if able
 * (`mustAttack`, CR 508.1d), at the preferred target where it can. The engine refuses a declaration
 * that leaves one out, so they begin chosen and cannot be taken out (`toggleAttacker`).
 */
export function requiredAttacks(
  decision: Pick<DeclareAttackersDecision, 'candidates' | 'mustAttack'>,
  preferred: AttackTarget | null,
): readonly AttackPick[] {
  return decision.candidates.flatMap((c) => {
    if (!decision.mustAttack.includes(c.attacker)) return [];
    const target = defaultAttackTarget(c.targets, preferred);
    return target === null ? [] : [{ attacker: c.attacker, target }];
  });
}

/** True when this creature must be declared as an attacker (CR 508.1d) and cannot be taken out. */
export function isRequiredAttacker(
  decision: Pick<DeclareAttackersDecision, 'mustAttack'>,
  id: ObjectId,
): boolean {
  return decision.mustAttack.includes(id);
}

/**
 * Click on a candidate: attack with it (at the default target), or take it out of the attack. A
 * creature in `required` ("attacks each combat if able") stays in the attack.
 */
export function toggleAttacker(
  picks: readonly AttackPick[],
  candidates: Candidates,
  id: ObjectId,
  preferred: AttackTarget | null,
  required: readonly ObjectId[] = [],
): readonly AttackPick[] {
  if (picks.some((p) => p.attacker === id)) {
    return required.includes(id) ? picks : picks.filter((p) => p.attacker !== id);
  }
  const candidate = candidateOf(candidates, id);
  if (candidate === undefined) return picks;
  const target = defaultAttackTarget(candidate.targets, preferred);
  return target === null ? picks : [...picks, { attacker: id, target }];
}

/** Changes what one chosen attacker attacks; a target the engine did not offer is ignored. */
export function setAttackTarget(
  picks: readonly AttackPick[],
  candidates: Candidates,
  attacker: ObjectId,
  target: AttackTarget,
): readonly AttackPick[] {
  const candidate = candidateOf(candidates, attacker);
  if (candidate === undefined || !candidate.targets.some((t) => sameAttackTarget(t, target))) {
    return picks;
  }
  return picks.map((p) => (p.attacker === attacker ? { attacker, target } : p));
}

/** Points every chosen attacker that may attack this player at that player. */
export function retargetToSeat(
  picks: readonly AttackPick[],
  candidates: Candidates,
  seat: SeatId,
): readonly AttackPick[] {
  const target: AttackTarget = { kind: 'player', seat };
  return picks.map((p) => {
    const ok = candidateOf(candidates, p.attacker)?.targets.some((t) =>
      sameAttackTarget(t, target),
    );
    return ok === true ? { attacker: p.attacker, target } : p;
  });
}

/** "Attack with all": every candidate attacks, at the preferred target where it can. */
export function allOut(
  candidates: Candidates,
  preferred: AttackTarget | null,
): readonly AttackPick[] {
  return candidates.flatMap((c) => {
    const target = defaultAttackTarget(c.targets, preferred);
    return target === null ? [] : [{ attacker: c.attacker, target }];
  });
}

/** Players any candidate may attack: what a click on a player strip can mean. */
export function attackableSeats(candidates: Candidates): ReadonlySet<SeatId> {
  const seats = new Set<SeatId>();
  for (const c of candidates) for (const t of c.targets) if (t.kind === 'player') seats.add(t.seat);
  return seats;
}

export function attackedSeats(picks: readonly AttackPick[]): ReadonlySet<SeatId> {
  const seats = new Set<SeatId>();
  for (const p of picks) if (p.target.kind === 'player') seats.add(p.target.seat);
  return seats;
}

/** "Grizzly Bears must attack each combat if able." / "A and B must attack each combat if able." */
export function mustAttackText(names: readonly string[]): string {
  const who =
    names.length <= 1
      ? (names[0] ?? 'it')
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${who} must attack each combat if able.`;
}

export function attackButtonLabel(count: number): string {
  return count === 0 ? 'No Attack' : `Declare attackers (${count})`;
}
