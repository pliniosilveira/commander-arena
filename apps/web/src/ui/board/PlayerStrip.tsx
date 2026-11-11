/** A player's strip: life, poison, zone counts and the command zone with tax and damage taken. */
import type { GameView, ObjectView, SeatView } from '@commander-arena/engine';
import { restrictionWords, riderWords } from '../../game/angels-text';
import { useDraggable, useDropZone } from '../dnd/DragProvider';
import { useInteraction } from '../interaction';
import { ManaSymbol } from '../mana';
import { areaClass } from './active-area';
import { CostDisplay } from './CardFace';
import { HandBacks } from './Hand';
import { useHoverPreview } from './hover';
import { bandBackground, commanderDamageTaken, commanderTaxes, seatLabel } from './resolve';

export type ZoneRef =
  | { readonly kind: 'graveyard'; readonly seat: number }
  | { readonly kind: 'command'; readonly seat: number }
  | { readonly kind: 'exile' }
  | { readonly kind: 'phased' };

/** Poison counters (CR 122.1) and the rule that ends the game on them (CR 704.5c). */
export const POISON_TITLE =
  'Poison counters. A player with ten or more poison counters loses the game (CR 704.5c).';

/** Energy counters (CR 107.14, 122.1): paid as {E}; a player keeps them for the rest of the game. */
export const ENERGY_TITLE =
  'Energy counters. {E} is paid by removing one energy counter from yourself; you keep them for the rest of the game (CR 107.14).';

/** The monarch designation (CR 725.2): what it does, for the chip's tooltip. */
export const MONARCH_TITLE =
  'The monarch. Draws a card at the beginning of their own end step. A creature that deals combat damage to the monarch makes its controller the monarch (CR 725.2).';

/** The city's blessing (CR 702.131c, D-ASCEND): a designation with no effect of its own; what reads it, for the chip's tooltip. */
export const BLESSING_TITLE =
  'The city’s blessing. Ascend gave it for the rest of the game; it does nothing by itself, other abilities ask whether a player has it (CR 702.131).';

/**
 * The Ring (CR 701.54c, D-196): how many times it has tempted a player, and the abilities of their emblem that are on at that level, for the chip's
 * tooltip. The four lines are the rule's own words; the ones not on yet say from how many temptations they are.
 */
export function ringTitle(tempted: number): string {
  const line = (from: number, text: string) =>
    `${tempted >= from ? '[on]' : `[from ${from}]`} ${text}`;
  return [
    `The Ring has tempted this player ${tempted} ${tempted === 1 ? 'time' : 'times'}.`,
    line(1, "Their Ring-bearer is legendary and can't be blocked by creatures with greater power."),
    line(2, 'Whenever their Ring-bearer attacks, they draw a card, then discard a card.'),
    line(
      3,
      "Whenever their Ring-bearer becomes blocked by a creature, the blocking creature's controller sacrifices it at end of combat.",
    ),
    line(
      4,
      'Whenever their Ring-bearer deals combat damage to a player, each opponent loses 3 life.',
    ),
  ].join('\n');
}

/** Commander damage that loses the game from a single commander (CR 704.6c, 903.10a). */
export const COMMANDER_DAMAGE_LOSS = 21;

/** The tooltip of a commander damage chip: whose commander, how much, and the rule. */
export function commanderDamageTitle(who: string, source: string | null, amount: number): string {
  const from = source === null ? 'a commander' : source;
  return `${who} ${who === 'You' ? 'have' : 'has'} taken ${amount} combat damage from ${from}. ${COMMANDER_DAMAGE_LOSS} from one commander loses the game (CR 704.6c).`;
}

const POOL_ORDER = ['W', 'U', 'B', 'R', 'G', 'C'] as const;

/** The tooltip of marked mana: what it may be spent on, and what it does when it is (CR 106.6, D-149, D-151). */
function poolTitle(m: SeatView['manaPool'][number]): string | undefined {
  const parts = [
    ...(m.restriction === null ? [] : [restrictionWords(m.restriction)]),
    ...(m.rider === undefined ? [] : [riderWords(m.rider)]),
  ];
  return parts.length === 0 ? undefined : parts.join('. ');
}

