/** Game settings (A18): Full Control, manual mana, stops for every turn and for this turn only. */
import { useState } from 'react';
import { STOP_STEPS } from '../../policy/should-stop';
import { STEP_LABELS } from '../format';
import { useActions, useApp } from '../store-context';
import {
  type AnimationSpeed,
  setAnimationSpeed,
  setCombatAnimations,
  useAnimationSpeed,
  useCombatAnimations,
} from './animations';
import { Segmented } from './Segmented';
import { type SidePanelSide, setSidePanel, useSidePanel } from './side-panel';
import { ThemeToggle } from './ThemeToggle';
import { setTextSize, type TextSize, useTextSize } from './text-size';
import './panels.css';

const LEAVE_PROMPT = 'Leave this game and return to the menu? The game in progress is lost.';

/** Concede (CR 104.3a) behind a confirm step: the game is lost at once and cannot be taken back. */
export function ConcedeControl({
  onConcede,
  startConfirming = false,
}: {
  onConcede: () => void;
  startConfirming?: boolean;
}) {
  const [confirming, setConfirming] = useState(startConfirming);
  if (!confirming) {
    return (
      <button
        type="button"
        className="pnl-btn pnl-btn-danger"
        title="Give up this game. You lose and the game ends."
        onClick={() => setConfirming(true)}
      >
        Concede game
      </button>
    );
  }
  return (
    <fieldset className="pnl-confirm" aria-label="Confirm concede">
      <span className="pnl-confirm-text">Concede and lose this game?</span>
      <button
        type="button"
        className="pnl-btn pnl-btn-danger"
        onClick={() => {
          setConfirming(false);
          onConcede();
        }}
      >
        Yes, concede
      </button>
      <button type="button" className="pnl-btn" onClick={() => setConfirming(false)}>
        Keep playing
      </button>
    </fieldset>
  );
}

