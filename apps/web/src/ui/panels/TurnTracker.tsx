/** The top bar of the game screen: turn, whose turn, the step row with stops, and priority. */
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

/** The chip's words for a phase an effect added to the turn (CR 500.8, D-1130): "Extra beginning phase", "Extra combat phase". */
export function addedPhaseLabel(phase: PhaseId): string {
  return `Extra ${phase === 'precombatMain' || phase === 'postcombatMain' ? 'main' : phase} phase`;
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
  const priority = view.prioritySeat === null ? null : seatName(view.prioritySeat, view.viewer);

  return (
    <header className="pnl-tracker">
      <div className="pnl-tracker-info">
        <span
          className={`pnl-whose ${mine ? 'pnl-mine' : 'pnl-theirs'}`}
          data-turn-label
          data-round={roundOf(view.turn, view.seats.length)}
        >
          {turnLabel(view.activeSeat, view.viewer, view.turn, view.seats.length)}
        </span>
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
            {view.monarch === view.viewer ? 'You are the monarch' : 'Opponent is the monarch'}
          </span>
        )}
        {fallbacks > 0 && (
          <span
            className="pnl-chip pnl-chip-warn"
            title="The opponent AI ran out of time and a safe default move was used instead."
          >
            AI fallback ×{fallbacks}
          </span>
        )}
      </div>
      <ol className="pnl-steps">
        {STEP_ORDER.map((step) => {
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
                  title={`${stopped ? 'Remove the stop at' : 'Stop at'} ${label} on ${mine ? 'your' : "the opponent's"} turns`}
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
