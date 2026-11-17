/**
 * The start screen (SPEC 10 "Screens", issue 53): a home with two buttons, "Start game" and "Your
 * decks", and a short how-to. Start game opens a flow of two steps (your deck, then the opponent's
 * deck with the seed and the mulligan setting); Your decks opens the page that lists and imports decks.
 */
import { useState } from 'react';
import { ThemeToggle } from '../panels/ThemeToggle';
import { usePrecons } from '../precons-context';
import { useActions } from '../store-context';
import { useDeckChoices } from '../use-deck-choices';
import { DeckStep } from './DeckStep';
import { defaultDecks, type MenuForm, parseSeed, randomSeed, startFromForm } from './menu-model';
import './screens.css';

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
  const [step, setStep] = useState<'home' | 'player' | 'opponent'>('home');
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

  const header = (
    <header className="scr-menu-head">
      <h1>Commander Arena</h1>
      <p className="scr-tagline">
        An unofficial, free Magic: The Gathering Commander game: you against an AI, in your browser.
      </p>
    </header>
  );

  if (step === 'home') {
    return (
      <main className="scr-menu">
        {header}
        <div className="scr-home">
          <button
            type="button"
            className="scr-btn scr-btn-primary scr-start"
            onClick={() => setStep('player')}
          >
            Start game
          </button>
          <button type="button" className="scr-btn" onClick={() => actions.openImport('decks')}>
            Your decks
          </button>
          <ThemeToggle />
        </div>
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

  const opponentStep = step === 'opponent';
  return (
    <main className="scr-menu">
      {header}
      <section className="scr-flow" aria-labelledby="scr-flow-h">
        <h2 id="scr-flow-h">
          Step {opponentStep ? 2 : 1} of 2: {opponentStep ? "the opponent's deck" : 'your deck'}
        </h2>
        {installed ? (
          <p className="scr-help">
            A precon is checked and ready; its card data is part of the app, so it starts without a
            connection (card images load from Scryfall). Decks you saved need a connection, and a
            deck with a card the engine cannot run yet is refused with the reason.
          </p>
        ) : (
          <p className="scr-note scr-no-precon" role="note">
            No precon is installed yet. You can still import your own deck.
          </p>
        )}
        {opponentStep ? (
          <DeckStep
            legend="Opponent's deck"
            name="ai-deck"
            value={form.aiDeck}
            decks={choices}
            onChange={(aiDeck) => setForm({ ...form, aiDeck })}
            onImport={() => actions.openImport('import')}
          />
        ) : (
          <DeckStep
            legend="Your deck"
            name="human-deck"
            value={form.humanDeck}
            decks={choices}
            onChange={(humanDeck) => setForm({ ...form, humanDeck })}
            onImport={() => actions.openImport('import')}
          />
        )}
      </section>

      {opponentStep && (
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
        </div>
      )}

      {refused !== null && (
        <p className="scr-error" role="alert">
          {refused}
        </p>
      )}

      <div className="scr-flow-nav">
        <button
          type="button"
          className="scr-btn"
          onClick={() => {
            setRefused(null);
            setStep(opponentStep ? 'player' : 'home');
          }}
        >
          Back
        </button>
        {opponentStep ? (
          <button
            type="button"
            className="scr-btn scr-btn-primary scr-start"
            disabled={!seedValid || !installed || starting}
            onClick={start}
          >
            Start game
          </button>
        ) : (
          <button
            type="button"
            className="scr-btn scr-btn-primary"
            disabled={form.humanDeck === ''}
            onClick={() => setStep('opponent')}
          >
            Next
          </button>
        )}
      </div>
    </main>
  );
}
