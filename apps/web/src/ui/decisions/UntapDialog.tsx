import type { ChoosePermanentDecision, GameView } from '@commander-arena/engine';
import { BarButtons } from './BarButtons';
import { Dialog } from './Dialog';
import { useHoverProps } from './hover';
import { nameOf, objectIndex } from './lookup';
import type { DecisionModel } from './model';
import { permanentLabels } from './permanents';
import type { UiState } from './ui-state';
import { toggleUntap, UNTAP_HINT, UNTAP_PROMPT } from './untap';

/**
 * The checklist of the untap step (CR 502.3, D-125): the tapped permanents that may stay tapped, every one
 * checked so that they untap, with the choice made by unchecking. Hovering a name shows the card in the
 * preview panel. The answer is the checked permanents.
 */
export function UntapDialog({
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
  return (
    <Dialog label="Untap step" className="dec-small dec-untap">
      <h2 className="dec-title">{UNTAP_PROMPT}</h2>
      <p className="dec-sub">{UNTAP_HINT}</p>
      <ul className="dec-untap-list">
        {d.legal.map((id) => {
          const checked = ui.permanents.includes(id);
          return (
            <li key={id}>
              <label className="dec-untap-row" {...hoverProps(id)}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    update((u) => ({ ...u, permanents: toggleUntap(u.permanents, d, id) }))
                  }
                />
                <span>{labels.get(id) ?? nameOf(index, id)}</span>
                <small>{checked ? 'untaps' : 'stays tapped'}</small>
              </label>
            </li>
          );
        })}
      </ul>
      <p className="dec-sub">{model.bar.detail}</p>
      <BarButtons buttons={model.bar.buttons} />
    </Dialog>
  );
}
