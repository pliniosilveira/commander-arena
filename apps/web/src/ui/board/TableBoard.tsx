/**
 * The board for three or more players (docs/MORE_OPPONENTS_INVESTIGATION.md, "Board plan"): the
 * opponents share the top row, you sit at the bottom left with your hand under your battlefield, and
 * the cell at the bottom right is the flow cell, which the next step fills with the turn box, the
 * stack and the decision dock. It composes the pieces of today's board (`Field`, `PlayerStrip`,
 * `Hand`) and does not change them; `Board.tsx` stays the 1v1 board.
 */
import { type CSSProperties, type ReactNode, useMemo, useState } from 'react';
import { useInteraction } from '../interaction';
import { useApp, useLookedCards } from '../store-context';
import './board.css';
import './table.css';
import { splitAttachments } from './attach';
import { Field, ROW_ORDER_ME, ROW_ORDER_OPP, zoneContents } from './Board';
import { exilePlayable } from './exile-play';
import { Hand } from './Hand';
import { OtherZonesStrip } from './OtherZonesStrip';
import { PlayerStrip, type ZoneRef } from './PlayerStrip';
import { PairFocusProvider } from './pair-focus';
import { combatRoles } from './resolve';
import { shownOpponents, tableAreas } from './table-areas';
import { opponentLabel } from './table-label';
import { ZoneViewer } from './ZoneViewer';

/** The cards of your hand are 15 percent smaller than on the 1v1 board: the table board needs the room. */
const HAND_CARD_SCALE = 0.85;

/** `flow` fills the flow cell at the bottom right: the turn box, the decision dock and the stack (`TableGame`). */
export function TableBoard({ flow }: { flow?: ReactNode }) {
  const view = useApp((s) => s.snapshot?.view ?? null);
  const [zone, setZone] = useState<ZoneRef | null>(null);
  const looked = useLookedCards();
  const ix = useInteraction();
  const roles = useMemo(
    () => (view === null ? new Map() : combatRoles(view, ix.pendingBlocks)),
    [view, ix.pendingBlocks],
  );
  const attachments = useMemo(() => splitAttachments(view?.battlefield ?? []), [view]);
  const exile = useMemo(
    () => (view === null ? null : exilePlayable(view, ix.clickable)),
    [view, ix.clickable],
  );
  if (view === null)
    return <section className="table-board table-empty">No game in progress.</section>;
  const me = view.seats.find((s) => s.id === view.viewer);
  // An opponent who lost is not drawn: the others share the room.
  const opponents = shownOpponents(view.seats.filter((s) => s.id !== view.viewer));
  if (me === undefined) return null;
  const areas = tableAreas(opponents.length);
  const cell = (key: string): CSSProperties => ({ gridArea: key });
  const open = zone === null ? null : zoneContents(view, zone, looked);
  return (
    <PairFocusProvider>
      <section
        className="table-board"
        aria-label="Battlefield"
        data-opponents={opponents.length}
        style={{ gridTemplateAreas: areas.gridTemplateAreas }}
      >
        {opponents.map((seat, i) => (
          <div
            key={seat.id}
            className="table-cell table-opp"
            style={cell(`opp${i + 1}`)}
            data-table-seat={seat.id}
          >
            <PlayerStrip
              view={view}
              seat={seat}
              onOpenZone={setZone}
              label={opponentLabel(view, seat.id)}
            />
            <Field
              view={view}
              seat={seat.id}
              order={ROW_ORDER_OPP}
              roles={roles}
              attachments={attachments}
            />
          </div>
        ))}
        <div className="table-cell table-me" style={cell('me')} data-table-seat={me.id}>
          <Field
            view={view}
            seat={me.id}
            order={ROW_ORDER_ME}
            roles={roles}
            attachments={attachments}
            exile={exile}
          />
          <PlayerStrip view={view} seat={me} onOpenZone={setZone} />
          <OtherZonesStrip view={view} {...(exile ? { exile } : {})} />
          <Hand
            cards={me.hand ?? []}
            active={view.activeSeat === me.id}
            cardScale={HAND_CARD_SCALE}
          />
        </div>
        <aside
          className="table-cell table-flow"
          style={cell('flow')}
          data-testid="table-flow"
          aria-label="Turn"
        >
          {flow}
        </aside>
        {open !== null && (
          <ZoneViewer
            title={open.title}
            objects={open.objects}
            {...(open.others === undefined ? {} : { others: open.others })}
            onClose={() => setZone(null)}
          />
        )}
      </section>
    </PairFocusProvider>
  );
}
