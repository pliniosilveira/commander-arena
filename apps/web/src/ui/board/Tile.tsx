/**
 * One permanent on the battlefield: an art-less frame with the colour band, name, power and
 * toughness, counters, keyword chips and the state marks of A19. It is the seam where an
 * `art_crop` image replaces the frame later. Tapped is a CSS rotation of the inner frame only;
 * ribbons stay upright on the slot so they remain readable.
 */
import type { ObjectView } from '@commander-arena/engine';
import type { CSSProperties } from 'react';
import { alternativeBadge } from '../../game/alt-cost';
import { chosenLabel } from '../../game/chosen';
import { faceDownBadgeTitle, isFaceDownPermanent } from '../../game/face-down-text';
import { loreBadge } from '../../game/saga';
import { isBackFaceUp, isMelded, meldedFrom } from '../decisions/layouts';
import { useDraggable, useDropZone } from '../dnd/DragProvider';
import { EVERY_CREATURE_TYPE, hasEveryCreatureType, kickedWords } from '../format';
import { useInteraction } from '../interaction';
import { useDefinedPt } from '../store-context';
import { Art, artOf } from './art';
import { FaceDownArt } from './face-down-art';
import { useHoverPreview } from './hover';
import { chipsOf, restrictionName } from './keywords';
import { usePairFocus } from './pair-focus';
import { markerLabel, pairClass, pairNumbers } from './pairing';
import {
  bandBackground,
  type CombatRole,
  cornerStat,
  counterChips,
  isCreatureView,
  isCrewedVehicle,
  PRINTED_TITLE,
  roleText,
} from './resolve';

export interface TileProps {
  readonly object: ObjectView;
  readonly w: number;
  readonly h: number;
  readonly role?: CombatRole | undefined;
  /** More than one identical token stands behind this tile (A19 grouping). */
  readonly count?: number;
  /** The group tile owns hover and click for its members; plain tiles leave this off. */
  readonly onActivate?: (() => void) | undefined;
}

/** The line of a token's generic frame: "Token", then its card types and subtypes (CR 111.1). */
export function tokenLine(o: Pick<ObjectView, 'types' | 'subtypes'>): string {
  const types = o.types.join(' ');
  return `Token ${types}${o.subtypes.length > 0 ? ` — ${o.subtypes.join(' ')}` : ''}`;
}

function ariaLabel(o: ObjectView, count: number, role: CombatRole | undefined): string {
  const parts = [count > 1 ? `${count} ${o.name} tokens` : o.name];
  if (o.power !== null && o.toughness !== null) parts.push(`${o.power}/${o.toughness}`);
  else if (o.printedPt !== undefined)
    parts.push(`${o.printedPt.power}/${o.printedPt.toughness} if crewed`);
  if (isCrewedVehicle(o)) parts.push('crewed');
  if (isBackFaceUp(o)) parts.push('back face');
  if (isMelded(o)) parts.push(`melded from ${meldedFrom(o)}`);
  if (o.pairedWith !== undefined) parts.push('paired with another creature');
  else if (o.pairedPhasedOut === true)
    parts.push('paired, on hold while one of the two is phased out');
  if (o.tapped) parts.push('tapped');
  const kicked = kickedWords(o);
  if (kicked !== null) parts.push(kicked);
  const alternative = alternativeBadge(o);
  if (alternative !== null) parts.push(alternative.text);
  if (hasEveryCreatureType(o)) parts.push(EVERY_CREATURE_TYPE.toLowerCase());
  for (const r of o.restrictions ?? []) parts.push(restrictionName(r).toLowerCase());
  const lore = loreBadge(o);
  if (lore !== null) parts.push(lore);
  const chosen = chosenLabel(o);
  if (chosen !== null) parts.push(chosen.title.toLowerCase());
  if (o.damage > 0) parts.push(`${o.damage} damage`);
  const shields = o.regenerationShields ?? 0;
  if (shields > 0)
    parts.push(shields > 1 ? `${shields} regeneration shields` : 'regeneration shield');
  if (role !== undefined) parts.push(roleText(role));
  return parts.join(', ');
}