export function SettingsPanel({ startOpen = false }: { startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const settings = useApp((s) => s.settings);
  const manualPay = useApp((s) => s.manualPay);
  const textSize = useTextSize();
  const sidePanel = useSidePanel();
  const combatAnimations = useCombatAnimations();
  const animationSpeed = useAnimationSpeed();
  const turn = useApp((s) => s.snapshot?.view.turn ?? 0);
  const over = useApp((s) => s.snapshot?.view.result != null);
  const { setSettings, setManualPay, toggleStop, toggleThisTurn, backToMenu, act } = useActions();
  const once =
    settings.thisTurn !== null && settings.thisTurn.turn === turn ? settings.thisTurn : null;

  const leave = () => {
    if (window.confirm(LEAVE_PROMPT)) backToMenu();
  };

  return (
    <section className="pnl-panel pnl-settings" aria-label="Settings">
      <h2 className="pnl-title pnl-title-btn">
        <button
          type="button"
          className="pnl-collapse"
          aria-expanded={open}
          aria-controls="pnl-settings-body"
          onClick={() => setOpen(!open)}
        >
          <span aria-hidden="true">{open ? '▾' : '▸'}</span> Settings
          {!open && (
            <span className="pnl-summary">
              {settings.fullControl ? 'Full Control' : 'Auto-pass'}
              {manualPay ? ' · manual mana' : ''}
            </span>
          )}
        </button>
      </h2>
      {open && (
        <div className="pnl-settings-body" id="pnl-settings-body">
          <label className="pnl-check">
            <input
              type="checkbox"
              checked={settings.fullControl}
              onChange={(e) => setSettings({ fullControl: e.target.checked })}
            />
            Full Control
          </label>
          <label
            className="pnl-check"
            title="Stop when an opponent's spell or ability targets you or something you control, even if you cannot respond"
          >
            <input
              type="checkbox"
              checked={settings.stopWhenTargeted}
              onChange={(e) => setSettings({ stopWhenTargeted: e.target.checked })}
            />
            Stop when I am targeted
          </label>
          <label
            className="pnl-check"
            title="Stop when the opponent has a spell on the stack, so you can read it before it resolves, even if it targets nothing and you cannot respond"
          >
            <input
              type="checkbox"
              checked={settings.stopForOpponentSpells}
              onChange={(e) => setSettings({ stopForOpponentSpells: e.target.checked })}
            />
            Stop for opponent spells
          </label>
          <label className="pnl-check">
            <input
              type="checkbox"
              checked={manualPay}
              onChange={(e) => setManualPay(e.target.checked)}
            />
            Manual mana payment
          </label>
          <p className="pnl-note">
            The game passes for you unless a stop is set, you can respond, something is aimed at
            you, or the opponent cast a spell. Full Control stops at every priority. Pass Turn (P)
            passes your stops for the rest of your turn, but not Full Control, a question, what is
            aimed at you or an opponent's spell.
          </p>
          <table className="pnl-stops">
            <caption className="pnl-visually-hidden">Stops by step</caption>
            <thead>
              <tr>
                <th scope="col">Stop at</th>
                <th scope="col" title="Every one of your turns">
                  Mine
                </th>
                <th scope="col" title="Every opponent turn">
                  Opp.
                </th>
                <th scope="col" title="Only during the current turn">
                  Now
                </th>
              </tr>
            </thead>
            <tbody>
              {STOP_STEPS.map((step) => {
                const label = STEP_LABELS[step];
                return (
                  <tr key={step}>
                    <th scope="row">{label}</th>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Stop at ${label} on my turns`}
                        checked={settings.myTurnStops.includes(step)}
                        onChange={() => toggleStop('mine', step)}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Stop at ${label} on opponent turns`}
                        checked={settings.opponentTurnStops.includes(step)}
                        onChange={() => toggleStop('opponent', step)}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Stop at ${label} this turn only`}
                        checked={once?.steps.includes(step) ?? false}
                        onChange={() => toggleThisTurn(step)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <label
            className="pnl-check"
            title="Attackers lunge, a creature that is hit flashes and shakes with a number for the damage, and one that dies cracks and fades. Off when your system asks for reduced motion."
          >
            <input
              type="checkbox"
              checked={combatAnimations}
              onChange={(e) => setCombatAnimations(e.target.checked, true)}
            />
            Combat animations
          </label>
          <div className="pnl-row">
            <span className="pnl-row-label">Animation speed</span>
            <Segmented<AnimationSpeed>
              legend="Animation speed"
              value={animationSpeed}
              onChange={(speed) => setAnimationSpeed(speed, true)}
              options={[
                { value: 'fast', label: 'Fast' },
                { value: 'normal', label: 'Normal' },
                { value: 'slow', label: 'Slow' },
              ]}
            />
          </div>
          <div className="pnl-row">
            <span className="pnl-row-label">Theme</span>
            <ThemeToggle />
          </div>
          <div className="pnl-row">
            <span className="pnl-row-label">Text size</span>
            <Segmented<TextSize>
              legend="Text size"
              value={textSize}
              onChange={(size) => setTextSize(size, true)}
              options={[
                { value: 'normal', label: 'Normal' },
                { value: 'large', label: 'Large' },
              ]}
            />
          </div>
          <div className="pnl-row">
            <span className="pnl-row-label">Stack and controls</span>
            <Segmented<SidePanelSide>
              legend="Stack and controls side"
              value={sidePanel}
              onChange={(side) => setSidePanel(side, true)}
              options={[
                { value: 'left', label: 'Left' },
                { value: 'right', label: 'Right' },
              ]}
            />
          </div>
          <div className="pnl-row pnl-row-wrap">
            {over ? null : <ConcedeControl onConcede={() => void act({ kind: 'concede' })} />}
            <button type="button" className="pnl-btn pnl-btn-danger" onClick={leave}>
              Leave game
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
