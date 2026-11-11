/** The start screen (SPEC 10 "Screens"): real-precon picker, seed, settings, import entry points, a short how-to. */
import { useState } from 'react';
import type { DeckChoice } from '../../precons';
import { ThemeToggle } from '../panels/ThemeToggle';
import { usePrecons } from '../precons-context';
import { useActions } from '../store-context';
import { useDeckChoices } from '../use-deck-choices';
import { defaultDecks, type MenuForm, parseSeed, randomSeed, startFromForm } from './menu-model';
import './screens.css';

function DeckPicker({
  legend,
  name,
  value,
  decks,
  onChange,
}: {
  legend: string;
  name: string;
  value: string;
  decks: readonly DeckChoice[];
  onChange: (id: string) => void;
}) {
  const precons = decks.filter((deck) => deck.kind === 'precon');
  const saved = decks.filter((deck) => deck.kind === 'saved');
  const option = (deck: DeckChoice) => (
    <label className="scr-deck" key={deck.id} data-selected={value === deck.id}>
      <input
        type="radio"
        name={name}
        value={deck.id}
        checked={value === deck.id}
        onChange={() => onChange(deck.id)}
      />
      <span className="scr-deck-name">
        {deck.name}
        {deck.edited && <span className="scr-deck-tag">edited</span>}
      </span>
      <span className="scr-deck-blurb">{deck.blurb}</span>
      <span className="scr-deck-commander">
        {deck.commander === '' ? 'No commander marked' : `Commander: ${deck.commander}`}
      </span>
    </label>
  );
  return (
    <fieldset className="scr-decks">
      <legend>{legend}</legend>
      {precons.map(option)}
      {saved.length > 0 && <p className="scr-decks-group">Saved in this browser</p>}
      {saved.map(option)}
    </fieldset>
  );
}

export const HOW_TO_PLAY: readonly string[] = [
  'Click a card in your hand to play a land or cast a spell. The game pays for it automatically unless you turn on manual mana payment.',
  'Hover a card to read it in the panel on the left. Right-click pins it there; Esc unpins.',
  'Space passes priority or resolves what is on the stack. The game passes for you when you have nothing to do, except at the stops in Settings.',
  'Click a step in the bar at the top to add or remove a stop there. Full Control stops at every priority.',
  'Pass Turn (P) skips the rest of your turn: combat, the later steps and your second main phase. It stops for a question, or for an opponent spell aimed at you or that you can answer; Esc cancels it. Full Control still stops at every step.',
  'Attack and block by clicking creatures and then confirming. Only legal choices can be clicked.',
  'Arrows on the screen point from a spell on the stack to its targets.',
];

export function Menu() {
  const actions = useActions();
  const precons = usePrecons();
  const { choices } = useDeckChoices();
  const [form, setForm] = useState<MenuForm>({
    ...defaultDecks(precons.list.map((p) => p.id)),
    seed: '',
    freeMulligan: true,
  });
  const [refused, setRefused] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const seedValid = parseSeed(form.seed).ok;
  const installed = precons.list.length > 0;

  // A precon that is not a valid, fully supported deck is refused here with the reason (D-137).
  const start = () => {
    setRefused(null);
    setStarting(true);
    void startFromForm(actions.startGame, { ...form, ai: 'normal' }, precons)
      .then((result) => {
        if (!result.started && result.kind === 'refused') setRefused(result.reason);
      })
      .finally(() => setStarting(false));
  };

  return (
    <main className="scr-menu">
      <header className="scr-menu-head">
        <h1>Commander Arena</h1>
        <p className="scr-tagline">
          An unofficial, free Magic: The Gathering Commander game: you against an AI, in your
          browser.
        </p>
      </header>

      <section className="scr-quick" aria-labelledby="scr-quick-h">
        <h2 id="scr-quick-h">Quick start</h2>
        {installed ? (
          <>
            <p className="scr-help">
              A real precon, checked and ready. Its card data is part of the app, so it starts
              without a connection; card images load from Scryfall. Decks you saved can be picked
              for either seat too: they need a connection (their cards are read from Scryfall), and
              a deck with a card the engine cannot run yet is refused with the reason.
            </p>
            <div className="scr-pickers">
              <DeckPicker
                legend="Your deck"
                name="human-deck"
                value={form.humanDeck}
                decks={choices}
                onChange={(humanDeck) => setForm({ ...form, humanDeck })}
              />
              <DeckPicker
                legend="Opponent's deck"
                name="ai-deck"
                value={form.aiDeck}
                decks={choices}
                onChange={(aiDeck) => setForm({ ...form, aiDeck })}
              />
            </div>
          </>
        ) : (
          <p className="scr-note scr-no-precon" role="note">
            No precon is installed yet. You can still import your own deck below.
          </p>
        )}
      </section>

      <div className="scr-start-row">
        <div className="scr-seed">
          <label htmlFor="scr-seed-input">Seed</label>
          <input
            id="scr-seed-input"
            className="scr-input"
            inputMode="numeric"
            placeholder="random"
            value={form.seed}
            aria-invalid={!seedValid}
            aria-describedby="scr-seed-help"
            onChange={(e) => setForm({ ...form, seed: e.target.value })}
          />
          <button
            type="button"
            className="scr-btn"
            onClick={() => setForm({ ...form, seed: String(randomSeed()) })}
          >
            Roll seed
          </button>
          <span id="scr-seed-help" className={seedValid ? 'scr-help' : 'scr-help scr-error'}>
            {seedValid
              ? 'The same seed and decks replay the same shuffle.'
              : 'Use a whole number from 0 to 4294967295.'}
          </span>
        </div>
        <label className="scr-check">
          <input
            type="checkbox"
            checked={form.freeMulligan ?? true}
            onChange={(e) => setForm({ ...form, freeMulligan: e.target.checked })}
          />
          Free first mulligan
        </label>
        <ThemeToggle />
        <button
          type="button"
          className="scr-btn scr-btn-primary scr-start"
          disabled={!seedValid || !installed || starting}
          onClick={start}
        >
          Start game
        </button>
      </div>

      {refused !== null && (
        <p className="scr-error" role="alert">
          {refused}
        </p>
      )}

      <section className="scr-import" aria-labelledby="scr-import-h">
        <h2 id="scr-import-h">Your own deck</h2>
        <p className="scr-help">
          Paste a decklist and save it, then pick it above as your deck. Card data comes from
          Scryfall, so this needs a connection; the precon above works offline. A deck must follow
          the Commander rules and use only cards the engine fully supports.
        </p>
        <div className="scr-import-buttons">
          <button type="button" className="scr-btn" onClick={() => actions.openImport('import')}>
            Import a deck
          </button>
          <button type="button" className="scr-btn" onClick={() => actions.openImport('decks')}>
            Your decks
          </button>
        </div>
      </section>

      <details className="scr-howto">
        <summary>How to play this build</summary>
        <ul>
          {HOW_TO_PLAY.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details>
    </main>
  );
}