export function Tile({ object: o, w, h, role, count = 1, onActivate }: TileProps) {
  const hover = useHoverPreview(o.id);
  const pairing = usePairFocus();
  const numbers = pairNumbers(role);
  const firstPair = numbers[0];
  const paired = role !== undefined && (role.kind === 'blocker' || role.blocked);
  const pairHot = numbers.some((n) => pairing.focus.has(n));
  const ix = useInteraction();
  const drag = useDraggable(o.id, 'permanent', o.name);
  const zone = useDropZone({ kind: 'object', id: o.id });
  // A stack of identical tokens is one button for several objects: it is not carried.
  const draggable = drag.draggable && count === 1;
  const clickable = ix.clickable.has(o.id);
  const selected = ix.selected.has(o.id);
  const dimmed = ix.dimOthers && !clickable && !selected;
  const badge = ix.badge(o.id);
  const defined = useDefinedPt(o.id);
  const stat = cornerStat(o, defined);
  const art = artOf(o);
  const counters = counterChips(o);
  const chips = chipsOf(o);
  const lore = loreBadge(o);
  const alternative = alternativeBadge(o);
  const chosen = chosenLabel(o);
  const rotatedMargin = o.tapped ? Math.max(0, (h - w) / 2) : 0;
  const style = {
    '--w': `${w}px`,
    '--h': `${h}px`,
    // The generic token frame (SPEC 6.2): a token has no card image, so its colours tint the frame.
    ...(o.isToken ? { '--token-tint': bandBackground(o.colors) } : {}),
    marginInline: `${rotatedMargin}px`,
  } as CSSProperties;
  const classes = [
    'board-tile',
    o.tapped ? 'is-tapped' : '',
    clickable ? 'is-clickable' : '',
    selected ? 'is-selected' : '',
    dimmed ? 'is-dimmed' : '',
    role?.kind === 'attacker' ? 'is-attacking' : '',
    role?.kind === 'blocker' ? 'is-blocking' : '',
    paired && firstPair !== undefined ? `has-pair ${pairClass(firstPair)}` : '',
    pairHot ? 'is-pair-hot' : '',
    numbers.length > 0 ? 'has-marker' : '',
    o.damage > 0 ? 'is-damaged' : '',
    drag.dragging ? 'is-dragging' : '',
    o.support === 'unsupported' ? 'is-unsupported' : '',
    o.isToken ? 'is-token' : '',
    count > 1 ? 'is-group' : '',
    h < 64 ? 'is-compact' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type="button"
      className={classes}
      style={style}
      data-object-id={o.id}
      aria-label={ariaLabel(o, count, role)}
      aria-pressed={selected}
      tabIndex={clickable || onActivate !== undefined ? 0 : -1}
      title={role === undefined ? o.name : `${o.name}. ${roleText(role)}`}
      data-pairs={numbers.length > 0 ? numbers.join(',') : undefined}
      draggable={draggable}
      onDragStart={drag.onDragStart}
      onDragEnd={drag.onDragEnd}
      {...zone.props}
      onClick={() => {
        if (onActivate !== undefined) onActivate();
        else if (clickable) ix.onObject(o.id);
      }}
      {...hover}
      onMouseEnter={(e) => {
        hover.onMouseEnter(e);
        pairing.setFocus(numbers);
      }}
      onMouseLeave={() => {
        hover.onMouseLeave();
        pairing.setFocus([]);
      }}
      onFocus={() => {
        hover.onFocus();
        pairing.setFocus(numbers);
      }}
      onBlur={() => {
        hover.onBlur();
        pairing.setFocus([]);
      }}
    >
      {count > 1 && <span className="board-tile-stack" aria-hidden="true" />}
      <span className="board-tile-inner">
        <span className="board-tile-band" style={{ background: bandBackground(o.colors) }} />
        {isFaceDownPermanent(o) ? (
          // D-315: a face-down permanent is drawn with the picture of the Manifest token (the same for every card); the tile stays a plain card back without it.
          <FaceDownArt version="art_crop" className="board-tile-art" />
        ) : (
          <Art
            name={art.name}
            back={art.back}
            isToken={o.isToken}
            {...(o.tokenDefinition === undefined ? {} : { tokenDefinition: o.tokenDefinition })}
            version="art_crop"
            className="board-tile-art"
          />
        )}
        <span className="board-tile-name">{o.name}</span>
        {o.isToken && h >= 64 && (
          <span className="board-tile-token" data-token-line>
            {tokenLine(o)}
          </span>
        )}
        {chips.length > 0 && (
          <span className="board-tile-kw">
            {chips.map((c) => (
              <span
                key={c.key}
                className={c.restriction ? 'board-kw board-kw-restrict' : 'board-kw'}
                title={c.full}
              >
                {c.short}
              </span>
            ))}
          </span>
        )}
        <span className="board-tile-foot">
          <span className="board-tile-chips">
            {isFaceDownPermanent(o) && (
              <span
                className="board-flag"
                title={faceDownBadgeTitle(o)}
                data-face-down-flag={o.faceDownBy}
              >
                face down
              </span>
            )}
            {o.summoningSick && isCreatureView(o) && (
              <span className="board-flag" title="Summoning sick">
                zz
              </span>
            )}
            {o.ringBearer !== undefined && (
              <span
                className="board-flag board-flag-ring"
                title="Ring-bearer (CR 701.54): legendary, and can't be blocked by creatures with greater power. The Ring's other abilities are on its player's strip."
                data-ring-bearer={o.ringBearer}
              >
                <span aria-hidden="true">{'◎ '}</span>Ring-bearer
              </span>
            )}
            {o.pairedWith !== undefined && (
              <span
                className="board-flag board-flag-soulbond"
                title="Paired (CR 702.95): paired with another creature for as long as both stay creatures on the battlefield under their controller's control. See the card preview for which one."
                data-paired-with={o.pairedWith}
              >
                <span aria-hidden="true">{'⚭ '}</span>Paired
              </span>
            )}
            {o.pairedPhasedOut === true && (
              <span
                className="board-flag board-flag-soulbond"
                title="Paired, on hold (CR 702.95, 702.26): one of the two creatures is phased out. The pair stands, because phasing is not leaving the battlefield, but gives nothing until both are phased in, and neither can be paired with another creature."
                data-paired-phased-out
              >
                <span aria-hidden="true">{'⚭ '}</span>Pair on hold
              </span>
            )}
            {o.loyaltyUsed === true && (
              <span
                className="board-flag"
                title="A loyalty ability of this planeswalker was activated this turn: no other can be (CR 606.3)"
                data-loyalty-used
              >
                used
              </span>
            )}
            {o.controlEnds !== undefined && (
              <span
                className="board-flag"
                title="Controlled by the other player through an effect; the card preview says for how long"
                data-taken
              >
                taken
              </span>
            )}
            {o.isCommander && (
              <span className="board-flag board-flag-cmdr" title="Commander">
                C
              </span>
            )}
            {isCrewedVehicle(o) && (
              <span
                className="board-flag board-flag-crewed"
                title="Crewed: an artifact creature until end of turn"
              >
                crewed
              </span>
            )}
            {isBackFaceUp(o) && (
              <span className="board-flag" title="Back face up">
                back
              </span>
            )}
            {isMelded(o) && (
              <span className="board-flag" title={`Melded from ${meldedFrom(o)}`}>
                melded
              </span>
            )}
            {kickedWords(o) !== null && (
              <span
                className="board-flag"
                title={
                  o.kicks !== undefined && o.kicks > 1
                    ? `Entered from a spell kicked ${o.kicks} times`
                    : 'Entered from a kicked spell'
                }
              >
                {o.kicks !== undefined && o.kicks > 1 ? `K×${o.kicks}` : 'K'}
              </span>
            )}
            {alternative !== null && (
              <span
                className="board-flag"
                title={alternative.title}
                data-alternative={o.alternative}
              >
                {alternative.text}
              </span>
            )}
            {o.support === 'unsupported' && (
              <span className="board-flag board-flag-warn" title="Unsupported card">
                !
              </span>
            )}
            {chosen !== null && (
              <span className="board-flag board-flag-chosen" title={chosen.title} data-chosen>
                {chosen.short}
              </span>
            )}
            {lore !== null && (
              <span
                className="board-counter board-lore"
                title="Lore counters on this Saga, out of its final chapter number"
              >
                {lore}
              </span>
            )}
            {counters.map((c) => (
              <span key={c.name} className="board-counter" title={`${c.count} ${c.name} counter`}>
                {c.name} {c.count}
              </span>
            ))}
            {o.damage > 0 && (
              <span className="board-damage" title={`${o.damage} damage marked`}>
                -{o.damage}
              </span>
            )}
          </span>
          {stat !== null && (
            <span
              className={`board-stat board-stat-${stat.kind}`}
              title={stat.title ?? (stat.kind === 'printed' ? PRINTED_TITLE : undefined)}
            >
              {stat.text}
            </span>
          )}
        </span>
      </span>
      {count > 1 && <span className="board-count">×{count}</span>}
      {role !== undefined && numbers.length > 0 && (
        <span className="board-pairs" aria-hidden="true" title={markerLabel(role)}>
          {role.kind === 'blocker' ? (
            role.pairs.map((p) => (
              <span key={p.attacker} className={`board-pair ${pairClass(p.number)}`}>
                {p.number}
              </span>
            ))
          ) : (
            <span
              className={`board-pair ${role.blocked ? pairClass(role.number ?? 1) : 'board-pair-open'}`}
            >
              {role.number}
            </span>
          )}
        </span>
      )}
      {role !== undefined && !(role.kind === 'blocker' && role.tentative) && (
        <span className={`board-ribbon board-ribbon-${role.kind}`} title={roleText(role)}>
          <b>{role.kind === 'attacker' ? 'Attacking' : 'Blocks'}</b>
          <i>{role.kind === 'attacker' ? role.target : role.blocks.join(', ')}</i>
        </span>
      )}
      {badge !== null && <span className="board-ibadge">{badge}</span>}
    </button>
  );
}
