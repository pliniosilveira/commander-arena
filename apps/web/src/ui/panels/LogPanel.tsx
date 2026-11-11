/** The game log (SPEC 10 "Information"): grouped by turn, filterable, auto-scrolling. */
import type { ObjectId } from '@commander-arena/engine';
import { type ReactNode, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { LogEntry } from '../../game/protocol';
import { type HoverHandlers, useHoverPreview } from '../board/hover';
import { useApp } from '../store-context';
import {
  DEFAULT_LOG_FILTER,
  filterLog,
  groupByTurn,
  groupHeading,
  type NameSegment,
  nameLinker,
  previewTarget,
} from './log-model';
import { objectIndex } from './objects';
import { Segmented } from './Segmented';
import './panels.css';

/** Within this many px of the bottom the log counts as "at the newest entry". */
const BOTTOM_SLACK = 24;

/** An entry that mentions an object still in view: hovering it previews that object. */
function LinkedEntry({ entry, showRule, target }: EntryProps & { target: ObjectId }) {
  const hover = useHoverPreview(target);
  return <EntryRow entry={entry} showRule={showRule} hover={hover} />;
}

interface EntryProps {
  entry: LogEntry;
  showRule: boolean;
}

/** A card name inside a log line: hovering it shows that card in the preview panel (issue 34). */
function NameLink({ id, text }: { id: ObjectId; text: string }) {
  const hover = useHoverPreview(id);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover only previews the card, the text is the same without it
    <span
      className="pnl-log-name"
      data-log-name={id}
      onMouseEnter={() => hover.onMouseEnter()}
      onMouseLeave={hover.onMouseLeave}
      onContextMenu={hover.onContextMenu}
    >
      {text}
    </span>
  );
}

/** An entry whose text names objects in view: each name is hoverable on its own. */
function NamedEntry({
  entry,
  showRule,
  segments,
}: EntryProps & { segments: readonly NameSegment[] }) {
  return (
    <EntryRow entry={entry} showRule={showRule}>
      {segments.map((seg, i) =>
        seg.kind === 'name' ? (
          // The pieces of one line never reorder; the position is the identity.
          // biome-ignore lint/suspicious/noArrayIndexKey: static pieces of one line
          <NameLink key={i} id={seg.id} text={seg.text} />
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: static pieces of one line
          <span key={i}>{seg.text}</span>
        ),
      )}
    </EntryRow>
  );
}

function EntryRow({
  entry,
  showRule,
  hover,
  children,
}: EntryProps & { hover?: HoverHandlers; children?: ReactNode }) {
  const side = entry.seat === null ? 'none' : entry.seat === 0 ? 'me' : 'opp';
  return (
    <li
      className={`pnl-log-entry pnl-log-${side}${entry.level === 'detail' ? ' pnl-log-detail' : ''}${hover === undefined ? '' : ' pnl-log-link'}`}
      onMouseEnter={hover?.onMouseEnter}
      onMouseLeave={hover?.onMouseLeave}
      onContextMenu={hover?.onContextMenu}
    >
      <span className="pnl-log-text">{children ?? entry.text}</span>
      {showRule && entry.rule !== null && <span className="pnl-log-rule">{entry.rule}</span>}
    </li>
  );
}

export function LogPanel() {
  const log = useApp((s) => s.log);
  const view = useApp((s) => s.snapshot?.view ?? null);
  const [filter, setFilter] = useState(DEFAULT_LOG_FILTER);
  const [showRule, setShowRule] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);

  const groups = useMemo(() => groupByTurn(filterLog(log, filter)), [log, filter]);
  const index = useMemo(() => (view === null ? new Map() : objectIndex(view)), [view]);
  const known = useMemo(() => new Set(index.keys()), [index]);
  const link = useMemo(() => nameLinker(index), [index]);

  const jump = useCallback(() => {
    const el = scroller.current;
    if (el !== null) el.scrollTop = el.scrollHeight;
    setAtBottom(true);
  }, []);

  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (el === null) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_SLACK);
  }, []);

  // Follow the newest entry unless the player scrolled up to read.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `groups` changing is the trigger
  useLayoutEffect(() => {
    if (!atBottom) return;
    const el = scroller.current;
    if (el !== null) el.scrollTop = el.scrollHeight;
  }, [groups, atBottom]);

  return (
    <section className="pnl-panel pnl-log" aria-label="Game log">
      <div className="pnl-log-bar">
        <h2 className="pnl-title">Log</h2>
        <Segmented
          legend="Log detail"
          value={filter.detail ? 'all' : 'major'}
          onChange={(v) => setFilter({ detail: v === 'all' })}
          options={[
            { value: 'major', label: 'Major' },
            { value: 'all', label: 'All' },
          ]}
        />
        <label className="pnl-check pnl-log-rules">
          <input
            type="checkbox"
            checked={showRule}
            onChange={(e) => setShowRule(e.target.checked)}
          />
          CR refs
        </label>
      </div>
      <div className="pnl-log-wrap">
        <div
          className="pnl-log-scroll"
          ref={scroller}
          onScroll={onScroll}
          role="log"
          aria-live="polite"
          aria-label="Game events"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be keyboard reachable
          tabIndex={0}
        >
          {groups.length === 0 && <p className="pnl-empty">Nothing has happened yet</p>}
          {groups.map((group) => (
            <div className="pnl-log-group" key={group.turn}>
              <h3 className="pnl-log-turn">{groupHeading(group, view?.viewer ?? 0)}</h3>
              <ul className="pnl-log-list">
                {group.entries.map((entry) => {
                  const segments = link(entry.text, entry.objects);
                  if (segments.some((seg) => seg.kind === 'name')) {
                    return (
                      <NamedEntry
                        key={entry.id}
                        entry={entry}
                        showRule={showRule}
                        segments={segments}
                      />
                    );
                  }
                  const target = previewTarget(entry, known);
                  return target === null ? (
                    <EntryRow key={entry.id} entry={entry} showRule={showRule} />
                  ) : (
                    <LinkedEntry key={entry.id} entry={entry} showRule={showRule} target={target} />
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        {!atBottom && (
          <button type="button" className="pnl-jump" onClick={jump}>
            Jump to latest
          </button>
        )}
      </div>
    </section>
  );
}
