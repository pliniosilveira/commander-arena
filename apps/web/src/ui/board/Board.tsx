/** The battlefield, both players' strips, the command zones and the human's hand (SPEC 10, A19). */
import type { GameView, ObjectView } from '@commander-arena/engine';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { LookedCard } from '../../game/looked-cards';
import { useDropZone } from '../dnd/DragProvider';
import { useInteraction } from '../interaction';
import { useApp, useLookedCards } from '../store-context';
import './board.css';
import { lookTakeRevealed, pickerCards } from '../decisions/cards-picker';
import { useZoneGate } from '../decisions/zone-decision';
import { areaClass, battlefieldLabel } from './active-area';
import { type Attachments, splitAttachments } from './attach';
import { BlockArrows } from './BlockArrows';
import { combatOrder, keptOrder } from './combat-order';
import { EmblemStrip } from './EmblemStrip';
import { ExilePlayStrip } from './ExilePlayStrip';
import { type ExilePlayable, exilePlayable } from './exile-play';
import { FieldRows } from './FieldRows';
import { Hand } from './Hand';
import { OtherZonesStrip } from './OtherZonesStrip';
import { PlayerStrip, type ZoneRef } from './PlayerStrip';
import { PairFocusProvider } from './pair-focus';
import { BattlefieldRow } from './Row';
import { combatRoles, type RowKind, rowKindOf, seatLabel } from './resolve';
import { questionZoneToOpen, sameZone } from './target-zone';
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
  exile,
}: {
  view: GameView;
  seat: number;
  order: readonly RowKind[];
  roles: ReturnType<typeof combatRoles>;
  attachments: Attachments;
  exile?: ExilePlayable | null;
}) {
  // An attachment is drawn under its host, which may belong to the other player (an Aura you
  // control on their creature), so it never gets a tile of its own here.
  const mine = useMemo(
    () => view.battlefield.filter((o) => o.controller === seat && !attachments.attached.has(o.id)),
    [view, seat, attachments],
  );
  // The order the last declared blocks gave this player's creatures, by object id.
  const kept = useRef<readonly string[]>([]);
  // Only your own battlefield takes drops (play a card, take an attacker back).
  const zone = useDropZone({ kind: 'battlefield' });
  const byKind = (kind: RowKind): readonly ObjectView[] => {
    const row = mine.filter((o) => rowKindOf(o) === kind);
    if (kind !== 'creature') return row;
    // Blockers beside the attackers they block, once the blocks are declared (issue 19); after the
    // combat they stay where it put them.
    const before = keptOrder(row, kept.current);
    const ordered = combatOrder(before, roles);
    if (ordered !== before) kept.current = ordered.map((o) => o.id);
    return ordered;
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
      <FieldRows>
        {order.map((kind) => (
          <BattlefieldRow
            key={kind}
            kind={kind}
            objects={byKind(kind)}
            roles={roles}
            attachments={attachments.byHost}
          />
        ))}
      </FieldRows>
      {/* The cards the viewer may play from exile, over the right side of their own battlefield, apart from the emblems at the left (issue 49). */}
      {seat === view.viewer && (
        <ExilePlayStrip view={view} {...(exile ? { playable: exile } : {})} />
      )}
    </section>
  );
}

interface ZoneContents {
  readonly title: string;
  readonly objects: ObjectView[];
  /** Cards looked at that cannot be taken (shown beside the ones that can). */
  readonly others?: readonly LookedCard[];
}

function zoneContents(view: GameView, zone: ZoneRef, looked: readonly LookedCard[]): ZoneContents {
  // The cards of a question: a library search (the matching cards the engine shows the searcher, the library itself is hidden) or the cards looked at or revealed from the top.
  if (zone.kind === 'cards') {
    const pending = view.pending;
    if (pending?.kind !== 'chooseCards') return { title: 'Cards', objects: [] };
    const objects = [...pickerCards(view, pending)];
    if (pending.purpose !== 'lookTake') return { title: 'Search your library', objects };
    return {
      title: lookTakeRevealed(pending) ? 'Cards revealed' : 'Cards looked at',
      objects,
      others: looked,
    };
  }
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
  const looked = useLookedCards();
  useCloseOnDecision(view, () => setZone(null));
  // #23: a question whose legal targets are all in one graveyard opens it, and closing it again
  // when the question is answered is the board's doing too, not the player's chore.
  const toOpen = view === null ? null : (questionZoneToOpen(view)?.zone ?? null);
  // What the effects below depend on: the zone as a key, so a new view of the same question does not reopen it.
  const toOpenKey = toOpen === null ? null : `${toOpen.kind}${'seat' in toOpen ? toOpen.seat : ''}`;
  const toOpenRef = useRef(toOpen);
  toOpenRef.current = toOpen;
  const autoOpened = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `toOpenKey` is what tells a new question; the zone itself is read from the ref
  useEffect(() => {
    if (toOpenRef.current !== null) {
      setZone(toOpenRef.current);
      autoOpened.current = true;
    } else if (autoOpened.current) {
      setZone(null);
      autoOpened.current = false;
    }
  }, [toOpenKey]);
  // The picker of the question's graveyard can be closed to look at the board and opened again; the
  // decision layer holds Confirm back while it is closed (zone-decision.ts).
  const gate = useZoneGate();
  const questionOpen = toOpen !== null && zone !== null && sameZone(zone, toOpen);
  const { setOpen: reportOpen, request } = gate;
  useEffect(() => reportOpen(questionOpen), [questionOpen, reportOpen]);
  const lastRequest = useRef(request);
  useEffect(() => {
    if (request === lastRequest.current) return;
    lastRequest.current = request;
    if (toOpenRef.current !== null) setZone(toOpenRef.current);
  }, [request]);
  const ix = useInteraction();
  const pendingBlocks = ix.pendingBlocks;
  const roles = useMemo(
    () => (view === null ? new Map() : combatRoles(view, pendingBlocks)),
    [view, pendingBlocks],
  );
  const attachments = useMemo(() => splitAttachments(view?.battlefield ?? []), [view]);
  // The cards playable from exile, computed once for the strip over the battlefield and for the chip rows (issue 49).
  const exile = useMemo(
    () => (view === null ? null : exilePlayable(view, ix.clickable)),
    [view, ix.clickable],
  );
  if (view === null) return <section className="board board-empty">No game in progress.</section>;

  // v1 is one opponent; the v2 layout (SPEC 10) will map over every other seat.
  const me = view.seats.find((s) => s.id === view.viewer);
  const opponent = view.seats.find((s) => s.id !== view.viewer);
  if (me === undefined || opponent === undefined) return null;
  const open = zone === null ? null : zoneContents(view, zone, looked);

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
          exile={exile}
        />
        <PlayerStrip view={view} seat={me} onOpenZone={setZone} />
        <OtherZonesStrip view={view} {...(exile ? { exile } : {})} />
        <Hand cards={me.hand ?? []} active={view.activeSeat === me.id} />
        <BlockArrows roles={roles} />
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
