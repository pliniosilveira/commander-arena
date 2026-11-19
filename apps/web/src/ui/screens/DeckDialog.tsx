/**
 * A step of the start-game flow (issue 53): a dialog that asks for one deck, for you or for the
 * opponent. Two tabs split the choices, "My decks" (decks saved in this browser) and "Precons"
 * (the shipped precons, edited ones included, D-215); "My decks" opens first; the opponent step opens on "Precons". Decks are listed alphabetically.
 * Tapping a deck, or one of the three Random buttons, chooses it and moves to the next step at once;
 * there is no separate Select button.
 */
import { useEffect, useId, useRef, useState } from 'react';
import type { DeckChoice } from '../../precons';
import { ManaCost } from '../mana';
import {
  COLOR_FILTERS,
  type ColorFilter,
  matchesColorFilter,
  pickRandomDeck,
  type RandomScope,
  toggleColorFilter,
} from './menu-model';

export type DeckTab = 'saved' | 'precon';

const TABS: readonly { readonly id: DeckTab; readonly label: string }[] = [
  { id: 'saved', label: 'My Decks' },
  { id: 'precon', label: 'Precons' },
];

const RANDOMS: readonly { readonly scope: RandomScope; readonly label: string }[] = [
  { scope: 'all', label: 'Random all' },
  { scope: 'precon', label: 'Random precon' },
  { scope: 'saved', label: 'Random mine' },
];

export function DeckDialog({
  title,
  prompt,
  decks,
  error,
  busy,
  onChoose,
  onBack,
  onCancel,
  onImport,
  initialTab,
}: {
  title: string;
  prompt: string;
  decks: readonly DeckChoice[];
  /** Why the last choice was refused, if it was. */
  error: string | null;
  /** True while the game is being prepared: the buttons are disabled. */
  busy: boolean;
  /** A tap on a deck or on a Random button: chooses that deck. */
  onChoose: (id: string) => void;
  /** Goes back one step; left out on the first step. */
  onBack?: () => void;
  onCancel: () => void;
  /** Opens the page that imports a deck. */
  onImport: () => void;
  /** The tab shown first; "My Decks" when left out. */
  initialTab?: DeckTab;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<DeckTab>(initialTab ?? 'saved');
  const [query, setQuery] = useState('');
  const [colorFilter, setColorFilter] = useState<readonly ColorFilter[]>([]);
  const needle = query.trim().toLowerCase();
  const inTab = decks
    .filter((deck) => deck.kind === tab)
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
  // The search matches the name, the commander and the blurb, ignoring case.
  const shown = inTab.filter(
    (deck) =>
      matchesColorFilter(deck.colors, colorFilter) &&
      (needle === '' ||
        `${deck.name} ${deck.commander} ${deck.blurb}`.toLowerCase().includes(needle)),
  );

  // A random button chooses a deck at once.
  const chooseRandom = (scope: RandomScope) => {
    const deck = pickRandomDeck(decks, scope);
    if (deck !== null) onChoose(deck.id);
  };

  // Focus moves into the dialog when it opens and back to the opener when it closes.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.focus();
    return () => opener?.focus();
  }, []);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a click on the backdrop closes the dialog; Esc is the keyboard way.
    <div
      className="scr-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      {/* The dialog takes focus itself; Esc closes it. */}
      <div
        ref={ref}
        className="scr-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel();
        }}
      >
        <h2 id={titleId}>{title}</h2>
        <p className="scr-help">{prompt}</p>
        <div className="scr-tabs" role="tablist" aria-label="Where the deck comes from">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className="scr-tab"
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="scr-deck-filters">
          <input
            type="search"
            className="scr-input scr-deck-search"
            placeholder="Search decks by name or commander"
            aria-label="Search decks"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <fieldset className="scr-color-filter" aria-label="Filter by colors">
            {COLOR_FILTERS.map((color) => (
              <button
                key={color}
                type="button"
                className="scr-color-btn"
                aria-pressed={colorFilter.includes(color)}
                aria-label={color === 'C' ? 'Colorless' : `${color} mana`}
                title={color === 'C' ? 'Colorless' : undefined}
                onClick={() => setColorFilter((prev) => toggleColorFilter(prev, color))}
              >
                <ManaCost cost={[color]} />
              </button>
            ))}
            {colorFilter.length > 0 && (
              <button type="button" className="scr-link" onClick={() => setColorFilter([])}>
                Clear
              </button>
            )}
          </fieldset>
        </div>
        <div role="tabpanel" className="scr-decks-list">
          {shown.length === 0 && inTab.length > 0 && (
            <p className="scr-note" role="note">
              {needle === '' ? 'No deck has these colors.' : `No deck matches "${query.trim()}".`}
            </p>
          )}
          {inTab.length === 0 && tab === 'saved' && (
            <p className="scr-note" role="note">
              No deck saved in this browser yet.{' '}
              <button type="button" className="scr-link" onClick={onImport}>
                Import a deck
              </button>
            </p>
          )}
          {inTab.length === 0 && tab === 'precon' && (
            <p className="scr-note" role="note">
              No precon is installed yet.
            </p>
          )}
          {shown.map((deck) => (
            <button
              type="button"
              className="scr-deck"
              key={deck.id}
              data-deck-id={deck.id}
              disabled={busy}
              onClick={() => onChoose(deck.id)}
            >
              {deck.commanderImage !== undefined && (
                <img
                  className="scr-deck-art"
                  src={deck.commanderImage}
                  alt=""
                  loading="lazy"
                  width={106}
                  height={77}
                />
              )}
              <span className="scr-deck-text">
                <span className="scr-deck-name">
                  {deck.name}
                  {deck.edited && <span className="scr-deck-tag">edited</span>}
                </span>
                <span className="scr-deck-blurb">{deck.blurb}</span>
                {(deck.set !== undefined || deck.year !== undefined) && (
                  <span className="scr-deck-set">
                    {[deck.set, deck.year].filter((part) => part !== undefined).join(' · ')}
                  </span>
                )}
                <span className="scr-deck-commander">
                  {deck.commander === '' ? 'No commander marked' : `Commander: ${deck.commander}`}
                </span>
              </span>
              {deck.colors !== undefined && (
                <span className="scr-deck-colors" data-testid="deck-colors">
                  <ManaCost cost={deck.colors.length === 0 ? ['C'] : deck.colors} />
                </span>
              )}
            </button>
          ))}
        </div>
        {error !== null && (
          <p className="scr-error" role="alert">
            {error}
          </p>
        )}
        <div className="scr-modal-nav">
          <div className="scr-modal-group">
            <button type="button" className="scr-btn" onClick={onCancel}>
              Cancel
            </button>
            {onBack !== undefined && (
              <button type="button" className="scr-btn" onClick={onBack}>
                Back
              </button>
            )}
          </div>
          <div className="scr-modal-group">
            {RANDOMS.map((r) => (
              <button
                key={r.scope}
                type="button"
                className="scr-btn scr-btn-primary"
                disabled={busy || pickRandomDeck(decks, r.scope, () => 0) === null}
                onClick={() => chooseRandom(r.scope)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
