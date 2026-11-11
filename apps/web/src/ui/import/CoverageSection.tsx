/** The coverage report: headline numbers and a table of every resolved card (SPEC 7.1, 7.3). */
import { analyzeTemplates, formatTemplateReport } from '@commander-arena/cards';
import { useEffect, useState } from 'react';
import { type DeckIssue, deckIssue } from '../../import/deck-issue';
import type { ImportedEntry, ImportReport } from '../../import/types';
import { VERSION_INFO } from '../../version';
import { ManaCost } from '../mana';
import { copyText } from './download';
import {
  blockSplit,
  blockSplitLine,
  type CoverageFilter,
  costSymbols,
  coverageDetails,
  coverageHeadline,
  filterEntries,
  isSupported,
  supportLabel,
} from './model';

function Cost({ entry }: { entry: ImportedEntry }) {
  const faces = costSymbols(entry.card);
  return (
    <span className="imp-cost">
      {faces.map((symbols, i) => (
        // Faces are positional and never reorder.
        // biome-ignore lint/suspicious/noArrayIndexKey: positional list of faces
        <span key={i}>
          {i > 0 && ' // '}
          <ManaCost cost={symbols} />
        </span>
      ))}
    </span>
  );
}

/**
 * One click to ask for the deck's support: GitHub's new-issue page opens with the title and the whole
 * report filled in (the app has no token of its own, so the player presses Submit there). A report too
 * long for an address is copied to the clipboard first and the page opens asking to paste it.
 */
function IssueButton({ report }: { report: ImportReport }) {
  const [message, setMessage] = useState('');
  // The issue is prepared as the report shows (the card data is compressed, which takes a moment), so the click itself opens the tab at
  // once: a browser blocks a new tab that a click opens only after waiting.
  const [issue, setIssue] = useState<DeckIssue | null>(null);
  useEffect(() => {
    let live = true;
    setIssue(null);
    void deckIssue(report, VERSION_INFO).then((ready) => {
      if (live) setIssue(ready);
    });
    return () => {
      live = false;
    };
  }, [report]);
  const open = () => {
    if (issue === null) return;
    // The copy starts first and is not waited for: the new tab must open inside the click.
    const copied = issue.fitsInLink ? Promise.resolve(true) : copyText(issue.body);
    // Not the `noopener` feature, which makes `window.open` answer null whatever happens: a blocked tab could not be told from an open one.
    const tab = window.open(issue.url, '_blank');
    if (tab !== null) tab.opener = null;
    void copied.then((ok) => {
      if (tab === null) {
        setMessage('The browser blocked the new tab: allow pop-ups for this page and try again.');
      } else if (issue.fitsInLink) {
        setMessage('GitHub opened with the report filled in: check it and press Submit.');
      } else {
        setMessage(
          ok
            ? 'The report is too long for a link: it was copied. Paste it into the issue that opened.'
            : 'The report is too long for a link and the clipboard is not available: use "Copy template report" below and paste it with the decklist.',
        );
      }
    });
  };
  return (
    <div className="imp-report-issue">
      <button
        type="button"
        className="scr-btn"
        data-testid="report-issue"
        disabled={issue === null}
        onClick={open}
      >
        Ask for support on GitHub
      </button>
      <span className="scr-help" role="status">
        {message}
      </span>
    </div>
  );
}