/**
 * The mana a player has now, as symbols in the order W, U, B, R, G, C; nothing when the pool is empty. Mana with a restriction on how
 * it may be spent (CR 106.6, D-149: "Spend this mana only to cast an Angel spell") is drawn after the free mana, outlined, with
 * what it can pay for in its tooltip: the pool is public, so the restriction is always shown.
 */
export function ManaPool({ pool }: { pool: SeatView['manaPool'] }) {
  if (pool.length === 0) return null;
  // D-151 (CR 106.6): mana that carries a rider ("If that mana is spent on a Dragon creature spell, it gains haste") is outlined too.
  const marked = (m: SeatView['manaPool'][number]) =>
    m.restriction !== null || m.rider !== undefined;
  const free = pool.filter((m) => !marked(m));
  const restricted = pool.filter(marked);
  const symbolsOf = (list: SeatView['manaPool']) =>
    POOL_ORDER.flatMap((color) => list.filter((m) => m.color === color).map(() => color));
  const symbols = [...symbolsOf(free), ...symbolsOf(restricted)];
  return (
    <span
      className="board-count-item board-pool"
      title="Mana pool"
      data-pool={symbols.join('')}
      {...(restricted.length === 0
        ? {}
        : { 'data-pool-restricted': symbolsOf(restricted).join('') })}
    >
      <span className="board-stat-label">Pool</span>
      <span className="board-pool-symbols">
        {symbolsOf(free).map((color, i) => (
          // The same color can repeat ({R}{R}), so the position is the only stable key.
          // biome-ignore lint/suspicious/noArrayIndexKey: positional list of symbols
          <ManaSymbol key={i} symbol={color} />
        ))}
        {restricted.map((m, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: positional list of symbols
            key={`r${i}`}
            className="board-pool-restricted"
            title={poolTitle(m)}
          >
            <ManaSymbol symbol={m.color} />
          </span>
        ))}
      </span>
    </span>
  );
}

function CommanderChip({ object }: { object: ObjectView }) {
  const hover = useHoverPreview(object.id);
  const ix = useInteraction();
  const drag = useDraggable(object.id, 'card', object.name);
  const clickable = ix.clickable.has(object.id);
  const selected = ix.selected.has(object.id);
  const badge = ix.badge(object.id);
  return (
    <button
      type="button"
      className={`board-cmdr${clickable ? ' is-clickable' : ''}${selected ? ' is-selected' : ''}${
        drag.dragging ? ' is-dragging' : ''
      }`}
      draggable={drag.draggable}
      onDragStart={drag.onDragStart}
      onDragEnd={drag.onDragEnd}
      data-object-id={object.id}
      aria-label={`Commander ${object.name}${clickable ? ', can be cast' : ''}`}
      aria-pressed={selected}
      title={object.name}
      onClick={() => {
        if (clickable) ix.onObject(object.id);
      }}
      {...hover}
    >
      <span className="board-cmdr-band" style={{ background: bandBackground(object.colors) }} />
      <span className="board-cmdr-name">{object.name}</span>
      <CostDisplay object={object} />
      {badge !== null && <span className="board-ibadge">{badge}</span>}
    </button>
  );
}

/**
 * The top card of the viewer's library, shown beside the library count while a permanent lets them look at
 * it (CR 401.5, D-125). `SeatView.libraryTop` exists only in the viewer's own view, so the opponent's
 * strip never gets one. Hover shows the card in the preview panel like any other.
 */
function LibraryTop({ object }: { object: ObjectView }) {
  const hover = useHoverPreview(object.id);
  const ix = useInteraction();
  // D-151 (CR 601.3): a permission to cast the top card of the library makes it clickable, like a card of the hand.
  const clickable = ix.clickable.has(object.id);
  const badge = ix.badge(object.id);
  return (
    <button
      type="button"
      className={`board-cmdr board-top-card${clickable ? ' is-clickable' : ''}`}
      data-library-top={object.id}
      data-object-id={object.id}
      aria-label={`Top card of your library: ${object.name}${clickable ? ', can be cast' : ''}`}
      title={`Top card of your library: ${object.name}`}
      onClick={() => {
        if (clickable) ix.onObject(object.id);
      }}
      {...hover}
    >
      <span className="board-cmdr-band" style={{ background: bandBackground(object.colors) }} />
      <span className="board-cmdr-name">{object.name}</span>
      <CostDisplay object={object} />
      {badge !== null && <span className="board-ibadge">{badge}</span>}
    </button>
  );
}

