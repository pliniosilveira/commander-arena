/**
 * The turn box at the left edge of the game screen: turn, whose turn, priority and three steps: the
 * previous, the current and the next (a click on one adds or removes its stop).
 */
import type { GameView, PhaseId, StepId } from '@commander-arena/engine';
import { roundOf, turnLabel } from '../../game/turn-label';
import { STOP_STEPS, type StopSettings } from '../../policy/should-stop';
import { STEP_LABELS } from '../format';
import { useActions, useApp } from '../store-context';
import { seatName } from './objects';
import './panels.css';

/** Turn order of the steps (CR 500). */
export const STEP_ORDER: readonly StepId[] = [
  'untap',
  'upkeep',
  'draw',
  'precombatMain',
  'beginningOfCombat',
  'declareAttackers',
  'declareBlockers',
  'firstStrikeDamage',
  'combatDamage',
  'endOfCombat',
  'postcombatMain',
  'end',
  'cleanup',
];

/** The chip's words for a phase an effect added to the turn (CR 500.8, D-356): "Extra beginning phase", "Extra combat phase". */
export function addedPhaseLabel(phase: PhaseId): string {
  return `Extra ${phase === 'precombatMain' || phase === 'postcombatMain' ? 'main' : phase} phase`;
}

/** The step before, the step and the step after it, in turn order (fewer at the ends of the turn). */
export function neighbours(step: StepId): readonly StepId[] {
  const at = STEP_ORDER.indexOf(step);
  return at < 0 ? [] : STEP_ORDER.slice(Math.max(0, at - 1), at + 2);
}

/** Which settings row a click on a step edits: the active player's side (A18). */
export function stopSide(view: GameView): 'mine' | 'opponent' {
  return view.activeSeat === view.viewer ? 'mine' : 'opponent';
}

export function stopSteps(view: GameView, settings: StopSettings): readonly StepId[] {
  return stopSide(view) === 'mine' ? settings.myTurnStops : settings.opponentTurnStops;
}

export function TurnTracker() {
  const view = useApp((s) => s.snapshot?.view ?? null);
  const settings = useApp((s) => s.settings);
  const fallbacks = useApp((s) => s.snapshot?.aiFallbacks ?? 0);
  const { toggleStop } = useActions();
  if (view === null) return <header className="pnl-tracker" />;

  const side = stopSide(view);
  const stops = stopSteps(view, settings);
  const mine = side === 'mine';
  const priority =
    view.prioritySeat === null ? null : seatName(view.prioritySeat, view.viewer, view.seats.length);

  return (
    <header className="pnl-tracker">
      <div className="pnl-tracker-info">
        <span
          className={`pnl-whose ${mine ? 'pnl-mine' : 'pnl-theirs'}`}
          data-turn-label
          data-round={roundOf(view.turn, view.seats.length, view.extraTurnsTaken)}
        >
          {turnLabel(
            view.activeSeat,
            view.viewer,
            view.turn,
            view.seats.length,
            view.extraTurnsTaken,
          )}
        </span>
        {view.extraTurn === true && (
          <span
            className="pnl-chip"
            title="An effect gave this extra turn (CR 500.7). The turn order goes on after it."
            data-extra-turn
          >
            Extra turn
          </span>
        )}
        {(view.extraTurns ?? []).length > 0 && (
          <span
            className="pnl-chip"
            title="Extra turns are taken directly after this turn, the one made last first (CR 500.7)."
            data-extra-turns-next
          >
            Next: {(view.extraTurns ?? []).map((seat) => seatName(seat, view.viewer)).join(', ')}{' '}
            (extra turn{(view.extraTurns ?? []).length === 1 ? '' : 's'})
          </span>
        )}
        <span className="pnl-priority">
          Priority: <strong>{priority ?? '—'}</strong>
        </span>
        {view.addedPhase === true && view.phase !== 'ending' && (
          <span
            className="pnl-chip"
            title="An effect added this phase to the turn (CR 500.8). The turn goes on after it."
            data-added-phase={view.phase}
          >
            {addedPhaseLabel(view.phase)}
          </span>
        )}
        {view.monarch !== null && (
          <span
            className="pnl-chip pnl-chip-monarch"
            title="The monarch draws a card at the beginning of their own end step. A creature that deals combat damage to the monarch makes its controller the monarch (CR 725.2)."
            data-monarch-hud={view.monarch}
          >
            <span aria-hidden="true">{'♛ '}</span>
            {view.monarch === view.viewer
              ? 'You are the monarch'
              : `${seatName(view.monarch, view.viewer, view.seats.length)} is the monarch`}
          </span>
        )}
        {view.initiative !== undefined && view.initiative !== null && (
          <span
            className="pnl-chip pnl-chip-monarch"
            title="A player who takes the initiative ventures into Undercity, and again at the beginning of each of their upkeeps while they have it. A player whose creatures deal combat damage to the player who has it takes it (CR 726.2)."
            data-initiative-hud={view.initiative}
          >
            <span aria-hidden="true">{'⚔ '}</span>
            {view.initiative === view.viewer
              ? 'You have the initiative'
              : `${seatName(view.initiative, view.viewer, view.seats.length)} has the initiative`}
          </span>
        )}
        {view.dayNight !== null && (
          <span
            className="pnl-chip pnl-chip-daynight"
            title={
              view.dayNight === 'day'
                ? 'It is day. It becomes night at the next untap step if the previous turn’s active player cast no spells (CR 731.2).'
                : 'It is night. It becomes day at the next untap step if the previous turn’s active player cast two or more spells (CR 731.2).'
            }
            data-day-night={view.dayNight}
          >
            <span aria-hidden="true">{view.dayNight === 'day' ? '☀ ' : '☾ '}</span>
            {view.dayNight === 'day' ? 'Day' : 'Night'}
          </span>
        )}
        {fallbacks > 0 && (
          <span
            className="pnl-chip pnl-chip-warn"
            title={`${view.seats.length > 2 ? 'An opponent' : 'The opponent'} AI ran out of time and a safe default move was used instead.`}
          >
            AI fallback ×{fallbacks}
          </span>
        )}
      </div>
      <ol className="pnl-steps">
        {neighbours(view.step).map((step) => {
          const current = view.step === step;
          const toggleable = STOP_STEPS.includes(step);
          const stopped = toggleable && stops.includes(step);
          const label = STEP_LABELS[step];
          const cls = `pnl-step${current ? ' pnl-step-current' : ''}${stopped ? ' pnl-step-stop' : ''}`;
          return (
            <li key={step} className="pnl-step-item" aria-current={current ? 'step' : undefined}>
              {toggleable ? (
                <button
                  type="button"
                  className={cls}
                  aria-pressed={stopped}
                  title={`${stopped ? 'Remove the stop at' : 'Stop at'} ${label} on ${mine ? 'your' : view.seats.length > 2 ? "an opponent's" : "the opponent's"} turns`}
                  onClick={() => toggleStop(side, step)}
                >
                  {label}
                </button>
              ) : (
                <span className={`${cls} pnl-step-fixed`}>{label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </header>
  );
}
