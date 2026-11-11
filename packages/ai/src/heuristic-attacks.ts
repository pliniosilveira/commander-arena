/**
 * HeuristicAgent attacks (M7c, PRIOR_ART 7.2 heuristics 1, 3 and 9, D-163).
 *
 * 1. Lethal check. Each untapped creature of the opponent that can block stops one of the biggest
 *    attackers it can block (a menace attacker needs two, a trampler still sends its excess through, see
 *    `breakthrough` in `heuristic-danger.ts`); if what is left is lethal (life, poison, or 21 commander
 *    damage from one commander) every creature that can attack does, and the reason is `lethal`.
 * 2. Otherwise a bounded set of candidate attacks (the creatures that must attack are in every one):
 *    none, the safe attackers (no block of the opponent kills them, `survivesAttack` of GreedyAgent),
 *    every attacker, the attackers nothing can block, each of the three most valuable creatures alone,
 *    and (when the opponent has a planeswalker) the safe attackers at the planeswalker. Each is declared
 *    on a copy of the sample, the engine plays the combat out with the opponent assumed to block as
 *    `defaultPlan` says (good blocks, value trades, chump blocks only in danger), and the position is
 *    scored with `evaluate` from the agent's seat minus a CRACK-BACK penalty: the opponent's creatures
 *    all untap and attack, the agent's untapped ones block, and what gets through costs the life it
 *    takes, 40% of a loss when it is lethal.
 * 3. The best score wins; an attack must beat staying home by `ATTACK_MARGIN`. Ties go to fewer attackers.
 *
 * Targets: every attacker goes at the opposing player (the only opponent in v1 is the controller of the
 * opposing commander); one candidate sends the safe attackers at an opposing planeswalker, which is
 * scored like any other. Battles are never attacked.
 *
 * Attack taxes (CR 508.1h, `payForAttacks`): every candidate is trimmed to what can be paid for BEFORE it
 * is simulated or declared, so the declaration is final and the payment prompt that follows is answered
 * with `payAuto`: no declined payment can re-ask the same question.
 *
 * Without a sample the safe attackers go, less the creatures needed at home against the crack-back
 * (`guardHome`).
 */
import {
  type Action,
  type AttackTarget,
  type DeclareAttackersDecision,
  type GameState,
  type GameView,
  getView,
  type ObjectId,
  type ObjectView,
  type SeatId,
} from '@commander-arena/engine';
import { isUnblockable } from './casual-evasion';
import { type PlannedAttack, payForAttacks } from './casual-play-rules';
import { findObject, hasKeyword, powerOf } from './casual-view';
import { creatureValue, evaluate, LOSS, lifeValue } from './evaluate';
import { survivesAttack } from './greedy-combat';
import { dangerOnlyPlan, defaultPlan } from './heuristic-blockplan';
import type { BlockContext } from './heuristic-blocks';
import {
  attackIsLethal,
  breakthrough,
  futureAttackers,
  untappedCreatures,
  verdict,
} from './heuristic-danger';
import { applyOrNull, playOut } from './heuristic-sim';
import { withinBlockBudget } from './legal';
import type { Reason } from './reasons';

export interface AttackChoice {
  readonly action: Action;
  readonly reason: Reason;
}

/** An attack must beat staying home by this much to be made. */
const ATTACK_MARGIN = 0.05;
/** The share of a crack-back loss that counts (the opponent will not always find it, and the agent blocks). */
const CRACK_WEIGHT = 0.5;
const CRACK_LETHAL = 0.4 * LOSS;
/** Points per life the opponent loses, at full urgency (the library clock). */
const DESPERATION = 1;
/** Library size at which the agent, if it decks first, is at full urgency to win before it does. */
export const URGENT_LIBRARY = 14;
/** How many creatures are tried alone. */
const SINGLES = 3;

interface Candidate {
  readonly attacker: ObjectId;
  readonly object: ObjectView;
  readonly targets: readonly AttackTarget[];
  /** The opposing player, or the first target when only permanents can be attacked. */
  readonly target: AttackTarget;
}

const byId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const opposingSeat = (view: GameView): SeatId | undefined =>
  view.seats.find((s) => s.id !== view.viewer && !s.hasLost)?.id;