function CommandBox({
  view,
  seat,
  onOpenZone,
}: {
  view: GameView;
  seat: SeatView;
  onOpenZone: (zone: ZoneRef) => void;
}) {
  const taxes = commanderTaxes(seat);
  const damage = commanderDamageTaken(view, seat.id);
  // The emblems of the command zone are small cards of their own beside the battlefield (D-243).
  const commanders = seat.command.filter((o) => o.emblem !== true);
  return (
    <div className="board-command" data-zone="command" data-seat-zone={seat.id}>
      <button
        type="button"
        className="board-zone-btn"
        onClick={() => onOpenZone({ kind: 'command', seat: seat.id })}
        aria-label={`Open ${seatLabel(view, seat.id)} command zone`}
      >
        <span className="board-stat-label">Command</span>
      </button>
      <span className="board-cmdr-list">
        {commanders.length === 0 ? (
          <span className="board-dim">empty</span>
        ) : (
          commanders.map((o) => <CommanderChip key={o.id} object={o} />)
        )}
      </span>
      <span className="board-cmdr-facts">
        <span className={taxes.some((t) => t > 0) ? '' : 'board-dim'} title="Commander tax">
          Tax {taxes.length === 0 ? 0 : taxes.map((t) => `+${t}`).join(' ')}
        </span>
        <span
          className={damage.some((d) => d.amount > 0) ? 'board-warn' : 'board-dim'}
          title="Commander damage taken; 21 from one commander loses the game"
        >
          Cmdr dmg{' '}
          {damage.length === 0
            ? 0
            : damage
                .map((d) => (d.source === null ? `${d.amount}` : `${d.source} ${d.amount}`))
                .join(', ')}
        </span>
      </span>
    </div>
  );
}

