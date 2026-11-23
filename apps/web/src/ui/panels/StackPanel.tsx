/** The stack (SPEC 10 "Stack panel"): top item first, with arrows from each item to its targets. */
import type { ObjectId, ObjectView, SeatId } from '@commander-arena/engine';
import { useMemo } from 'react';
import { abilityTypeLine, activatedStackIds } from '../../game/activation';
import { stackLabel } from '../../game/saga';
import { CastBadges } from '../board/CardFace';
import { useHoverPreview } from '../board/hover';
import { withX } from '../decisions/cast-cost';
import { typeLine } from '../format';
import { ManaCost } from '../mana';
import { useApp } from '../store-context';
import { objectIndex, seatName } from './objects';
import { StackArrows } from './StackArrows';
import { stackWording } from './stack-wording';
import './panels.css';

const NO_ITEMS: readonly ObjectView[] = [];
const NO_OBJECTS: ReadonlyMap<ObjectId, ObjectView> = new Map();

function StackItem({
  item,
  top,
  viewer,
  seatCount,
  index,
  activated,
}: {
  item: ObjectView;
  top: boolean;
  viewer: SeatId;
  seatCount: number;
  activated: boolean;
  index: ReadonlyMap<ObjectId, ObjectView>;
}) {
  const hover = useHoverPreview(item.id);
  const mine = item.controller === viewer;
  // An ability is shown under its source's name, but it is not the card (CR 113.7a). Whether it
  // was activated or triggered comes from the log (game/activation.ts).
  // The monarch's abilities (CR 725.2) have no source and no card: worded from the kind, nothing to hover.
  const {
    inherent,
    triggered,
    when,
    gist,
    does,
    later,
    copies,
    monarchWords,
    sayX,
    modes,
    targets,
    shares,
  } = stackWording(item, index, viewer, activated, seatCount);
  const kind = triggered
    ? abilityTypeLine(activated)
    : item.types.length > 0
      ? typeLine(item)
      : 'Ability';
  return (
    <li
      className={`pnl-stack-item ${mine ? 'pnl-mine' : 'pnl-theirs'}${top ? ' pnl-top' : ''}${triggered ? ' pnl-triggered' : ''}`}
      data-object-id={item.id}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: focusing an item previews it for keyboard users
      tabIndex={0}
      {...(inherent ? {} : hover)}
    >
      <div className="pnl-stack-head">
        <span className="pnl-stack-name">{stackLabel(item)}</span>
        {triggered ? null : (
          <ManaCost
            cost={
              item.x === undefined || item.manaCost === null
                ? item.manaCost
                : withX(item.manaCost, item.x)
            }
          />
        )}
      </div>
      <div className="pnl-stack-meta">
        <span>
          {kind} <CastBadges object={item} />
        </span>
        <span className="pnl-stack-who">
          {top ? 'Top · ' : ''}
          {seatName(item.controller, viewer, seatCount)}
        </span>
      </div>
      {when === null ? null : (
        <div className="pnl-stack-when">
          {sayX(`${when}${gist === '' ? '' : `, ${gist.charAt(0).toLowerCase()}${gist.slice(1)}`}`)}
        </div>
      )}
      {does === null ? null : (
        <div
          className="pnl-stack-when"
          {...(later === null
            ? copies === null
              ? {}
              : { 'data-copy-wording': '' }
            : { 'data-later-wording': '' })}
        >
          {sayX(does)}
        </div>
      )}
      {monarchWords === null ? null : (
        <div className="pnl-stack-when" data-monarch-wording>
          {monarchWords}
        </div>
      )}
      {modes === null ? null : (
        <div className="pnl-stack-modes" data-stack-modes>
          {sayX(modes)}
        </div>
      )}
      {targets.length > 0 && (
        <div
          className="pnl-stack-targets"
          {...(shares === null ? {} : { 'data-stack-shares': '' })}
        >
          <span aria-hidden="true">{'→ '}</span>
          <span className="pnl-visually-hidden">Targets </span>
          {shares ?? targets.join(', ')}
        </div>
      )}
    </li>
  );
}

export function StackPanel() {
  const view = useApp((s) => s.snapshot?.view ?? null);
  const index = useMemo(() => (view === null ? NO_OBJECTS : objectIndex(view)), [view]);
  const log = useApp((s) => s.log);
  const activated = useMemo(() => activatedStackIds(log), [log]);
  const stack = view?.stack ?? NO_ITEMS;
  // The engine lists the stack bottom first; the panel shows the top item first.
  const shown = useMemo(() => [...stack].reverse(), [stack]);

  return (
    <section
      className={`pnl-panel pnl-stack${shown.length === 0 ? ' pnl-stack-empty' : ''}`}
      aria-label="Stack"
      data-drop="stack"
    >
      <h2 className="pnl-title">
        Stack
        {shown.length > 0 && <span className="pnl-count">{shown.length}</span>}
      </h2>
      {view === null || shown.length === 0 ? (
        <p className="pnl-empty">Stack is empty</p>
      ) : (
        <ol className="pnl-stack-list">
          {shown.map((item, i) => (
            <StackItem
              key={item.id}
              item={item}
              top={i === 0}
              viewer={view.viewer}
              seatCount={view.seats.length}
              index={index}
              activated={activated.has(item.id)}
            />
          ))}
        </ol>
      )}
      <StackArrows items={shown} />
    </section>
  );
}
