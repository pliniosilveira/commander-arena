/**
 * The play-out of the turn planner (issue 624, phase 3): one LINE of the agent's turn played on a scenario
 * of the sample (`heuristic-threats.ts`) with the engine's own `applyAction`, through the rest of the
 * agent's turn and the next turn of every opponent, until the agent's next turn starts.
 *
 * Who decides on the copy:
 * - the opponents: the HeuristicAgent's own rules (`SimAgents.of(seat)`), with the look-ahead off: the
 *   inner agents get no sample and no budget, so they neither sample nor plan (the planner is the
 *   look-ahead). They cast from the hand the scenario dealt them, counter, attack and block;
 * - the agent, in the windows the line names (`Window`): the line's actions in order, each taken when the
 *   engine lists it and skipped otherwise; then `rest`: pass, or today's rules (the same inner agent);
 *   a land first in a main phase, as today (`planLand`). Removal the line holds is cast in an opponent's
 *   combat once the blockers are declared. Every other decision of the agent: today's rules.
 *
 * With `record`, every decision of the agent in a window is written down with the board print of its view
 * (`heuristic-plan-print.ts`): the steps of a plan. The copy is never the real game: a refused action or
 * a budget that runs out drops the play-out (null).
 */
import {
  type Action,
  applyAction,
  type DecisionHandlers,
  type GameState,
  type GameView,
  getView,
  handleDecision,
  type ObjectId,
  type PendingDecision,
  type PriorityDecision,
  type SeatId,
} from '@commander-arena/engine';
import { withFace } from './casual-priority';
import type { Budget } from './heuristic-budget';
import { planLand } from './heuristic-lands';
import { type BoardPrint, boardPrint } from './heuristic-plan-print';
import { payHolding } from './heuristic-protect';
import type { AgentWeights } from './weights';

/** The moments of a turn a plan has steps for. */
export type Window = 'main1' | 'attack' | 'afterBlocks' | 'main2' | 'theirEnd';

export const MAIN_WINDOWS: readonly Window[] = ['main1', 'main2'];

/** One way to play the turn (see `heuristic-plan-lines.ts`). */
export interface Line {
  readonly label: string;
  /** The agent's actions in each window, in order. */
  readonly acts: Partial<Record<Window, readonly Action[]>>;
  /** What the agent does in a window once its actions are used up: pass, or today's rules (the default). */
  readonly rest: Partial<Record<Window, 'pass' | 'today'>>;
  /** Removal held for an opponent's attack. */
  readonly holdRemoval: readonly ObjectId[];
  /** Mana kept payable when the line's casts are paid (`payHolding`). */
  readonly reserve: readonly string[] | null;
}

export interface PlanStep {
  readonly when: Window;
  readonly action: Action;
  readonly expect: BoardPrint;
  readonly reserve: readonly string[] | null;
}

/** Inner HeuristicAgents (no sample, no planning): `start` gives a fresh one per seat for one play-out. */
export interface SimAgents {
  readonly start: () => (seat: SeatId) => (view: GameView) => DecisionHandlers<Action>;
}

export interface PlayContext {
  readonly agents: SimAgents;
  readonly budget: Budget;
  readonly weights: AgentWeights;
  /**
   * The engine steps every play-out of one planning has taken, and the most it may take: a bound of the
   * work that holds whatever the clock says (a logical clock never runs out). A play-out that would pass it
   * is dropped.
   */
  readonly work: { steps: number; readonly limit: number };
}

/** Enough actions for a turn of the agent and one turn of each opponent on a big board. */
const MAX_STEPS = 900;

/** The seat whose turn comes just before `me`'s (the opponent whose end step is the last before its turn). */
export function seatBefore(view: GameView, me: SeatId): SeatId {
  const living = view.seats.filter((s) => !s.hasLost || s.id === me).map((s) => s.id);
  const at = living.indexOf(me);
  return living[(at - 1 + living.length) % living.length] ?? me;
}

/** The window of a decision of `view.viewer`, or null when it is in none. */
export function windowOf(view: GameView, d: PendingDecision): Window | null {
  const me = view.viewer;
  if (d.kind === 'declareAttackers') return view.activeSeat === me ? 'attack' : null;
  if (d.kind !== 'priority' || view.stack.length > 0) return null;
  if (view.activeSeat === me) {
    if (view.step === 'precombatMain') return 'main1';
    if (view.step === 'postcombatMain') return 'main2';
    if (view.step === 'declareBlockers' && view.combat !== null) return 'afterBlocks';
    return null;
  }
  return view.step === 'end' && view.activeSeat === seatBefore(view, me) ? 'theirEnd' : null;
}

const same = (a: Action, o: PriorityDecision['options'][number]): boolean => {
  if (a.kind !== o.kind) return false;
  if (a.kind === 'castSpell' && o.kind === 'castSpell') {
    return a.object === o.object && a.alternative === o.alternative && a.face === o.face;
  }
  if (a.kind === 'activate' && o.kind === 'activate') {
    return a.object === o.object && a.abilityIndex === o.abilityIndex;
  }
  if (a.kind === 'playLand' && o.kind === 'playLand')
    return a.object === o.object && a.face === o.face;
  return a.kind === 'pass';
};

