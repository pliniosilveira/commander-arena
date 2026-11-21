import { BarButtons } from './BarButtons';
import type { BarModel } from './model';

interface ActionBarProps {
  readonly bar: BarModel | null;
  /** What the opponent is doing when the game waits for them (a search, a discard), if known. */
  readonly waiting?: string | null;
  readonly passing: boolean;
  /** True while the opponent has been deciding for a while (`useOpponentThinking`, D-174). */
  readonly thinking?: boolean;
  /** True while a "Pass turn" runs (issue 46): the bar says so and offers to cancel it. */
  readonly passTurn: boolean;
  readonly onCancelPassTurn: () => void;
  readonly onSeize: () => void;
}

/**
 * The "Opponent is thinking" line (D-174). Its box is always there, one line tall, and a polite live
 * region from the start, so the line appears and goes without moving anything in the dock and a screen
 * reader announces it. The dots stand still under `prefers-reduced-motion`.
 */
function ThinkingStatus({ thinking }: { readonly thinking: boolean }) {
  return (
    <p className="dec-thinking" role="status" aria-live="polite" data-thinking={thinking}>
      {thinking ? (
        <>
          Opponent is thinking
          <span className="dec-dots" aria-hidden="true">
            <i>.</i>
            <i>.</i>
            <i>.</i>
          </span>
        </>
      ) : null}
    </p>
  );
}

/**
 * The action bar (SPEC 10): the prompt and the single context-sensitive button. Full Control,
 * manual mana, Undo and Concede live in the Settings panel (issue 43).
 */
export function ActionBar(props: ActionBarProps) {
  const { bar, passing, passTurn, waiting = null, thinking = false } = props;
  return (
    <section className="dec-bar dec-panel" aria-label="Actions">
      <ThinkingStatus thinking={thinking} />
      {passTurn ? (
        <div className="dec-passturn" role="status">
          <span className="dec-prompt">
            Passing turn… <small>Esc to cancel</small>
          </span>
          <button
            type="button"
            className="dec-btn dec-btn-secondary"
            title="Esc"
            onClick={props.onCancelPassTurn}
          >
            Cancel pass
          </button>
        </div>
      ) : passing ? (
        <button type="button" className="dec-passing" onClick={props.onSeize}>
          Passing… <small>(click to hold priority)</small>
        </button>
      ) : bar === null ? (
        <p className="dec-prompt" role="status">
          {waiting ?? 'Waiting for the game.'}
        </p>
      ) : bar.inOverlay ? null : (
        <>
          <p className="dec-prompt" aria-live="polite">
            {bar.prompt}
          </p>
          {bar.detail === null ? null : <p className="dec-detail">{bar.detail}</p>}
          <div className="dec-bar-actions">
            <BarButtons buttons={bar.buttons} />
            {bar.cancel === null ? null : (
              <button
                type="button"
                className="dec-btn dec-btn-secondary"
                title="Esc"
                onClick={bar.cancel.run}
              >
                {bar.cancel.label}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
