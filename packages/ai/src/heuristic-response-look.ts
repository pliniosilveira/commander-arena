/**
 * The look-ahead of a response and of a removal target (issue 653, step 6). Two choices that today's rules
 * make from the board in front of them are played out when the agent has a sample (`heuristic-combat-look.ts`
 * has the idea: the inner agents decide for every seat, the opponents always the stronger model, and the
 * position at the start of the agent's next turn is scored by `evaluate`):
 *
 *  - COUNTER OR HOLD (`lookAtCounter`): a counterspell in response to an opponent's spell that today's rule
 *    would counter. The sample is played on with the counterspell cast and with the agent passing, each to the
 *    end of the turn (in the opponent's turn, the start of the agent's own), and the counterspell is held when
 *    holding scores better than countering by more than `main.counterLookMargin`. The inner agent that holds
 *    counters by the rule again, so a commander that follows the spell this turn meets the counterspell.
 *  - REMOVAL TARGETS (`lookAtTargets`): a removal spell's target is today's best by threat value (the opposing
 *    commander first among near-equals, `heuristic-targets.ts`). That target and the best two others whose
 *    value is within `removal.lookMargin` of the best one's (`targetsToLook`) are played to the agent's next
 *    turn, and another target replaces today's when it scores better by `plan.margin`, the planner's margin.
 *    Two players only: with more, one turn of each opponent costs what the budget allows.
 *
 * Both draw from the decision's work budget: a play-out starts only when the work so far plus the average cost
 * of one fits (`Search.expired`), and a decision that could not play what it needs to compare keeps today's
 * choice. The inner agents have no sample, so nothing here runs inside a play-out.
 */
import type { Action, GameState, GameView, ObjectView, SeatId } from '@commander-arena/engine';
import type { Engine, Think } from './heuristic-budget';
import { Look, type LookRecord, lookSet, twoPlayers } from './heuristic-combat-look';
import { type Answer, applyAnswering } from './heuristic-delta';
import type { SimAgents } from './heuristic-plan-sim';
import { applyOrNull } from './heuristic-sim';
import { removalOptions, type TargetPick } from './heuristic-targets';

/** What a look decided: the index of the candidate it chose (0 is today's) and how many play-outs it ran. */
export interface Looked {
  readonly index: number;
  readonly playOuts: number;
}

/** A candidate: the state it leads to from the sample (null when the engine refuses it). */
type Start = (engine: Engine) => GameState | null;

/** The score of each candidate played to the agent's next turn; the scores stop at the first the budget did not reach. */
function scoreAll(
  me: SeatId,
  starts: readonly Start[],
  think: Think,
  agents: SimAgents,
): { scores: (number | null)[]; playOuts: number } {
  const look = new Look(me, agents, think.budget, think.weights);
  const search = think.budget.search();
  const scores: (number | null)[] = [];
  for (const [i, start] of starts.entries()) {
    if (search.expired(i) !== null) break;
    const from = start(think.budget.engine);
    const next = from === null ? null : look.next(from);
    scores.push(next === null ? null : look.score(next));
  }
  return { scores, playOuts: look.playOuts };
}

/**
 * Whether to hold `counter` (the cast of the counterspell) instead of casting it at the spell on top of the
 * stack, by playing both out: index 1 holds, 0 counters. Null when no sample or budget allows the comparison
 * (today's rule counters).
 */
export function lookAtCounter(
  view: GameView,
  counter: Action,
  think: Think,
  agents: SimAgents | undefined,
  answer: Answer,
): Looked | null {
  const sample = think.sample();
  if (agents === undefined || sample === undefined || sample.pending?.kind !== 'priority') {
    return null;
  }
  if (sample.stack.length !== view.stack.length) return null;
  const me = view.viewer;
  const { scores, playOuts } = scoreAll(
    me,
    [
      (engine) => applyAnswering(sample, me, counter, answer, engine),
      (engine) => applyOrNull(sample, me, { kind: 'pass' }, engine),
    ],
    think,
    agents,
  );
  const [cast, held] = scores;
  if (cast === null || cast === undefined || held === null || held === undefined) return null;
  return { index: held > cast + think.weights.main.counterLookMargin ? 1 : 0, playOuts };
}

/** The indices of the targets of a removal spell to look at: today's (0) first, then up to two others whose value is within the margin. */
export function targetsToLook(values: readonly number[], margin: number): number[] {
  const all = values.map((_, i) => i);
  return all.length === 0 ? [] : lookSet(all, 0, (i) => values[i] ?? 0, margin);
}

/**
 * The best of `candidates` (a `chooseTargets` answer each, today's first) played to the next turn, or null when
 * no sample or budget allows the comparison. A candidate other than the first must beat it by `plan.margin`.
 */
export function lookAtTargets(
  source: string,
  me: SeatId,
  candidates: readonly Action[],
  think: Think,
  agents: SimAgents | undefined,
  answer: Answer,
): Looked | null {
  if (agents === undefined || candidates.length < 2) return null;
  const sample = think.sample();
  const pending = sample?.pending;
  if (
    sample === undefined ||
    pending?.kind !== 'targets' ||
    pending.seat !== me ||
    pending.source !== source
  ) {
    return null;
  }
  const { scores, playOuts } = scoreAll(
    me,
    candidates.map(
      (c): Start =>
        (engine) =>
          applyAnswering(sample, me, c, answer, engine),
    ),
    think,
    agents,
  );
  const [today, ...others] = scores;
  if (today === null || today === undefined) return null;
  let index = 0;
  let best = today + think.weights.plan.margin;
  for (const [i, score] of others.entries()) {
    if (score !== null && score !== undefined && score > best) {
      best = score;
      index = i + 1;
    }
  }
  return { index, playOuts };
}

/** The targets of a removal spell: today's pick, or another that the look-ahead preferred (`look` when it ran). */
export function pickRemovalTargets(
  view: GameView,
  decision: { readonly source: string; readonly specs: Parameters<typeof removalOptions>[2] },
  source: ObjectView,
  think: Think,
  agents: SimAgents | undefined,
  answer: Answer,
): { pick: TargetPick; look: LookRecord | null } | null {
  const options = removalOptions(view, source, decision.specs, think.weights);
  const today = options?.picks[0];
  if (options === null || today === undefined) return null;
  if (!twoPlayers(view)) return { pick: today, look: null };
  const set = targetsToLook(options.values, think.weights.removal.lookMargin);
  const candidates = set.map(
    (i): Action => ({ kind: 'chooseTargets', targets: options.picks[i]?.targets ?? today.targets }),
  );
  const looked = lookAtTargets(decision.source, view.viewer, candidates, think, agents, answer);
  if (looked === null) return { pick: today, look: null };
  const chosen = options.picks[set[looked.index] ?? 0] ?? today;
  return { pick: chosen, look: { playOuts: looked.playOuts, changed: looked.index !== 0 } };
}