/** Whether the engine lists `action` for `d` (a priority option, or an attack its candidates allow). */
export function isListed(action: Action, d: PendingDecision): boolean {
  if (d.kind === 'priority') return d.options.some((o) => same(action, o));
  if (d.kind === 'declareAttackers' && action.kind === 'declareAttackers') {
    const going = new Set(action.attacks.map((a) => a.attacker));
    return (
      d.mustAttack.every((id) => going.has(id)) &&
      action.attacks.every((a) =>
        d.candidates.some(
          (c) =>
            c.attacker === a.attacker &&
            c.targets.some((t) => JSON.stringify(t) === JSON.stringify(a.target)),
        ),
      )
    );
  }
  return false;
}

/** The land today's rules play now in a main phase (null when none or when it waits for after combat). */
function landNow(view: GameView, d: PriorityDecision, weights: AgentWeights): Action | null {
  const land = planLand(view, d, weights);
  if (land === null || land.hold) return null;
  return { kind: 'playLand', object: land.play.obj.id, ...withFace(land.play.face) };
}

export interface PlayResult {
  readonly end: GameState;
  readonly steps: readonly PlanStep[];
}

/** A priority decision whose only options are passing and mana abilities. */
const onlyPass = (d: PendingDecision): boolean =>
  d.kind === 'priority' &&
  d.options.every((o) => o.kind === 'pass' || o.kind === 'activateAbility');

/** Whether the agent's priority now could be in a window (the cheap test of `windowOf`, on the state). */
function inWindow(state: GameState, me: SeatId): boolean {
  if (state.stack.length > 0) return false;
  const step = state.turn.step;
  if (state.turn.activeSeat === me) {
    return step === 'precombatMain' || step === 'postcombatMain' || step === 'declareBlockers';
  }
  return step === 'end';
}

/** Plays `line` on `state` for `me` to the start of its next turn (see the module comment). */
export function playLine(
  state: GameState,
  me: SeatId,
  line: Line,
  ctx: PlayContext,
  record: boolean,
): PlayResult | null {
  const start = state.turn.number;
  const used: Partial<Record<Window, number>> = {};
  const steps: PlanStep[] = [];
  let fromLine = false;
  let current = state;
  const handlersOf = ctx.agents.start();
  for (let i = 0; i < MAX_STEPS; i += 1) {
    if (current.result !== null) return { end: current, steps };
    if (current.turn.activeSeat === me && current.turn.number > start)
      return { end: current, steps };
    if (ctx.budget.over() || ctx.work.steps >= ctx.work.limit) return null;
    ctx.work.steps += 1;
    const d = current.pending;
    if (d === null) return { end: current, steps };
    const seat = d.seat;
    // Nothing to do but pass (or tap mana, which no rule of the agent does by hand): pass without building a
    // view, the costliest part of a step on a big board. A recorded window of the agent still needs its print.
    if (onlyPass(d) && !(record && seat === me && inWindow(current, me))) {
      const passed = applyAction(current, seat, { kind: 'pass' });
      if (!passed.ok) return null;
      current = passed.state;
      continue;
    }
    const view = getView(current, seat);
    const handlers = handlersOf(seat)(view);
    let action: Action;
    try {
      if (seat !== me) {
        action = handleDecision(d, handlers);
      } else if (d.kind === 'payMana' && fromLine) {
        action = (line.reserve === null ? null : payHolding(view, d, line.reserve)) ?? {
          kind: 'payAuto',
        };
      } else {
        const when = windowOf(view, d);
        const chosen = when === null ? null : lineAction(view, d, when, line, used, ctx.weights);
        if (chosen !== null) {
          action = chosen.action;
          fromLine = chosen.fromLine;
        } else {
          action =
            d.kind === 'priority'
              ? (heldRemoval(view, d, line) ?? handleDecision(d, handlers))
              : handleDecision(d, handlers);
          if (d.kind === 'priority')
            fromLine = action.kind === 'castSpell' && line.holdRemoval.includes(action.object);
        }
        if (record && when !== null) {
          steps.push({
            when,
            action,
            expect: boardPrint(view),
            reserve: fromLine ? line.reserve : null,
          });
        }
      }
    } catch {
      return null;
    }
    const applied = applyAction(current, seat, action);
    if (!applied.ok) return null;
    current = applied.state;
  }
  return null;
}

/** The agent's action in a window of the line, or null for today's rules. */
function lineAction(
  view: GameView,
  d: PendingDecision,
  when: Window,
  line: Line,
  used: Partial<Record<Window, number>>,
  weights: AgentWeights,
): { action: Action; fromLine: boolean } | null {
  if (d.kind !== 'priority') return null;
  if (MAIN_WINDOWS.includes(when)) {
    const land = landNow(view, d, weights);
    if (land !== null) return { action: land, fromLine: false };
  }
  const acts = line.acts[when] ?? [];
  for (let i = used[when] ?? 0; i < acts.length; i += 1) {
    const a = acts[i] as Action;
    if (!isListed(a, d)) continue;
    used[when] = i + 1;
    return { action: a, fromLine: true };
  }
  used[when] = acts.length;
  return (line.rest[when] ?? 'today') === 'pass'
    ? { action: { kind: 'pass' }, fromLine: false }
    : null;
}

/** Held removal, cast in an opponent's combat once the blockers are declared and the stack is empty. */
function heldRemoval(view: GameView, d: PriorityDecision, line: Line): Action | null {
  if (
    line.holdRemoval.length === 0 ||
    view.activeSeat === view.viewer ||
    view.step !== 'declareBlockers' ||
    view.combat === null ||
    view.stack.length > 0
  ) {
    return null;
  }
  for (const id of line.holdRemoval) {
    const cast: Action = { kind: 'castSpell', object: id };
    if (isListed(cast, d)) return cast;
  }
  return null;
}
