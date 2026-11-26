/**
 * The look-ahead of the attack search (issue 653, step 5; `heuristic-combat-look.ts` has the idea). The search
 * of `heuristic-attacks.ts` has scored each candidate attack by playing the combat out, with the opponent's
 * next attack estimated by `crackBackPenalty`. Here "no attack" and the best two other candidates are played
 * on from the end of that combat to the start of the agent's next turn, and each is scored again:
 * `evaluate` of that position (the opponent's attack is then played, not estimated), less the part of the
 * crack-back the play-out cannot see (the creature the opponent may still cast and attack with from a hand the
 * sample dealt it differently: `hiddenAttackersOf`, the opponent profile), plus the library clock's life term.
 * The candidates the look did not reach keep the combat-only score and are left out of the choice.
 */
import type { GameState, GameView, SeatId } from '@commander-arena/engine';
import type { Budget } from './heuristic-budget';
import { type Look, lookSet } from './heuristic-combat-look';
import { crackBackPenalty } from './heuristic-crack-back';
import type { HiddenAttacker } from './heuristic-threats';
import type { AgentWeights } from './weights';

/** What one candidate attack came to when the combat was played out against one assumed opponent. */
export interface Played {
  readonly raw: number;
  readonly crack: number;
  /** The life the opponent loses in it. */
  readonly dealt: number;
  /** The state at the end of the combat (the sample itself for "no attack"), and the agent's view of it. */
  readonly end: GameState;
  readonly view: GameView;
}

/** One candidate attack with its numbers: the mean of the plays against the two assumed opponents. */
export interface Scored<O> {
  readonly o: O;
  readonly raw: number;
  /** `raw` of the combat alone (`raw` itself is the next turn's once the look-ahead has run). */
  readonly combatRaw: number;
  readonly crack: number;
  readonly dealt: number;
  /** The score the choice is made by: `raw`, `crack` and `dealt` as the search weighs them, less `risk`. */
  readonly score: number;
  /** What the choice takes off for the worse of the two assumed opponents (0 before the look-ahead). */
  readonly risk: number;
  /** The play against the sensible opponent and the one against the passive one (the same play twice when one). */
  readonly parts: readonly [Played, Played];
}

type Numbers = { raw: number; crack: number; dealt: number };

export interface AttackLook<O> {
  readonly look: Look;
  readonly budget: Budget;
  readonly weights: AgentWeights;
  readonly me: SeatId;
  readonly opp: SeatId;
  /** The opponent's life before the attack. */
  readonly oppLife: number;
  /** The chance that the opponent blocks only in danger (`heuristic-model.ts`), the share of the second part. */
  readonly weight: number;
  readonly hidden: ReadonlyMap<SeatId, HiddenAttacker>;
  /** The state the next turn is played from: the end of the combat, or "no attack" declared on the sample. */
  readonly start: (s: Scored<O>, p: Played) => GameState | null;
  /** Whether a candidate is "no attack". */
  readonly isHome: (o: O) => boolean;
  /** The score of a candidate's numbers (the library clock's weighting, `scoreOf` of the search). */
  readonly scoreOf: (c: { raw: number; crack: number; dealt: number }) => number;
}

/**
 * The scored candidates played to the next turn (re-scored), or null when the budget did not allow "no attack"
 * and one other. `ranked` is every candidate best first, `chosen` the search's choice (played first, so the
 * budget reaches it before the rest).
 */
export function lookAtAttacks<O>(
  a: AttackLook<O>,
  ranked: readonly Scored<O>[],
  chosen: Scored<O>,
): Scored<O>[] | null {
  const home = ranked.find((s) => a.isHome(s.o));
  if (home === undefined) return null;
  // Ranked without the crack-back: it is what the look replaces, and a candidate the formula fears too much
  // must still be played (the search's own choice is looked at as well).
  const calm = (s: Scored<O>): number => a.scoreOf({ raw: s.raw, crack: 0, dealt: s.dealt });
  const set = lookSet(
    [...ranked].sort((x, y) => calm(y) - calm(x)),
    home,
    calm,
    a.weights.attacks.lookMargin,
  );
  const order = [...new Set([chosen, home, ...set])];
  const search = a.budget.search();
  const w = a.weights;
  const hasHidden = a.hidden.size > 0;
  const out = new Map<Scored<O>, Scored<O>>();
  let done = 0;
  const numbersOf = (s: Scored<O>, p: Played): Numbers | null => {
    const from = a.start(s, p);
    const next = from === null ? null : a.look.next(from);
    done += 1;
    if (next === null) return null;
    // What the play-out does not show of the opponent's next attack: the creature it may cast from a hand
    // the sample dealt differently (`hiddenAttackersOf`), at the share of the chance that it holds one.
    const unseen = hasHidden
      ? Math.max(crackBackPenalty(p.view, a.me, w, a.hidden) - crackBackPenalty(p.view, a.me, w), 0)
      : 0;
    const life = next.seats.find((x) => x.id === a.opp)?.life ?? a.oppLife;
    return {
      raw: a.look.score(next),
      crack: unseen,
      dealt: Math.max(a.oppLife - life, 0),
    };
  };
  // The opponent blocks sensibly until what the agent has seen says otherwise: of the chance that it is passive
  // (1/2 before anything is seen, `heuristic-model.ts`) only what is above that prior counts here. The
  // play-out of the next turn is the stronger model of the opponent throughout, and the agent does not rest an
  // attack on an obvious block being missed.
  const passive = Math.max(2 * a.weight - 1, 0);
  for (const s of order) {
    if (search.expired(done) !== null) break;
    const [x, y] = s.parts;
    const parts = x === y || passive === 0 ? [x] : passive === 1 ? [y] : [x, y];
    const got = parts.map((p) => numbersOf(s, p));
    const nums = got.filter((n): n is Numbers => n !== null);
    if (nums.length < parts.length) continue;
    const [one, two] = nums;
    const mix = (f: (n: Numbers) => number): number =>
      one === undefined
        ? 0
        : two === undefined
          ? f(one)
          : (1 - passive) * f(one) + passive * f(two);
    const c = { raw: mix((n) => n.raw), crack: mix((n) => n.crack), dealt: mix((n) => n.dealt) };
    // As the planner's lines (`lineValue`): the gap between the mean and the worse of the two plays is
    // partly taken off, so an attack that is good only if the opponent does not block is not chosen on it.
    const mean = a.scoreOf(c);
    const risk =
      two === undefined || one === undefined
        ? 0
        : w.plan.riskAversion * Math.max(mean - Math.min(a.scoreOf(one), a.scoreOf(two)), 0);
    out.set(s, { ...s, ...c, score: mean - risk, risk });
  }
  const looked = [...out.values()];
  const hasHome = looked.some((s) => a.isHome(s.o));
  return hasHome && looked.length >= 2 ? looked : null;
}
