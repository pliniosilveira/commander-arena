/**
 * Combat on a copy (M7c, PRIOR_ART 7.2 heuristic 3, D-163): plays a determinized sample forward through
 * the engine's own `applyAction`, so first strike, deathtouch, trample, lifelink, menace, indestructible
 * and every trigger are resolved by the rules code and never by an imitation in the AI. The sample is
 * never changed (`applyAction` is pure), so one sample serves every candidate of a decision.
 *
 * What the copy assumes about the seats that are not the agent: they pass priority (no tricks, no
 * spells), divide combat damage with the engine's default division, declare no attackers, and block as
 * `policy.blocks` says (no blocks without a policy). Every other decision (a trigger's targets, an
 * optional payment, ...) is answered by the casual handlers with a fixed draw, so a run is
 * deterministic. A run that the engine refuses at any point returns `null`: the caller drops that
 * candidate instead of guessing.
 */
import {
  type Action,
  applyAction,
  type DeclareBlockersDecision,
  defaultDivision,
  type GameState,
  type GameView,
  getView,
  handleDecision,
  type SeatId,
} from '@commander-arena/engine';
import { createCasualHandlers } from './casual-agent';

export interface SimPolicy {
  /** How a seat other than the agent blocks. Without it, nothing blocks. */
  readonly blocks?: (view: GameView, d: DeclareBlockersDecision) => Action;
  /**
   * Asked before each engine step: when it says true the play-out is dropped (null), like a refused
   * action, so a candidate on a huge board cannot run past the time budget (D-164).
   */
  readonly abort?: () => boolean;
}

/** Enough actions for any combat: priority passes, damage choices, a few triggers and payments. */
const MAX_STEPS = 120;

/** The combat phase is over, or the game is. */
export const combatOver = (s: GameState): boolean =>
  s.result !== null ||
  s.pending === null ||
  s.turn.phase !== 'combat' ||
  s.turn.step === 'endOfCombat';

/** The action the copy takes for the pending decision of any seat, or null when nothing is pending. */
function simAction(state: GameState, me: SeatId, policy: SimPolicy): Action | null {
  const d = state.pending;
  if (d === null) return null;
  if (d.kind === 'priority') return { kind: 'pass' };
  if (d.kind === 'assignDamage')
    return { kind: 'assignDamage', assignments: defaultDivision(d.choices) };
  if (d.kind === 'declareAttackers') return { kind: 'declareAttackers', attacks: [] };
  const view = getView(state, d.seat);
  if (d.kind === 'declareBlockers') {
    if (d.seat !== me && policy.blocks !== undefined) return policy.blocks(view, d);
    return { kind: 'declareBlockers', blocks: [] };
  }
  if (d.kind === 'payMana') return { kind: 'payAuto' };
  return handleDecision(
    d,
    createCasualHandlers(view, () => 0),
  );
}

/** Applies one action of `seat`; null when the engine refuses it. */
export function applyOrNull(state: GameState, seat: SeatId, action: Action): GameState | null {
  const applied = applyAction(state, seat, action);
  return applied.ok ? applied.state : null;
}

/**
 * Plays `state` forward until `stop` holds (by default the end of combat) or `maxSteps` actions have
 * been taken. Returns the state reached, or null when the engine refused an action or the limit hit
 * before `stop` held.
 */
export function playOut(
  state: GameState,
  me: SeatId,
  policy: SimPolicy = {},
  stop: (s: GameState) => boolean = combatOver,
  maxSteps: number = MAX_STEPS,
): GameState | null {
  let current = state;
  for (let i = 0; i < maxSteps; i += 1) {
    if (stop(current)) return current;
    if (policy.abort?.() === true) return null;
    const seat = current.pending?.seat;
    let action: Action | null;
    try {
      action = simAction(current, me, policy);
    } catch {
      return null;
    }
    if (action === null || seat === undefined) return current;
    const next = applyOrNull(current, seat, action);
    if (next === null) return null;
    current = next;
  }
  return stop(current) ? current : null;
}

/** The first state in which `me` is asked `kind` again or the combat is over: used to answer a follow-up. */
export function answerFollowUps(
  state: GameState,
  me: SeatId,
  until: (s: GameState) => boolean,
  maxSteps: number = 12,
): GameState | null {
  let current = state;
  for (let i = 0; i < maxSteps; i += 1) {
    if (until(current)) return current;
    const d = current.pending;
    if (d === null || d.seat !== me || d.kind === 'priority') return current;
    const action = simAction(current, me, {});
    if (action === null) return current;
    const next = applyOrNull(current, me, action);
    if (next === null) return null;
    current = next;
  }
  return current;
}
