/** The sections of the results view that deal with problems in the list (M4, SPEC 6). */
import type { DeckValidation, StoredCard } from '@commander-arena/cards';
import { useState } from 'react';
import type { FuzzyPending, ImportReport, NameProblem } from '../../import/types';
import { groupIssues, splitNameProblems, validationSummary } from './model';

export function ParseErrors({ errors }: { errors: ImportReport['parse']['errors'] }) {
  if (errors.length === 0) return null;
  return (
    <section className="imp-section" aria-labelledby="imp-parse-h">
      <h3 id="imp-parse-h">Lines that could not be read ({errors.length})</h3>
      <ul className="imp-list">
        {errors.map((e) => (
          <li key={`${e.line}:${e.text}`} className="imp-problem">
            <strong>Line {e.line}:</strong> {e.message}
            <code className="imp-code">{e.text}</code>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function NameProblems({ problems }: { problems: readonly NameProblem[] }) {
  const { notFound, failures } = splitNameProblems(problems);
  return (
    <>
      {notFound.length > 0 && (
        <section className="imp-section" aria-labelledby="imp-nf-h">
          <h3 id="imp-nf-h">Cards Scryfall could not find ({notFound.length})</h3>
          <p className="scr-help">
            Check the spelling on these lines. Cards that are not found are left out of the deck.
          </p>
          <ul className="imp-list">
            {notFound.map((p) => (
              <li key={`${p.line}:${p.name}`} className="imp-problem">
                <strong>{p.name}</strong>
                {p.count > 1 ? ` ×${p.count}` : ''}{' '}
                <span className="scr-help">(line {p.line})</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {failures.length > 0 && (
        <section className="imp-section" aria-labelledby="imp-fail-h">
          <h3 id="imp-fail-h">Cards that could not be looked up ({failures.length})</h3>
          <p className="scr-help">
            Scryfall could not be reached or answered with an error for these names. Try again.
          </p>
          <ul className="imp-list">
            {failures.map((p) => (
              <li key={`${p.line}:${p.name}`} className="imp-problem">
                <strong>{p.name}</strong> <span className="scr-help">(line {p.line})</span>:{' '}
                {p.reason}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

export function FuzzyMatches({
  pending,
  rejected,
  busy,
  onAccept,
  onReject,
}: {
  pending: readonly FuzzyPending[];
  rejected: readonly string[];
  busy: boolean;
  onAccept: (requested: string) => void;
  onReject: (requested: string) => void;
}) {
  if (pending.length === 0) return null;
  return (
    <section className="imp-section" aria-labelledby="imp-fuzzy-h">
      <h3 id="imp-fuzzy-h">Close matches to confirm ({pending.length})</h3>
      <p className="scr-help">
        Scryfall did not find these names exactly. Accept the closest card, or reject it and fix the
        name in your list.
      </p>
      <ul className="imp-list">
        {pending.map((f) => {
          const isRejected = rejected.includes(f.requested);
          return (
            <li key={f.requested} className="imp-fuzzy" data-rejected={isRejected}>
              <span>
                You wrote <strong>{f.requested}</strong>
                {f.count > 1 ? ` (×${f.count})` : ''}. Did you mean{' '}
                <strong>{f.candidate.name}</strong>?
              </span>
              {isRejected ? (
                <span className="imp-tag">
                  Rejected: fix the name in your list and import again
                </span>
              ) : (
                <span className="imp-row-actions">
                  <button
                    type="button"
                    className="scr-btn scr-btn-primary"
                    disabled={busy}
                    onClick={() => onAccept(f.requested)}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="scr-btn"
                    disabled={busy}
                    onClick={() => onReject(f.requested)}
                  >
                    Reject
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Radio-style list of eligible commanders; one or two may be ticked (partners are checked by validation). */
export function CommanderPicker({
  choices,
  busy,
  onChoose,
}: {
  choices: readonly StoredCard[];
  busy: boolean;
  onChoose: (names: readonly string[]) => void;
}) {
  const [picked, setPicked] = useState<readonly string[]>([]);
  if (choices.length === 0) return null;
  const toggle = (name: string) => {
    setPicked((prev) => {
      if (prev.includes(name)) return prev.filter((n) => n !== name);
      return prev.length >= 2 ? [prev[1] ?? name, name] : [...prev, name];
    });
  };
  return (
    <section className="imp-section" aria-labelledby="imp-cmd-h">
      <h3 id="imp-cmd-h">Choose your commander</h3>
      <p className="scr-help">
        Your list does not mark a commander. Pick one. Pick a second only if both have partner (or a
        similar ability): the deck check will say if the pair is not legal.
      </p>
      <fieldset className="imp-choices">
        <legend className="imp-sr">Eligible commanders</legend>
        {choices.map((card) => (
          <label key={card.oracleId} className="imp-choice">
            <input
              type="checkbox"
              checked={picked.includes(card.name)}
              onChange={() => toggle(card.name)}
            />
            <span>{card.name}</span>
            <span className="scr-help">{card.faces[0]?.typeLine ?? ''}</span>
          </label>
        ))}
      </fieldset>
      <button
        type="button"
        className="scr-btn scr-btn-primary"
        disabled={busy || picked.length === 0}
        onClick={() => onChoose(picked)}
      >
        Use {picked.length === 2 ? 'these commanders' : 'this commander'}
      </button>
    </section>
  );
}

export function ValidationPanel({ validation }: { validation: DeckValidation | null }) {
  if (validation === null) {
    return (
      <section className="imp-section" aria-labelledby="imp-val-h">
        <h3 id="imp-val-h">Deck check</h3>
        <p className="scr-help">
          The deck is checked once it has a commander. Choose or mark one to see the result.
        </p>
      </section>
    );
  }
  const groups = groupIssues(validation);
  return (
    <section className="imp-section" aria-labelledby="imp-val-h">
      <h3 id="imp-val-h">Deck check</h3>
      <p className="imp-state" data-ok={validation.ok}>
        {validationSummary(validation)}
      </p>
      {groups.map((g) => (
        <div key={g.severity} className="imp-issues" data-severity={g.severity}>
          <h4>
            {g.title} ({g.issues.length})
          </h4>
          <ul className="imp-list">
            {g.issues.map((issue) => (
              <li key={`${issue.code}:${issue.message}`}>
                <span className="imp-tag">{g.title.replace(/s$/, '')}</span> {issue.message}
                {issue.cards.length > 0 && (
                  <span className="scr-help"> Cards: {issue.cards.join(', ')}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

export function IgnoredLines({ ignored }: { ignored: ImportReport['ignored'] }) {
  if (ignored.length === 0) return null;
  return (
    <details className="imp-section imp-ignored">
      <summary>Ignored lines ({ignored.length}): sideboard, maybeboard and companion</summary>
      <ul className="imp-list">
        {ignored.map((l) => (
          <li key={`${l.section}:${l.name}`}>
            {l.count} {l.name} <span className="scr-help">({l.section})</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
