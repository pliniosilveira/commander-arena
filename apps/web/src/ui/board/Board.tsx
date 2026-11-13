/** The battlefield, both players' strips, the command zones and the human's hand (SPEC 10, A19). */
import type { GameView, ObjectView } from '@commander-arena/engine';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useDropZone } from '../dnd/DragProvider';
import { useInteraction } from '../interaction';
import { useApp } from '../store-context';
import './board.css';
import { areaClass, battlefieldLabel } from './active-area';
import { type Attachments, splitAttachments } from './attach';
import { BlockArrows } from './BlockArrows';
import { combatOrder } from './combat-order';
import { EmblemStrip } from './Emblems';
import { Hand } from './Hand';
import { OtherZonesStrip } from './OtherZonesStrip';
import { PlayerStrip, type ZoneRef } from './PlayerStrip';
import { PairFocusProvider } from './pair-focus';
import { BattlefieldRow } from './Row';
import { combatRoles, type RowKind, rowKindOf, seatLabel } from './resolve';
import { targetZoneToOpen } from './target-zone';
import { useCloseOnDecision } from './useCloseOnDecision';
import { ZoneViewer } from './ZoneViewer';

const ROW_ORDER_ME: readonly RowKind[] = ['creature', 'other', 'land'];
// Mirrored: the creatures of both players meet in the middle.
const ROW_ORDER_OPP: readonly RowKind[] = ['land', 'other', 'creature'];

function Field({
  view,
  seat,
  order,
  roles,
  attachments,
}: {
  view: GameView;
  seat: number;
  order: readonly RowKind[];
  roles: ReturnType<typeof combatRoles>;
  attachments: Attachments;
}) {
  // An attachment is drawn under its host, which may belong to the other player (an Aura you
  // control on their creature), so it never gets a tile of its own here.
  const mine = useMemo(
    () => view.battlefield.filter((o) => o.controller === seat && !attachments.attached.has(o.id)),
    [view, seat, attachments],
  );
  // Only your own battlefield takes drops (play a card, take an attacker back).
  const zone = useDropZone({ kind: 'battlefield' });
  const byKind = (kind: RowKind): readonly ObjectView[] => {
    const row = mine.filter((o) => rowKindOf(o) === kind);
    // Blockers beside the attackers they block, once the blocks are declared (issue 19).
    return kind === 'creature' ? combatOrder(row, roles) : row;
  };
  return (
    <section
      className={`board-field ${seat === view.viewer ? 'board-field-me' : 'board-field-opp'} ${areaClass(view, seat)}`}
      data-field-seat={seat}
      data-active-area={view.activeSeat === seat}
      aria-label={battlefieldLabel(view, seat)}
      {...(seat === view.viewer ? zone.props : {})}
    >
      {/* The monarch, the Ring and the emblems of this player: a strip of small cards of their own (D-243). */}
      <EmblemStrip view={view} seat={seat} />
      <div className="board-field-rows">
        {order.map((kind) => (
          <BattlefieldRow
            key={kind}
            kind={kind}
            objects={byKind(kind)}
            roles={roles}
            attachments={attachments.byHost}
          />
        ))}
      </div>
    </section>
  );
}

function zoneContents(view: GameView, zone: ZoneRef): { title: string; objects: ObjectView[] } {
  if (zone.kind === 'exile') return { title: 'Exile (shared)', objects: [...view.exile] };
  // D-234 (CR 702.26): the permanents that are phased out: treated as though they do not exist, but listed here.
  if (zone.kind === 'phased') return { title: 'Phased out', objects: [...(view.phasedOut ?? [])] };
  const seat = view.seats.find((s) => s.id === zone.seat);
  const who = seatLabel(view, zone.seat);
  if (zone.kind === 'graveyard')
    return { title: `${who} graveyard`, objects: [...(seat?.graveyard ?? [])] };
  return { title: `${who} command zone`, objects: [...(seat?.command ?? [])] };
}

export function Board() {
  const view = useApp((s) => s.snapshot?.view ?? null);
  const [zone, setZone] = useState<ZoneRef | null>(null);
  useCloseOnDecision(view, () => setZone(null));
  // #23: a question whose legal targets are all in one graveyard opens it, and closing it again
  // when the question is answered is the board's doing too, not the player's chore.
  const toOpen = view === null ? null : targetZoneToOpen(view);
  const seatToOpen = toOpen?.kind === 'graveyard' ? toOpen.seat : null;
  const autoOpened = useRef(false);
  useEffect(() => {
    if (seatToOpen !== null) {
      setZone({ kind: 'graveyard', seat: seatToOpen });
      autoOpened.current = true;
    } else if (autoOpened.current) {
      setZone(null);
      autoOpened.current = false;
    }
  }, [seatToOpen]);
  const pendingBlocks = useInteraction().pendingBlocks;
  const roles = useMemo(
    () => (view === null ? new Map() : combatRoles(view, pendingBlocks)),
    [view, pendingBlocks],
  );
  const attachments = useMemo(() => splitAttachments(view?.battlefield ?? []), [view]);
  if (view === null) return <section className="board board-empty">No game in progress.</section>;

  // v1 is one opponent; the v2 layout (SPEC 10) will map over every other seat.
  const me = view.seats.find((s) => s.id === view.viewer);
  const opponent = view.seats.find((s) => s.id !== view.viewer);
  if (me === undefined || opponent === undefined) return null;
  const open = zone === null ? null : zoneContents(view, zone);

  return (
    <PairFocusProvider>
      <section className="board" aria-label="Battlefield">
        <PlayerStrip view={view} seat={opponent} onOpenZone={setZone} />
        <Field
          view={view}
          seat={opponent.id}
          order={ROW_ORDER_OPP}
          roles={roles}
          attachments={attachments}
        />
        <div className="board-mid">
          <button
            type="button"
            className="board-zone-btn board-exile"
            onClick={() => setZone({ kind: 'exile' })}
            aria-label={`Open exile, ${view.exile.length} cards`}
          >
            <span className="board-stat-label">Exile (shared)</span> <b>{view.exile.length}</b>
          </button>
          {(view.phasedOut ?? []).length > 0 && (
            <button
              type="button"
              className="board-zone-btn board-exile"
              onClick={() => setZone({ kind: 'phased' })}
              aria-label={`Open phased out, ${(view.phasedOut ?? []).length} permanents`}
            >
              <span className="board-stat-label">Phased out</span>{' '}
              <b>{(view.phasedOut ?? []).length}</b>
            </button>
          )}
        </div>
        <Field
          view={view}
          seat={me.id}
          order={ROW_ORDER_ME}
          roles={roles}
          attachments={attachments}
        />
        <PlayerStrip view={view} seat={me} onOpenZone={setZone} />
        <OtherZonesStrip view={view} />
        <Hand cards={me.hand ?? []} active={view.activeSeat === me.id} />
        <BlockArrows roles={roles} />
        {open !== null && (
          <ZoneViewer title={open.title} objects={open.objects} onClose={() => setZone(null)} />
        )}
      </section>
    </PairFocusProvider>
  );
}
