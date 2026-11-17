/**
 * One step of the start-game flow (issue 53): choose a deck for one seat. Two tabs split the
 * choices: "Your decks" (decks saved in this browser) and "Precons" (the shipped precons, edited
 * ones included, D-215). The tab opens on the one that holds the current choice.
 */
import { useState } from 'react';
import type { DeckChoice } from '../../precons';

type DeckTab = 'saved' | 'precon';

const TABS: readonly { readonly id: DeckTab; readonly label: string }[] = [
  { id: 'saved', label: 'Your decks' },
  { id: 'precon', label: 'Precons' },
];

export function DeckStep({
  legend,
  name,
  value,
  decks,
  onChange,
  onImport,
}: {
  legend: string;
  name: string;
  value: string;
  decks: readonly DeckChoice[];
  onChange: (id: string) => void;
  /** Opens the decks page, to import a deck. */
  onImport: () => void;
}) {
  const current = decks.find((deck) => deck.id === value);
  const [tab, setTab] = useState<DeckTab>(current?.kind === 'saved' ? 'saved' : 'precon');
  const shown = decks.filter((deck) => deck.kind === tab);
  return (
    <fieldset className="scr-decks">
      <legend>{legend}</legend>
      <div className="scr-tabs" role="tablist" aria-label={`${legend}: where the deck comes from`}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`${name}-tab-${t.id}`}
            aria-selected={tab === t.id}
            className="scr-tab"
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-labelledby={`${name}-tab-${tab}`} className="scr-decks-list">
        {shown.length === 0 && tab === 'saved' && (
          <p className="scr-note" role="note">
            No deck saved in this browser yet.{' '}
            <button type="button" className="scr-link" onClick={onImport}>
              Import a deck
            </button>
          </p>
        )}
        {shown.length === 0 && tab === 'precon' && (
          <p className="scr-note" role="note">
            No precon is installed yet.
          </p>
        )}
        {shown.map((deck) => (
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
        ))}
      </div>
    </fieldset>
  );
}
