/** The battlefield, both players' strips, the command zones and the human's hand (SPEC 10, A19). */
import type { GameView, ObjectView } from '@commander-arena/engine';
import { useMemo, useRef, useState } from 'react';
import type { LookedCard } from '../../game/looked-cards';
import { useDropZone } from '../dnd/DragProvider';
import { useInteraction } from '../interaction';
import { useApp, useLookedCards } from '../store-context';
import './board.css';
import { lookTakeRevealed, pickerCards } from '../decisions/cards-picker';
import { areaClass, battlefieldLabel } from './active-area';
import { type Attachments, splitAttachments } from './attach';
import { BackRow } from './BackRow';
import { BlockArrows } from './BlockArrows';
import { CommanderPopup } from './CommanderPopup';
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
import { questionTitle } from './target-zone';
import { useQuestionZone } from './useQuestionZone';
import { ZoneViewer } from './ZoneViewer';

/** The two lines of a battlefield: the creatures, and the back line (lands, then other permanents). */
export type FieldLine = 'creature' | 'back';
export const ROW_ORDER_ME: readonly FieldLine[] = ['creature', 'back'];
// Mirrored: the creatures of both players meet in the middle.
export const ROW_ORDER_OPP: readonly FieldLine[] = ['back', 'creature'];

export function Field({
  view,
  seat,
  order,
  roles,
  attachments,
  exile,
}: {
  view: GameView;
  seat: number;
  order: readonly FieldLine[];
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
        {order.map((line) =>
          line === 'creature' ? (
            <BattlefieldRow
              key={line}
              kind="creature"
              objects={byKind('creature')}
              roles={roles}
              attachments={attachments.byHost}
            />
          ) : (
            <BackRow
              key={line}
              lands={byKind('land')}
              others={byKind('other')}
              roles={roles}
              attachments={attachments.byHost}
            />
          ),
        )}
      </FieldRows>
      {/* The cards the viewer may play from exile, over the right side of their own battlefield, apart from the emblems at the left (issue 49). */}
      {seat === view.viewer && (
        <ExilePlayStrip view={view} {...(exile ? { playable: exile } : {})} />
      )}
    </section>
  );
}

export interface ZoneContents {
  readonly title: string;
  readonly objects: ObjectView[];
  /** Cards looked at that cannot be taken (shown beside the ones that can). */
  readonly others?: readonly LookedCard[];
  /** What the cards of `others` are marked with (default: "Cannot be taken"). */
  readonly othersMark?: string;
}

export function zoneContents(
  view: GameView,
  zone: ZoneRef,
  looked: readonly LookedCard[],
): ZoneContents {
  // The cards of a question: a library search (the matching cards the engine shows the searcher, the library itself is hidden) or the cards looked at or revealed from the top.
  if (zone.kind === 'cards') {
    const pending = view.pending;
    if (pending?.kind !== 'chooseCards') return { title: 'Cards', objects: [] };
    const objects = [...pickerCards(view, pending)];
    // D-216: the second pile of a split: the card already chosen for the hand is shown, marked, with the ones still to place.
    if (pending.purpose === 'lookSplit') {
      return {
        title: 'Cards looked at',
        objects,
        others: looked,
        othersMark: 'Already put into your hand',
      };
    }
    if (pending.purpose !== 'lookTake') return { title: questionTitle(pending), objects };
    return {
      title: lookTakeRevealed(pending) ? 'Cards revealed' : 'Cards looked at',
      objects,
      others: looked,
    };
  }
  if (zone.kind === 'exile') {
    // Exile is one shared zone in the engine; the board lists it per owner.
    return {
      title: `${seatLabel(view, zone.seat)} exile`,
      objects: view.exile.filter((o) => o.owner === zone.seat),
    };
  }
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
  // The seat whose commander popup is open.
  const [commanderSeat, setCommanderSeat] = useState<number | null>(null);
  const looked = useLookedCards();
  useQuestionZone(view, zone, setZone);
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
        <PlayerStrip
          view={view}
          seat={opponent}
          onOpenZone={setZone}
          onOpenCommander={setCommanderSeat}
        />
        <Field
          view={view}
          seat={opponent.id}
          order={ROW_ORDER_OPP}
          roles={roles}
          attachments={attachments}
        />
        {(view.phasedOut ?? []).length > 0 && (
          <div className="board-mid">
            <button
              type="button"
              className="board-zone-btn board-exile"
              onClick={() => setZone({ kind: 'phased' })}
              aria-label={`Open phased out, ${(view.phasedOut ?? []).length} permanents`}
            >
              <span className="board-stat-label">Phased out</span>{' '}
              <b>{(view.phasedOut ?? []).length}</b>
            </button>
          </div>
        )}
        <Field
          view={view}
          seat={me.id}
          order={ROW_ORDER_ME}
          roles={roles}
          attachments={attachments}
          exile={exile}
        />
        <PlayerStrip
          view={view}
          seat={me}
          onOpenZone={setZone}
          onOpenCommander={setCommanderSeat}
        />
        <OtherZonesStrip view={view} {...(exile ? { exile } : {})} />
        <Hand cards={me.hand ?? []} active={view.activeSeat === me.id} />
        {commanderSeat !== null && (
          <CommanderPopup
            view={view}
            seatId={commanderSeat}
            onClose={() => setCommanderSeat(null)}
          />
        )}
        <BlockArrows roles={roles} />
        {open !== null && (
          <ZoneViewer
            title={open.title}
            objects={open.objects}
            {...(open.others === undefined ? {} : { others: open.others })}
            {...(open.othersMark === undefined ? {} : { othersMark: open.othersMark })}
            onClose={() => setZone(null)}
          />
        )}
      </section>
    </PairFocusProvider>
  );
}
