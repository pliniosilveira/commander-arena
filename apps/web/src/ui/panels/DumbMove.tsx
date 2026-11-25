/**
 * "That was a dumb move" (issue 627): the player marks one move of the AI opponent, says in one optional line what it should have
 * done, and GitHub's "new issue" page opens with the report and the replay of the game filled in (`game/ai-report.ts`). Nothing is
 * sent by the app: the player submits on GitHub. The issue is prepared while the form is open, so the click opens the tab at once
 * (a browser blocks a tab a click opens only after waiting); a report too long for a link is copied to the clipboard first.
 */
import { AI_REPORT_COMMENT_MAX, type GameRecord } from '@commander-arena/cards';
import { useEffect, useId, useState } from 'react';
import { type DumbMoveIssue, dumbMoveIssue } from '../../game/ai-report';
import { VERSION_INFO } from '../../version';
import { copyText } from '../import/download';
import { useApp } from '../store-context';
import { type AiMove, moveLabel } from './dumb-move-model';

export interface DumbMoveFormProps {
  /** The AI moves the player may report, the latest first. */
  readonly moves: readonly AiMove[];
  /** The index (in the action log) of the move marked; the latest when it is not among `moves`. */
  readonly selected: number | null;
  readonly onSelect: (index: number) => void;
  readonly onClose: () => void;
  /** Test seam: the record instead of asking the game host. */
  readonly record?: GameRecord | null;
}

type RecordState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly record: GameRecord | null };

export function DumbMoveForm({ moves, selected, onSelect, onClose, record }: DumbMoveFormProps) {
  const id = useId();
  const gameRecord = useApp((s) => s.gameRecord);
  const [loaded, setLoaded] = useState<RecordState>(
    record === undefined ? { kind: 'loading' } : { kind: 'ready', record },
  );
  const [comment, setComment] = useState('');
  const [issue, setIssue] = useState<DumbMoveIssue | null>(null);
  const [message, setMessage] = useState('');
  const move = moves.find((m) => m.index === selected) ?? moves[0];

  useEffect(() => {
    if (record !== undefined) return;
    let live = true;
    void gameRecord().then((r) => {
      if (live) setLoaded({ kind: 'ready', record: r });
    });
    return () => {
      live = false;
    };
  }, [gameRecord, record]);

  useEffect(() => {
    setIssue(null);
    if (loaded.kind !== 'ready' || loaded.record === null || move === undefined) return;
    let live = true;
    void dumbMoveIssue({
      record: loaded.record,
      reported: move.index,
      summary: move.text,
      turn: move.turn,
      comment,
      version: VERSION_INFO,
    }).then(
      (ready) => {
        if (live) setIssue(ready);
      },
      () => {
        if (live) setMessage('The report could not be prepared in this browser.');
      },
    );
    return () => {
      live = false;
    };
  }, [loaded, move, comment]);

  const open = () => {
    if (issue === null) return;
    // The copy starts first and is not waited for: the new tab must open inside the click.
    const copied = issue.fitsInLink ? Promise.resolve(true) : copyText(issue.body);
    const tab = window.open(issue.url, '_blank');
    if (tab !== null) tab.opener = null;
    void copied.then((ok) => {
      if (tab === null) {
        setMessage('The browser blocked the new tab: allow pop-ups for this page and try again.');
      } else if (issue.fitsInLink) {
        setMessage('GitHub opened with the report filled in: check it and press Submit there.');
      } else {
        setMessage(
          ok
            ? 'The report is too long for a link: it was copied. Paste it into the issue that opened, then submit.'
            : 'The report is too long for a link and the clipboard is not available: press "Copy the report" and paste it into the issue.',
        );
      }
    });
  };

  const copy = () => {
    if (issue === null) return;
    void copyText(issue.body).then((ok) =>
      setMessage(ok ? 'The report was copied.' : 'The clipboard is not available here.'),
    );
  };

  const unavailable = loaded.kind === 'ready' && loaded.record === null;
  return (
    <form
      className="pnl-dumb"
      aria-label="Report a dumb move of the AI"
      data-testid="dumb-move-form"
      onSubmit={(e) => {
        e.preventDefault();
        open();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <label className="pnl-dumb-label" htmlFor={`${id}-move`}>
        Which move?
      </label>
      <select
        id={`${id}-move`}
        className="pnl-dumb-field"
        value={move?.index ?? ''}
        onChange={(e) => onSelect(Number(e.target.value))}
      >
        {moves.map((m) => (
          <option key={m.index} value={m.index}>
            {moveLabel(m)}
          </option>
        ))}
      </select>
      <label className="pnl-dumb-label" htmlFor={`${id}-comment`}>
        What should it have done? (optional)
      </label>
      <input
        id={`${id}-comment`}
        className="pnl-dumb-field"
        type="text"
        maxLength={AI_REPORT_COMMENT_MAX}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <p className="pnl-dumb-hint">
        {unavailable
          ? 'This game cannot be replayed elsewhere, so it cannot be reported.'
          : 'This opens a new issue on GitHub with a replay of this game (your deck and the moves so far); you press Submit there.'}
      </p>
      <div className="pnl-dumb-actions">
        {issue !== null && !issue.fitsInLink && (
          <button type="button" onClick={copy}>
            Copy the report
          </button>
        )}
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button
          type="submit"
          data-testid="dumb-move-open"
          data-url={issue?.url}
          disabled={issue === null}
        >
          Open GitHub issue
        </button>
      </div>
      <p className="pnl-dumb-hint" role="status">
        {message}
      </p>
    </form>
  );
}