/**
 * What the opponent's next attack could cost the agent in this position (a score penalty, 0 or more):
 * all the opponent's creatures attack, the agent's untapped creatures block (`breakthrough`). Used on the
 * view after a simulated combat, where the agent's attackers are tapped.
 */
export function crackBackPenalty(view: GameView, me: SeatId): number {
  const seat = view.seats.find((s) => s.id === me);
  if (seat === undefined) return 0;
  let penalty = 0;
  for (const other of view.seats) {
    if (other.id === me || other.hasLost) continue;
    const b = breakthrough(view, futureAttackers(view, other.id), untappedCreatures(view, me));
    const v = verdict(view, me, b);
    if (v.lethal) return CRACK_LETHAL;
    penalty +=
      CRACK_WEIGHT * (lifeValue(seat.life) - lifeValue(seat.life - b.life)) + (v.danger ? 3 : 0);
  }
  return penalty;
}

/**
 * The view with the agent's own creatures untapped: its attackers untap before it matters, and being
 * tapped now is the crack-back's business (`crackBackPenalty`), so the evaluator must not count it twice.
 */
function untappedFor(view: GameView, me: SeatId): GameView {
  return {
    ...view,
    battlefield: view.battlefield.map((o) =>
      o.controller === me && o.tapped && o.types.includes('creature') ? { ...o, tapped: false } : o,
    ),
  };
}

/**
 * The library clock (D-163): a game that nobody can win on the board is lost by the player who has to draw
 * from an empty library first. From the agent's attack decision (its own turn) the opponent draws next, so
 * the opponent fails first when it has no more cards than the agent; otherwise the agent decks first and
 * must win before it does. Urgency is 0 when it is not behind, and rises from 0 to 1 as its library falls
 * from `URGENT_LIBRARY` to nothing; the attack choice then trusts the crack-back less and values the
 * opponent's life lost more (`scoreOf`).
 */
export function urgency(view: GameView): number {
  const me = view.seats.find((s) => s.id === view.viewer);
  const rivals = view.seats.filter((s) => s.id !== view.viewer && !s.hasLost);
  if (me === undefined || rivals.length === 0) return 0;
  const behind = rivals.some((s) => me.libraryCount < s.libraryCount);
  return behind ? Math.min(Math.max(1 - me.libraryCount / URGENT_LIBRARY, 0), 1) : 0;
}

function planned(c: Candidate, target: AttackTarget = c.target): PlannedAttack {
  return { attacker: c.attacker, object: c.object, target, targets: c.targets };
}

/**
 * The view-only attack: the safe attackers, fewer of them while the crack-back would leave the agent in
 * danger. The creature given up is the one that is worth most (the best blocker stays home); a creature
 * that must attack is never given up.
 */
function guardHome(
  view: GameView,
  me: SeatId,
  safe: Candidate[],
  required: ReadonlySet<ObjectId>,
): Candidate[] {
  let going = [...safe];
  const opp = opposingSeat(view);
  while (opp !== undefined && going.length > 0) {
    const out = new Set(going.map((c) => c.attacker));
    const home = untappedCreatures(view, me).filter(
      (o) => !out.has(o.id) || hasKeyword(o, 'vigilance'),
    );
    const b = breakthrough(view, futureAttackers(view, opp), home);
    if (!verdict(view, me, b).danger) break;
    const best = going
      .filter((c) => !required.has(c.attacker))
      .sort(
        (x, y) => creatureValue(y.object) - creatureValue(x.object) || byId(x.attacker, y.attacker),
      )[0];
    if (best === undefined) break;
    going = going.filter((c) => c !== best);
  }
  return going;
}

export interface AttackContext extends BlockContext {
  readonly sample: GameState | undefined;
  /**
   * The chance, from 0 to 1, that the opponent blocks only when it is in danger rather than sensibly (what the
   * agent has seen of it, `heuristic-model.ts`).
   */
  readonly passiveWeight: number;
}

const keyOf = (cs: readonly Candidate[], targets: ReadonlyMap<ObjectId, AttackTarget>): string =>
  cs
    .map((c) => `${c.attacker}@${JSON.stringify(targets.get(c.attacker) ?? c.target)}`)
    .sort(byId)
    .join(',');

