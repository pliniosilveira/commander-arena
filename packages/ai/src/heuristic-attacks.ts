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
 *    takes, 40% of a loss when it is lethal (`heuristic-crack-back.ts`). Against a deck that has a
 *    creature with haste (or haste given by its permanents) or with flash it can pay for, the attack is
 *    also counted with that creature cast from the hand, in the share of the chance that it holds one
 *    (the opponent profile, `heuristic-profile.ts`, issue 653 step 2b).
 * 3. The best score wins; an attack must beat staying home by `attacks.margin`. Ties go to fewer attackers.
 * 4. With two players, "no attack" and the best two other attacks are played on to the start of the agent's next
 *    turn and chosen again by that position (`heuristic-attack-look.ts`, issue 653 step 5); the crack-back above
 *    is then replaced where the play-out shows it, and is the answer when the work budget cannot pay for it.
 *
 * Every tunable number is a field of `AgentWeights` (`weights.ts`, groups `attacks` and `danger`), read from
 * `AttackContext.weights`.
 *
 * Targets: every attacker goes at one opposing player, chosen by `rankOpponents` (`attack-targets.ts`:
 * the one the attackers can kill, else the weakest); one candidate sends the safe attackers at an opposing planeswalker, which is
 * scored like any other. Battles are never attacked.
 *
 * Attack taxes (CR 508.1h, `payForAttacks`): every candidate is trimmed to what can be paid for BEFORE it
 * is simulated or declared, so the declaration is final and the payment prompt that follows is answered
 * with `payAuto`: no declined payment can re-ask the same question.
 *
 * Without a sample the safe attackers go, less the creatures needed at home against the crack-back
 * (`guardHome`).
 */
import type {
  Action,
  AttackTarget,
  DeclareAttackersDecision,
  GameState,
  GameView,
  ObjectId,
  ObjectView,
  SeatId,
} from '@commander-arena/engine';
import { rankOpponents, targetFor } from './attack-targets';
import { isUnblockable } from './casual-evasion';
import { type PlannedAttack, payForAttacks } from './casual-play-rules';
import { findObject, powerOf } from './casual-view';
import { creatureValue, evaluate } from './evaluate';
import { survivesAttack } from './greedy-combat';
import { lookAtAttacks, type Played, type Scored } from './heuristic-attack-look';
import { dangerOnlyPlan, defaultPlan } from './heuristic-blockplan';
import type { BlockContext } from './heuristic-blocks';
import { Look, type LookRecord, twoPlayers, untappedFor } from './heuristic-combat-look';
import { crackBackPenalty, guardHome } from './heuristic-crack-back';
import { attackIsLethal } from './heuristic-danger';
import { applyOrNull, playOut, within } from './heuristic-sim';
import { hiddenAttackersOf, opponentsOf } from './heuristic-threats';
import { withinAttackBudget, withinBlockBudget } from './legal';
import type { Reason } from './reasons';
import { type AgentWeights, DEFAULT_WEIGHTS } from './weights';

export interface AttackChoice {
  readonly action: Action;
  readonly reason: Reason;
  /** What the look-ahead did, when it ran (`heuristic-attack-look.ts`). */
  readonly look?: LookRecord;
}

/** How many creatures are tried alone (a bound of the search, not a weight). */
const SINGLES = 3;

interface Candidate {
  readonly attacker: ObjectId;
  readonly object: ObjectView;
  readonly targets: readonly AttackTarget[];
  /** The opposing player, or the first target when only permanents can be attacked. */
  readonly target: AttackTarget;
}

/** One candidate attack: the creatures going and where each goes. */
interface Option {
  readonly cs: Candidate[];
  readonly at: Map<ObjectId, AttackTarget>;
}

const byId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The library clock (D-163): a game that nobody can win on the board is lost by the player who has to draw
 * from an empty library first. From the agent's attack decision (its own turn) the opponent draws next, so
 * the opponent fails first when it has no more cards than the agent; otherwise the agent decks first and
 * must win before it does. Urgency is 0 when it is not behind, and rises from 0 to 1 as its library falls
 * from `attacks.urgentLibrary` to nothing; the attack choice then trusts the crack-back less and values the
 * opponent's life lost more (`scoreOf`).
 */
