import type { ChoosePermanentDecision, GameView } from '@commander-arena/engine';
import { BarButtons } from './BarButtons';
import { Dialog } from './Dialog';
import { useHoverProps } from './hover';
import { nameOf, objectIndex } from './lookup';
import type { DecisionModel } from './model';
import { permanentLabels, togglePermanent } from './permanents';
import {
  PROLIFERATE_HELP,
  PROLIFERATE_TITLE,
  poisonChipLabel,
  proliferateAll,
  proliferateChipLabel,
  proliferatePlayers,
  togglePlayer,
} from './permanents-angels';
import type { UiState } from './ui-state';

/**
 * The question of proliferate (CR 701.34a, D-149): "choose any number of permanents and/or players with counters on them, then give each
 * another counter of each kind already there". Every permanent with a counter (anyone's, with its counters and whose it is) and every
 * player with poison counters is a chip; any number may be chosen, and Confirm works with none. "Choose all" and "Choose none" are the two
 * quick answers. Hovering a chip shows the card in the preview panel; the board can be clicked as well.
 */
export function ProliferateDialog({
  d,
  view,
  ui,
  model,
  update,
}: {
  d: ChoosePermanentDecision;
  view: GameView;
  ui: UiState;
  model: DecisionModel;
  update: (change: (ui: UiState) => UiState) => void;
}) {
  const index = objectIndex(view);
  const labels = permanentLabels(d.legal, index);
  const hoverProps = useHoverProps();
  const players = proliferatePlayers(d);
  const source = index.get(d.source);
  return (
    <Dialog label="Proliferate" className="dec-proliferate">
      <h2 className="dec-title">{PROLIFERATE_TITLE}</h2>
      {source === undefined || source.oracleText === '' ? null : (
        <p className="dec-source-text" title={source.oracleText}>
          {nameOf(index, d.source)}: {source.oracleText}
        </p>
      )}
      <p className="dec-sub" data-proliferate-help>
        {PROLIFERATE_HELP}
      </p>
      <div className="dec-proliferate-actions">
        <button
          type="button"
          className="dec-chip"
          data-proliferate-all
          onClick={() => {
            const all = proliferateAll(d);
            update((u) => ({ ...u, permanents: all.objects, players: all.players }));
          }}
        >
          Choose all
        </button>
        <button
          type="button"
          className="dec-chip"
          data-proliferate-none
          onClick={() => update((u) => ({ ...u, permanents: [], players: [] }))}
        >
          Choose none
        </button>
      </div>
      {d.legal.length === 0 ? null : (
        <>
          <h3 className="dec-group-title">Permanents with counters</h3>
          <ul className="dec-target-list" aria-label="Permanents with counters">
            {d.legal.map((id) => (
              <li key={id}>
                <button
                  type="button"
                  className="dec-chip"
                  aria-pressed={ui.permanents.includes(id)}
                  onClick={() =>
                    update((u) => ({ ...u, permanents: togglePermanent(u.permanents, d, id) }))
                  }
                  {...hoverProps(id)}
                >
                  {proliferateChipLabel(
                    labels.get(id) ?? nameOf(index, id),
                    index.get(id)?.counters ?? {},
                    index.get(id)?.controller === view.viewer ? 'yours' : "opponent's",
                  )}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {players.length === 0 ? null : (
        <>
          <h3 className="dec-group-title">Players with poison counters</h3>
          <ul className="dec-target-list" aria-label="Players with poison counters">
            {players.map((seat) => (
              <li key={`p${seat}`}>
                <button
                  type="button"
                  className="dec-chip"
                  aria-pressed={ui.players.includes(seat)}
                  onClick={() =>
                    update((u) => ({ ...u, players: togglePlayer(u.players, d, seat) }))
                  }
                >
                  {poisonChipLabel(seat, view.viewer, view.seats[seat]?.poison ?? 0)}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="dec-sub" data-proliferate-count>
        {`${ui.permanents.length} of ${d.legal.length} permanents and ${ui.players.length} of ${players.length} players chosen`}
      </p>
      <p className="dec-sub">{model.bar.detail}</p>
      <BarButtons buttons={model.bar.buttons} />
    </Dialog>
  );
}