export function chooseHeuristicAttack(
  view: GameView,
  d: DeclareAttackersDecision,
  ctx: AttackContext,
): AttackChoice {
  const me = view.viewer;
  const opp = opposingSeat(view);
  const candidates: Candidate[] = d.candidates.flatMap((c) => {
    const object = findObject(view, c.attacker);
    const target = c.targets.find((t) => t.kind === 'player' && t.seat !== me) ?? c.targets[0];
    return object === undefined || target === undefined
      ? []
      : [{ attacker: c.attacker, object, targets: c.targets, target }];
  });
  const required = new Set(d.mustAttack);
  const declare = (set: readonly PlannedAttack[]): Action => ({
    kind: 'declareAttackers',
    attacks: set.map((p) => ({ attacker: p.attacker, target: p.target })),
  });
  const mustGo = candidates.filter((c) => required.has(c.attacker));
  const armed = candidates.filter((c) => powerOf(c.object) > 0);

  // 1. The lethal check.
  const atPlayer = armed.filter((c) => c.target.kind === 'player');
  if (
    opp !== undefined &&
    attackIsLethal(
      view,
      opp,
      atPlayer.map((c) => c.object),
    )
  ) {
    const all = [...new Set([...atPlayer, ...mustGo])];
    const set = payForAttacks(
      d,
      all.map((c) => planned(c)),
      true,
    );
    return { action: declare(set), reason: 'lethal' };
  }

  // 2. Candidate attacks.
  const safe = armed.filter((c) => survivesAttack(view, c.object));
  const union = (cs: readonly Candidate[]): Candidate[] => [...new Set([...cs, ...mustGo])];
  const sets = new Map<string, { cs: Candidate[]; at: Map<ObjectId, AttackTarget> }>();
  const addSet = (cs: readonly Candidate[], walker?: AttackTarget): void => {
    const at = new Map<ObjectId, AttackTarget>();
    for (const c of union(cs)) {
      const w =
        walker !== undefined && c.targets.some((t) => JSON.stringify(t) === JSON.stringify(walker));
      at.set(c.attacker, w && !required.has(c.attacker) ? (walker as AttackTarget) : c.target);
    }
    // CR 508.1h: trim to what the tax lets be paid for, now, so the declaration is final.
    const trimmed = payForAttacks(
      d,
      union(cs).map((c) => planned(c, at.get(c.attacker))),
      false,
    );
    const kept = union(cs).filter((c) => trimmed.some((p) => p.attacker === c.attacker));
    const final = new Map(trimmed.map((p) => [p.attacker, p.target] as const));
    const k = keyOf(kept, final);
    if (!sets.has(k)) sets.set(k, { cs: kept, at: final });
  };
  addSet([]);
  addSet(safe);
  addSet(armed);
  addSet(armed.filter((c) => isUnblockable(view, c.object)));
  const bestFirst = [...armed].sort(
    (x, y) => creatureValue(y.object) - creatureValue(x.object) || byId(x.attacker, y.attacker),
  );
  for (const c of bestFirst.slice(0, SINGLES)) addSet([c]);
  const walker = armed
    .flatMap((c) => c.targets)
    .find(
      (t) => t.kind === 'permanent' && findObject(view, t.object)?.types.includes('planeswalker'),
    );
  if (walker !== undefined) addSet(safe, walker);
  const options = [...sets.values()];
  const toAction = (o: (typeof options)[number]): Action =>
    declare(o.cs.map((c) => planned(c, o.at.get(c.attacker))));

  // Without a sample: the safe attackers, less the guard of the home.
  const sample = ctx.sample;
  const fallback = (): AttackChoice => {
    const going = guardHome(view, me, union(safe), required);
    const set = payForAttacks(
      d,
      union(going).map((c) => planned(c)),
      false,
    );
    const reason: Reason =
      set.length === 0
        ? candidates.length === 0
          ? 'no-attackers'
          : 'hold-back'
        : going.length < safe.length
          ? 'crack-back'
          : 'safe-attack';
    return { action: declare(set), reason };
  };
  if (sample === undefined || sample.pending?.kind !== 'declareAttackers' || opp === undefined) {
    return fallback();
  }

  // 3. Play each candidate out on the sample and score it. The opponent is assumed to block sensibly
  // (`defaultPlan`) with probability 1 - `passive` and to block only in danger (`dangerOnlyPlan`) with
  // probability `passive`, which the agent learns from what it has seen (`heuristic-model.ts`); a
  // candidate's numbers are the average of the two plays.
  const policyOf = (plan: typeof defaultPlan) => ({
    abort: ctx.budget.over,
    blocks: (v: GameView, bd: Parameters<typeof defaultPlan>[1]): Action => ({
      kind: 'declareBlockers',
      blocks: withinBlockBudget(bd, plan(v, bd).blocks),
    }),
  });
  const sensible = policyOf(defaultPlan);
  const passive = policyOf(dangerOnlyPlan);
  const scored: {
    o: (typeof options)[number];
    raw: number;
    crack: number;
    /** The life the opponent loses in this candidate. */
    dealt: number;
    score: number;
  }[] = [];
  const oppLife = view.seats.find((x) => x.id === opp)?.life ?? 0;
  const hurry = urgency(view);
  const scoreOf = (c: { raw: number; crack: number; dealt: number }, u: number): number =>
    c.raw - (1 - u) * c.crack + u * DESPERATION * c.dealt;
  /** The numbers of one candidate played out against one assumed opponent, or null. */
  const playCandidate = (o: (typeof options)[number], policy: typeof sensible) => {
    let end: GameState | null = sample;
    if (o.cs.length > 0) {
      const declared = applyOrNull(sample, me, toAction(o));
      end = declared === null ? null : playOut(declared, me, policy);
    }
    if (end === null) return null;
    const v = getView(end, me);
    return {
      raw: evaluate(untappedFor(v, me), me).score,
      crack: crackBackPenalty(v, me),
      dealt: Math.max(oppLife - (v.seats.find((x) => x.id === opp)?.life ?? oppLife), 0),
    };
  };
  const weight = ctx.passiveWeight;
  // The stay-home candidate and the safe one are always scored; the others while time is left.
  const order = [...options].sort((x, y) => x.cs.length - y.cs.length);
  for (const [i, o] of order.entries()) {
    if (i >= 2 && ctx.budget.expired(i)) break;
    const careful = weight < 1 || o.cs.length === 0 ? playCandidate(o, sensible) : null;
    const loose = weight > 0 && o.cs.length > 0 ? playCandidate(o, passive) : careful;
    if (careful === null && weight < 1) continue;
    const a = careful ?? loose;
    const b = loose ?? careful;
    if (a === null || b === null) continue;
    const mix = (x: number, y: number): number => (1 - weight) * x + weight * y;
    const c = {
      raw: mix(a.raw, b.raw),
      crack: mix(a.crack, b.crack),
      dealt: mix(a.dealt, b.dealt),
    };
    scored.push({ o, ...c, score: scoreOf(c, hurry) });
  }
  // Nothing scored, or a play-out ran out of time before two were: the rules-based attack answers.
  if (scored.length === 0 || (scored.length < 2 && ctx.budget.over())) return fallback();
  const home = scored.find((s) => s.o.cs.length === 0);
  const rank = (a: (typeof scored)[number], b: (typeof scored)[number], u: number): number =>
    scoreOf(b, u) - scoreOf(a, u) || a.o.cs.length - b.o.cs.length;
  // What the agent would do with no hurry, to tell the library clock's choices apart.
  const calmPick = [...scored].sort((x, y) => rank(x, y, 0))[0];
  scored.sort((x, y) => rank(x, y, hurry));
  let pick = scored[0];
  if (pick === undefined) return fallback();
  if (home !== undefined && pick !== home && pick.score < home.score + ATTACK_MARGIN) pick = home;
  const bestRaw = [...scored].sort((x, y) => y.raw - x.raw || x.o.cs.length - y.o.cs.length)[0];
  const chosen = pick;
  const going = chosen.o.cs;
  const reason: Reason =
    hurry > 0 && calmPick !== undefined && calmPick !== chosen
      ? 'deck-race'
      : going.length === 0
        ? candidates.length === 0
          ? 'no-attackers'
          : bestRaw !== undefined && bestRaw.o.cs.length > 0 && bestRaw !== chosen
            ? 'crack-back'
            : 'hold-back'
        : bestRaw !== undefined && bestRaw.o.cs.length > going.length && bestRaw !== chosen
          ? 'crack-back'
          : going.every((c) => required.has(c.attacker))
            ? 'must-attack'
            : going.every((c) => safe.includes(c) || required.has(c.attacker))
              ? 'safe-attack'
              : 'sim-attack';
  return { action: toAction(chosen.o), reason };
}