export function PlayerStrip({
  view,
  seat,
  onOpenZone,
}: {
  view: GameView;
  seat: SeatView;
  onOpenZone: (zone: ZoneRef) => void;
}) {
  const ix = useInteraction();
  const zone = useDropZone({ kind: 'seat', seat: seat.id });
  const mine = seat.id === view.viewer;
  const clickable = ix.clickableSeats.has(seat.id);
  const selected = ix.selectedSeats.has(seat.id);
  const dimmed = ix.dimOthers && !clickable && !selected;
  const active = view.activeSeat === seat.id;
  const priority = view.prioritySeat === seat.id;
  const who = seatLabel(view, seat.id);
  // Commander damage taken sits with the life total, where it cannot be missed (issue 34).
  const taken = commanderDamageTaken(view, seat.id).filter((d) => d.amount > 0);
  const classes = [
    'board-strip',
    mine ? 'board-strip-me' : 'board-strip-opp',
    active ? 'is-active' : '',
    areaClass(view, seat.id),
    priority ? 'has-priority' : '',
    seat.hasLost ? 'has-lost' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classes} {...zone.props}>
      <button
        type="button"
        className={`board-life${clickable ? ' is-clickable' : ''}${selected ? ' is-selected' : ''}${
          dimmed ? ' is-dimmed' : ''
        }`}
        data-seat={seat.id}
        aria-label={`${who}, ${seat.life} life${seat.poison > 0 ? `, ${seat.poison} poison` : ''}${seat.energy !== undefined && seat.energy > 0 ? `, ${seat.energy} energy` : ''}${
          view.monarch === seat.id ? ', the monarch' : ''
        }${seat.citysBlessing === true ? ', has the city’s blessing' : ''}${seat.ringTempted === undefined ? '' : `, the Ring has tempted ${seat.ringTempted === 1 ? 'once' : `${seat.ringTempted} times`}`}${clickable ? ', can be chosen' : ''}`}
        aria-pressed={selected}
        tabIndex={clickable ? 0 : -1}
        onClick={() => {
          if (clickable) ix.onSeat(seat.id);
        }}
      >
        <span className="board-seat-name">{who}</span>
        <span className="board-life-total">{seat.life}</span>
        <span className="board-seat-flags">
          {seat.poison > 0 && (
            <span
              className="board-flag board-flag-poison"
              title={POISON_TITLE}
              data-poison={seat.poison}
            >
              {seat.poison} poison
            </span>
          )}
          {seat.energy !== undefined && seat.energy > 0 && (
            <span
              className="board-flag board-flag-energy"
              title={ENERGY_TITLE}
              data-energy={seat.energy}
            >
              {seat.energy} energy
            </span>
          )}
          {view.monarch === seat.id && (
            <span
              className="board-flag board-flag-monarch"
              title={MONARCH_TITLE}
              data-monarch={seat.id}
            >
              <span aria-hidden="true">{'♛ '}</span>Monarch
            </span>
          )}
          {seat.citysBlessing === true && (
            <span
              className="board-flag board-flag-blessing"
              title={BLESSING_TITLE}
              data-citys-blessing={seat.id}
            >
              <span aria-hidden="true">{'✦ '}</span>City&rsquo;s blessing
            </span>
          )}
          {seat.ringTempted !== undefined && (
            <span
              className="board-flag board-flag-ring"
              title={ringTitle(seat.ringTempted)}
              data-ring={seat.ringTempted}
            >
              <span aria-hidden="true">{'◎ '}</span>Ring {seat.ringTempted}
            </span>
          )}
          {taken.map((d, i) => (
            <span
              // One chip per commander that dealt damage; the order is the engine's.
              // biome-ignore lint/suspicious/noArrayIndexKey: positional list of chips
              key={i}
              className={`board-flag board-flag-cmdrdmg${d.amount >= COMMANDER_DAMAGE_LOSS - 5 ? ' is-near' : ''}`}
              title={commanderDamageTitle(who, d.source, d.amount)}
              data-cmdr-damage={d.amount}
            >
              Cmdr {d.amount}/{COMMANDER_DAMAGE_LOSS}
            </span>
          ))}
          {active && <span className="board-flag board-flag-turn">Turn</span>}
          {priority && <span className="board-flag board-flag-priority">Priority</span>}
          {seat.hasLost && <span className="board-flag board-flag-warn">Lost</span>}
        </span>
      </button>
      <div className="board-counts">
        <span className="board-count-item" title="Cards in hand">
          <span className="board-stat-label">Hand</span>
          <b>{seat.handCount}</b>
          {!mine && <HandBacks count={seat.handCount} />}
        </span>
        <span className="board-count-item" title="Cards in library">
          <span className="board-stat-label">Library</span>
          <b>{seat.libraryCount}</b>
          {seat.libraryTop !== undefined && mine && <LibraryTop object={seat.libraryTop} />}
        </span>
        {mine && seat.hand?.some((o) => o.keywords.includes('storm')) === true && (
          <span
            className="board-count-item"
            title="Spells cast this turn by both players, before the storm card you cast (CR 702.40a: Storm counts them)"
            data-spells-cast={seat.spellsCastThisTurn}
          >
            <span className="board-stat-label">Spells cast this turn</span>
            <b>{seat.spellsCastThisTurn}</b>
          </span>
        )}
        {seat.landPlaysAllowed > 1 && (
          <span
            className="board-count-item"
            title="Lands played this turn, and how many may be played"
            data-land-plays={`${seat.landsPlayedThisTurn}/${seat.landPlaysAllowed}`}
          >
            <span className="board-stat-label">Land plays</span>
            <b>
              {seat.landsPlayedThisTurn}/{seat.landPlaysAllowed}
            </b>
          </span>
        )}
        <button
          type="button"
          className="board-count-item board-zone-btn"
          onClick={() => onOpenZone({ kind: 'graveyard', seat: seat.id })}
          aria-label={`Open ${who} graveyard, ${seat.graveyard.length} cards`}
        >
          <span className="board-stat-label">Graveyard</span>
          <b>{seat.graveyard.length}</b>
        </button>
        <ManaPool pool={seat.manaPool} />
      </div>
      <CommandBox view={view} seat={seat} onOpenZone={onOpenZone} />
    </div>
  );
}
