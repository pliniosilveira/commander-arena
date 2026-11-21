/**
 * The start screen (SPEC 10 "Screens", issue 53): two cards, "Play a game" and "My decks", the
 * seed and mulligan settings and a short how-to. Start game opens two dialogs in turn, your deck and
 * the opponent's deck; choosing the second starts the game. My Decks opens the page that lists
 * and imports decks.
 */
import { useMemo, useState } from 'react';
import { type ChallengeLevel, deckChoices, emblemsFor, startChallengeOptions } from '../../precons';
import { ThemeToggle } from '../panels/ThemeToggle';
import { useChallenges, usePrecons } from '../precons-context';
import { useActions } from '../store-context';
import { useDeckChoices } from '../use-deck-choices';
import { ChallengeDialog } from './ChallengeDialog';
import { DeckDialog } from './DeckDialog';
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
  const challenges = useChallenges();
  const { choices } = useDeckChoices();
  const [level, setLevel] = useState<ChallengeLevel>('easy');
  // Medium and Hard offer only the challenges that have emblems for them.
  const challengeChoices = useMemo(
    () =>
      deckChoices(challenges.list, [], []).filter(
        (choice) => level === 'easy' || emblemsFor(level, choice.id).length > 0,
      ),
    [challenges.list, level],
  );
  const [form, setForm] = useState<MenuForm>({
    ...defaultDecks(precons.list.map((p) => p.id)),
    seed: '',
    freeMulligan: true,
  });
  const [step, setStep] = useState<
    'home' | 'player' | 'opponent' | 'challenge-player' | 'challenge-pick'
  >('home');
  const [refused, setRefused] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const seedValid = parseSeed(form.seed).ok;
  const installed = precons.list.length > 0;

  // A precon that is not a valid, fully supported deck is refused with the reason (D-137).
  const choose = (id: string) => {
    if (step === 'player') {
      setForm({ ...form, humanDeck: id });
      setStep('opponent');
      return;
    }
    if (step === 'challenge-player') {
      setForm({ ...form, humanDeck: id });
      setStep('challenge-pick');
      return;
    }
    // The opponent's deck ends the flow: the game starts with the two decks chosen.
    const next = { ...form, aiDeck: id };
    setForm(next);
    setRefused(null);
    setStarting(true);
    void startFromForm(actions.startGame, { ...next, ai: 'normal' }, precons)
      .then((result) => {
        if (!result.started && result.kind === 'refused') setRefused(result.reason);
      })
      .finally(() => setStarting(false));
  };
  // The challenge ends the Challenges flow: the game starts against it.
  const chooseChallenge = (id: string) => {
    const parsed = parseSeed(form.seed);
    if (!parsed.ok) return;
    setRefused(null);
    setStarting(true);
    void startChallengeOptions(precons, challenges, {
      seed: parsed.seed ?? randomSeed(),
      humanDeck: form.humanDeck,
      challenge: id,
      level,
      freeMulligan: form.freeMulligan ?? true,
    })
      .then(async (result) => {
        if (result.ok) await actions.startGame({ ...result.options, intro: true });
        else setRefused(result.reason);
      })
      .finally(() => setStarting(false));
  };
  const closeFlow = () => {
    setRefused(null);
    setStep('home');
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

      <section className="scr-card" aria-labelledby="scr-play-h">
        <h2 id="scr-play-h">Play a game</h2>
        <p className="scr-help">Choose your deck and an opponent, then start a game.</p>
        <button
          type="button"
          className="scr-btn scr-btn-primary"
          disabled={!seedValid || !installed}
          onClick={() => setStep('player')}
        >
          Start game
        </button>
        {!installed && (
          <p className="scr-note scr-no-precon" role="note">
            No precon is installed yet. You can still import your own deck.
          </p>
        )}
      </section>

      <section className="scr-card" aria-labelledby="scr-decks-h">
        <h2 id="scr-decks-h">My decks</h2>
        <p className="scr-help">Manage your saved decks and import a new decklist.</p>
        <div className="scr-modal-group">
          <button
            type="button"
            className="scr-btn scr-btn-primary"
            onClick={() => actions.openImport('import')}
          >
            Import deck
          </button>
          <button
            type="button"
            className="scr-btn scr-btn-primary"
            onClick={() => actions.openImport('decks')}
          >
            My Decks
          </button>
        </div>
      </section>

      <section className="scr-card" aria-labelledby="scr-challenges-h">
        <h2 id="scr-challenges-h">Challenges</h2>
        <p className="scr-help">Pick your deck and face a prepared opponent.</p>
        <div className="scr-modal-group">
          <button
            type="button"
            className="scr-btn scr-btn-primary"
            disabled={!seedValid || !installed}
            onClick={() => {
              setLevel('easy');
              setStep('challenge-player');
            }}
          >
            Easy
          </button>
          <button
            type="button"
            className="scr-btn scr-btn-primary"
            disabled={!seedValid || !installed}
            onClick={() => {
              setLevel('medium');
              setStep('challenge-player');
            }}
          >
            Medium
          </button>
          <button
            type="button"
            className="scr-btn scr-btn-primary"
            disabled={!seedValid || !installed}
            onClick={() => {
              setLevel('hard');
              setStep('challenge-player');
            }}
          >
            Hard
          </button>
        </div>
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
      </div>

      <details className="scr-howto">
        <summary>How to play this build</summary>
        <ul>
          {HOW_TO_PLAY.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details>

      {step === 'challenge-pick' && (
        <ChallengeDialog
          challenges={challengeChoices}
          error={refused}
          busy={starting}
          onChoose={chooseChallenge}
          onBack={() => {
            setRefused(null);
            setStep('challenge-player');
          }}
          onCancel={closeFlow}
        />
      )}

      {step !== 'home' && step !== 'challenge-pick' && (
        <DeckDialog
          key={step}
          title={step === 'opponent' ? "Choose opponent's deck" : 'Choose your deck'}
          prompt={
            step !== 'opponent'
              ? "Select the deck you'll play in this game."
              : 'Select the deck your opponent will play.'
          }
          decks={choices}
          error={step === 'opponent' ? refused : null}
          busy={starting}
          onChoose={choose}
          {...(step === 'opponent' ? { onBack: () => setStep('player') } : {})}
          onCancel={closeFlow}
          onImport={() => actions.openImport('import')}
          initialTab={step === 'opponent' ? 'precon' : 'saved'}
        />
      )}
    </main>
  );
}