/** What blocks this deck, grouped by sentence shape: the work order for the grammar (D-057). */
function TemplatePanel({ report }: { report: ImportReport }) {
  const [message, setMessage] = useState('');
  const analysis = analyzeTemplates(report.entries.map((e) => e.card));
  if (analysis.unsupportedCards === 0) return null;
  const text = formatTemplateReport(report.deckName, analysis);
  const splitLine = blockSplitLine(blockSplit(report.entries));
  return (
    <>
      <IssueButton report={report} />
      <details className="imp-templates" data-testid="template-panel">
        <summary>What blocks this deck? ({analysis.templates.length} ability shapes)</summary>
        <p className="scr-help">
          Many cards share the same sentence shape. The shapes that block the most cards are what
          the engine and the grammar learn first.
        </p>
        {splitLine !== null && (
          <p className="imp-split" data-testid="block-split">
            {splitLine}
          </p>
        )}
        <ol className="imp-list">
          {analysis.templates.slice(0, 12).map((row) => (
            <li key={row.template}>
              <strong>{row.cards.length}</strong> {row.cards.length === 1 ? 'card' : 'cards'}:{' '}
              <code>{row.template}</code>
            </li>
          ))}
        </ol>
        {analysis.reasons.length > 0 && (
          <ul className="imp-list">
            {analysis.reasons.map((row) => (
              <li key={row.reason}>
                <strong>{row.cards.length}</strong> {row.cards.length === 1 ? 'card' : 'cards'}:{' '}
                {row.reason}
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          className="scr-btn"
          onClick={() =>
            void copyText(text).then((ok) =>
              setMessage(ok ? 'Template report copied.' : 'The clipboard is not available here.'),
            )
          }
        >
          Copy template report
        </button>
        <span className="scr-help" role="status">
          {message}
        </span>
      </details>
    </>
  );
}

export function CoverageSection({
  report,
  onWhy,
}: {
  report: ImportReport;
  onWhy: (oracleId: string) => void;
}) {
  const [filter, setFilter] = useState<CoverageFilter>('all');
  const { coverage } = report;
  const rows = filterEntries(report.entries, filter);
  const unsupportedCount = coverage.unsupported.length;
  return (
    <section className="imp-section" aria-labelledby="imp-cov-h">
      <h3 id="imp-cov-h">Coverage report</h3>
      <p className="imp-headline" data-testid="coverage-headline">
        {coverageHeadline(coverage)}
      </p>
      <ul className="imp-list imp-details">
        {coverageDetails(coverage).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="scr-help">
        A deck that contains an unsupported card cannot be played yet. Replace the card to play the
        deck.
      </p>
      <div className="imp-toolbar">
        <fieldset className="imp-filter">
          <legend className="imp-sr">Show</legend>
          {(['all', 'unsupported'] as const).map((value) => (
            <label key={value}>
              <input
                type="radio"
                name="imp-filter"
                checked={filter === value}
                onChange={() => setFilter(value)}
              />
              {value === 'all' ? 'All cards' : `Unsupported only (${unsupportedCount})`}
            </label>
          ))}
        </fieldset>
      </div>
      <TemplatePanel report={report} />
      <div className="imp-table-wrap">
        <table className="imp-table">
          <caption className="imp-sr">Every resolved card with its support status</caption>
          <thead>
            <tr>
              <th scope="col">Card</th>
              <th scope="col">Status</th>
              <th scope="col" className="imp-num">
                Count
              </th>
              <th scope="col">Mana cost</th>
              <th scope="col">Support</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5}>No cards to show.</td>
              </tr>
            )}
            {rows.map((entry) => {
              const supported = isSupported(entry);
              const { stored } = entry.card;
              return (
                <tr key={stored.oracleId} data-status={supported ? 'supported' : 'unsupported'}>
                  <th scope="row">
                    {stored.name}
                    {entry.section === 'commander' && <span className="imp-tag">Commander</span>}
                  </th>
                  <td>
                    <span
                      className="imp-badge"
                      data-status={supported ? 'supported' : 'unsupported'}
                    >
                      {supportLabel(entry)}
                    </span>
                  </td>
                  <td className="imp-num">{entry.count}</td>
                  <td>
                    <Cost entry={entry} />
                  </td>
                  <td>
                    {!supported && (
                      <span className="imp-row-actions">
                        <button
                          type="button"
                          className="scr-btn"
                          onClick={() => onWhy(stored.oracleId)}
                        >
                          Why unsupported?
                          <span className="imp-sr"> for {stored.name}</span>
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