export function urgency(view: GameView, weights: AgentWeights = DEFAULT_WEIGHTS): number {
  const me = view.seats.find((s) => s.id === view.viewer);
  const rivals = view.seats.filter((s) => s.id !== view.viewer && !s.hasLost);
  if (me === undefined || rivals.length === 0) return 0;
  const behind = rivals.some((s) => me.libraryCount < s.libraryCount);
  const full = weights.attacks.urgentLibrary;
  return behind ? Math.min(Math.max(1 - me.libraryCount / full, 0), 1) : 0;
}

function planned(c: Candidate, target: AttackTarget = c.target): PlannedAttack {
  return { attacker: c.attacker, object: c.object, target, targets: c.targets };
}

export interface AttackContext extends BlockContext {
  readonly sample: GameState | undefined;
  /**
   * The chance, from 0 to 1, that the opponent blocks only when it is in danger rather than sensibly (what the
   * agent has seen of it, `heuristic-model.ts`).
   */
  readonly passiveWeight: number;
  /** The same chance for one defending seat (issue 483); `passiveWeight` when absent. */
  readonly passiveWeightFor?: (seat: SeatId) => number;
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
  const w = ctx.weights;
  // Issue 479: the opponent the attackers can kill, else the weakest, is the one attacked; the lethal
  // check and the play-outs below are about that opponent.
  const ranked = rankOpponents(
    view,
    d.candidates.flatMap((c) => {
      const o = findObject(view, c.attacker);
      return o === undefined || powerOf(o) <= 0 ? [] : [o];
    }),
  );
  const opp = ranked[0];
  const candidates: Candidate[] = d.candidates.flatMap((c) => {
    const object = findObject(view, c.attacker);
    const target = targetFor(view, c.targets, ranked);
    return object === undefined || target === undefined
      ? []
      : [{ attacker: c.attacker, object, targets: c.targets, target }];
  });
  const required = new Set(d.mustAttack);
  const declare = (set: readonly PlannedAttack[]): Action => ({
    kind: 'declareAttackers',
    attacks: withinAttackBudget(
      d,
      set.map((p) => ({ attacker: p.attacker, target: p.target })),
    ),
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
  const sets = new Map<string, Option>();
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
    (x, y) =>
      creatureValue(y.object, w) - creatureValue(x.object, w) || byId(x.attacker, y.attacker),
  );
  for (const c of bestFirst.slice(0, SINGLES)) addSet([c]);
  const walker = armed
    .flatMap((c) => c.targets)
    .find(
      (t) => t.kind === 'permanent' && findObject(view, t.object)?.types.includes('planeswalker'),
    );
  if (walker !== undefined) addSet(safe, walker);
  const options = [...sets.values()];
  const toAction = (o: Option): Action =>
    declare(o.cs.map((c) => planned(c, o.at.get(c.attacker))));

  // Without a sample: the safe attackers, less the guard of the home.
  const sample = ctx.sample;
  const fallback = (): AttackChoice => {
    const going = guardHome(view, me, union(safe), required, w);
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
  const engine = ctx.budget.engine;
  // The creatures the opponents may cast and attack with at once, from what their decks can do (issue 653, 2b).
  const hidden = hiddenAttackersOf(view, sample, opponentsOf(view, sample, engine.view));

  // 3. Play each candidate out on the sample and score it. The opponent is assumed to block sensibly
  // (`defaultPlan`) with probability 1 - `passive` and to block only in danger (`dangerOnlyPlan`) with
  // probability `passive`, which the agent learns from what it has seen (`heuristic-model.ts`); a
  // candidate's numbers are the average of the two plays.
  const policyOf = (plan: typeof defaultPlan) => ({
    ...within(ctx.budget),
    blocks: (v: GameView, bd: Parameters<typeof defaultPlan>[1]): Action => ({
      kind: 'declareBlockers',
      blocks: withinBlockBudget(bd, plan(v, bd, w).blocks),
    }),
  });
  const sensible = policyOf(defaultPlan);
  const passive = policyOf(dangerOnlyPlan);
  const scored: Scored<Option>[] = [];
  const oppLife = view.seats.find((x) => x.id === opp)?.life ?? 0;
  const hurry = urgency(view, w);
  const scoreOf = (c: { raw: number; crack: number; dealt: number }, u: number): number =>
    c.raw - (1 - u) * c.crack + u * w.attacks.desperation * c.dealt;
  /** The numbers of one candidate played out against one assumed opponent, or null. */
  const playCandidate = (o: Option, policy: typeof sensible): Played | null => {
    let end: GameState | null = sample;
    if (o.cs.length > 0) {
      const declared = applyOrNull(sample, me, toAction(o), engine);
      end = declared === null ? null : playOut(declared, me, policy);
    }
    if (end === null) return null;
    const v = engine.view(end, me);
    return {
      raw: evaluate(untappedFor(v, me), me, w).score,
      crack: crackBackPenalty(v, me, w, hidden),
      dealt: Math.max(oppLife - (v.seats.find((x) => x.id === opp)?.life ?? oppLife), 0),
      end,
      view: v,
    };
  };
  const weight = ctx.passiveWeightFor?.(opp) ?? ctx.passiveWeight;
  // The stay-home candidate and the safe one are always scored; the others while the budget lasts.
  const order = [...options].sort((x, y) => x.cs.length - y.cs.length);
  const search = ctx.budget.search();
  for (const [i, o] of order.entries()) {
    if (i >= 2 && search.expired(i) !== null) break;
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
    scored.push({ o, ...c, combatRaw: c.raw, score: scoreOf(c, hurry), risk: 0, parts: [a, b] });
  }
  // Nothing scored, or a play-out was dropped before two were: the rules-based attack answers.
  if (scored.length === 0 || (scored.length < 2 && ctx.budget.over() !== null)) return fallback();
  const rank = (a: Scored<Option>, b: Scored<Option>, u: number): number =>
    scoreOf(b, u) - b.risk - (scoreOf(a, u) - a.risk) || a.o.cs.length - b.o.cs.length;
  /** The best of `pool` (the stay-home candidate unless another beats it by the margin) and why. */
  const choose = (pool: readonly Scored<Option>[]) => {
    const home = pool.find((s) => s.o.cs.length === 0);
    // What the agent would do with no hurry, to tell the library clock's choices apart.
    const calmPick = [...pool].sort((x, y) => rank(x, y, 0))[0];
    const sorted = [...pool].sort((x, y) => rank(x, y, hurry));
    let pick = sorted[0];
    if (pick === undefined) return undefined;
    if (home !== undefined && pick !== home && pick.score < home.score + w.attacks.margin)
      pick = home;
    const bestRaw = [...sorted].sort(
      (x, y) => y.combatRaw - x.combatRaw || x.o.cs.length - y.o.cs.length,
    )[0];
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
    return { chosen, reason, sorted };
  };
  const first = choose(scored);
  if (first === undefined) return fallback();
  // 4. The look-ahead (two players): "no attack" and the best other candidates, played to the agent's next
  // turn, replace the crack-back formula where the play-out sees it (`heuristic-attack-look.ts`).
  const agents = ctx.agents;
  if (agents !== undefined && twoPlayers(view)) {
    const look = new Look(me, agents, ctx.budget, w);
    const looked = lookAtAttacks(
      {
        look,
        budget: ctx.budget,
        weights: w,
        me,
        opp,
        oppLife,
        weight,
        hidden,
        start: (s, p) =>
          s.o.cs.length === 0 ? applyOrNull(sample, me, toAction(s.o), engine) : p.end,
        isHome: (o) => o.cs.length === 0,
        scoreOf: (c) => scoreOf(c, hurry),
      },
      first.sorted,
      first.chosen,
    );
    const second = looked === null ? undefined : choose(looked);
    if (second !== undefined) {
      return {
        action: toAction(second.chosen.o),
        reason: second.reason,
        look: { playOuts: look.playOuts, changed: second.chosen.o !== first.chosen.o },
      };
    }
  }
  return { action: toAction(first.chosen.o), reason: first.reason };
}
