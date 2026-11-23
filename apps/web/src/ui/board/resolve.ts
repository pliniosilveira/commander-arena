/** Pure lookups over a `GameView` for the board: objects by id, combat roles, commander facts. */

import type {
  Color,
  GameView,
  ObjectId,
  ObjectView,
  SeatId,
  SeatView,
} from '@commander-arena/engine';
import { companionObject, companionSeatOf } from '../../game/companion';
import { designationObject } from '../../game/designations';
import { isInherentAbility } from '../../game/monarch-text';
import type { DefinedPtNote } from '../../game/protocol';
import { seatNameOf } from '../../game/seat-name';

/** Every object the viewer may look at, for the preview panel and zone viewers. */
export function findObject(view: GameView, id: ObjectId): ObjectView | null {
  // The monarch and the Ring are shown as small cards but are no objects of the view (D-243).
  const designation = designationObject(view, id);
  if (designation !== null) return designation;
  // A revealed companion is outside the game: its card is built from the seat's public companion data.
  const companionSeat = companionSeatOf(id);
  if (companionSeat !== null) return companionObject(view, companionSeat);
  // `pendingCards` are the viewer's own library cards of a search they are making (engine view).
  const pools: (readonly ObjectView[])[] = [
    view.battlefield,
    view.stack,
    view.exile,
    view.phasedOut ?? [],
    view.pendingCards ?? [],
  ];
  for (const seat of view.seats) pools.push(seat.graveyard, seat.command, seat.hand ?? []);
  // The top card of the viewer's own library, while a permanent lets them look at it (CR 401.5, D-125).
  const top = view.seats[view.viewer]?.libraryTop;
  if (top !== undefined) pools.push([top]);
  for (const pool of pools) {
    const found = pool.find((o) => o.id === id);
    if (found !== undefined) return found;
  }
  return null;
}

/** What the preview panel shows and why. */
export interface PreviewChoice {
  /** The object to show, or null for nothing. */
  readonly id: ObjectId | null;
  /** `stack` is the top of the stack, shown when nothing is hovered (issue 82). */
  readonly source: 'hovered' | 'stack' | 'none';
}

/**
 * The object the preview panel shows. The hovered object is shown while the viewer can
 * still see it; with neither, the object on top of the stack, so the card that waits for the player's
 * pass is read without moving the pointer to the stack and back (issue 82). A hovered object that has
 * gone, with an empty stack, is still named ("Not visible any more"). An ability with no source (the
 * monarch's) is not a card: it is not shown. A top of the stack the player dismissed is not shown
 * either, until another object is on top.
 */
export function previewChoice(
  view: GameView,
  hovered: ObjectId | null,
  dismissedStack: ObjectId | null = null,
): PreviewChoice {
  if (hovered !== null && findObject(view, hovered) !== null)
    return { id: hovered, source: 'hovered' };
  const top = view.stack[view.stack.length - 1];
  // The monarch's and the Ring's abilities have no card to show (nothing to hover either).
  // A top of the stack the player tapped away stays closed (a new one shows again).
  if (top !== undefined && !isInherentAbility(top) && top.id !== dismissedStack)
    return { id: top.id, source: 'stack' };
  return hovered === null ? { id: null, source: 'none' } : { id: hovered, source: 'hovered' };
}

export function seatLabel(view: GameView, seat: SeatId): string {
  return seatNameOf(seat, view.viewer, view.seats.length);
}

/** One block a creature makes: the attacker it blocks, by its number (`pairing.ts`). */
export interface BlockPair {
  readonly number: number;
  readonly attacker: ObjectId;
  readonly name: string;
}

export type CombatRole =
  | {
      readonly kind: 'attacker';
      readonly target: string;
      readonly blocked: boolean;
      /**
       * The attacker's number in this combat, the same on it and on each creature blocking it; null
       * while no block is on the table (nothing to pair yet).
       */
      readonly number: number | null;
      /** How many creatures block it. */
      readonly blockers: number;
      /** The pairs are the player's pending choice in the declare blockers question, not yet declared. */
      readonly tentative: boolean;
    }
  | {
      readonly kind: 'blocker';
      readonly blocks: readonly string[];
      /** One per attacker this creature blocks, in the attackers' order. */
      readonly pairs: readonly BlockPair[];
      readonly tentative: boolean;
    };

/** A block the player has picked in the declare blockers question but not yet declared (CR 509.1). */
export interface PendingBlock {
  readonly blocker: ObjectId;
  readonly attacker: ObjectId;
}

/**
 * What each creature in combat is doing (CR 506 to 510), with names ready to draw. Attackers are
 * numbered 1, 2, 3 in the order they were declared; once a block exists (or while the viewer picks
 * blocks) the number is shown on the attacker and on every creature blocking it, so identical
 * creatures can be told apart. `pending` overlays the blocks the viewer has picked so far.
 */
export function combatRoles(
  view: GameView,
  pending: readonly PendingBlock[] | undefined = undefined,
): ReadonlyMap<ObjectId, CombatRole> {
  const roles = new Map<ObjectId, CombatRole>();
  if (view.combat === null) return roles;
  const choosing = pending !== undefined || view.pending?.kind === 'declareBlockers';
  const nameOf = (id: ObjectId) => view.battlefield.find((o) => o.id === id)?.name ?? 'a permanent';
  const attackers = view.combat.attackers.map((a, i) => ({
    ...a,
    number: i + 1,
    blockedBy: [
      ...a.blockedBy,
      ...(pending ?? []).filter((p) => p.attacker === a.object).map((p) => p.blocker),
    ],
  }));
  const tentative = (pending?.length ?? 0) > 0;
  const numbered = choosing || attackers.some((a) => a.blocked || a.blockedBy.length > 0);
  const pairs = new Map<ObjectId, BlockPair[]>();
  for (const attacker of attackers) {
    roles.set(attacker.object, {
      kind: 'attacker',
      target:
        attacker.target.kind === 'player'
          ? seatLabel(view, attacker.target.seat)
          : nameOf(attacker.target.object),
      blocked: attacker.blocked || attacker.blockedBy.length > 0,
      number: numbered ? attacker.number : null,
      blockers: attacker.blockedBy.length,
      tentative: tentative && attacker.blockedBy.length > 0,
    });
    for (const blocker of attacker.blockedBy) {
      const list = pairs.get(blocker) ?? [];
      list.push({
        number: attacker.number,
        attacker: attacker.object,
        name: nameOf(attacker.object),
      });
      pairs.set(blocker, list);
    }
  }
  for (const [blocker, list] of pairs) {
    roles.set(blocker, {
      kind: 'blocker',
      blocks: list.map((p) => p.name),
      pairs: list,
      tentative,
    });
  }
  return roles;
}

/** The text of a role, for the preview panel and the accessible name of a tile. */
export function roleText(role: CombatRole): string {
  if (role.kind === 'blocker') {
    return `Blocking ${role.pairs.map((p) => `${p.name} (#${p.number})`).join(', ')}`;
  }
  const number = role.number === null ? '' : ` (#${role.number})`;
  if (!role.blocked)
    return `Attacking ${role.target}${role.number === null ? '' : `, unblocked${number}`}`;
  const by =
    role.blockers === 0
      ? ''
      : ` by ${role.blockers === 1 ? '1 creature' : `${role.blockers} creatures`}`;
  return `Attacking ${role.target}, blocked${by}${number}`;
}

/**
 * Everything about a role that tells two identical creatures apart, as a string for the grouping
 * key (`group.ts`): attacking or blocking, which attacker numbers, blocked or not. Identical tokens
 * that differ here must never share one tile.
 */
export function roleKey(role: CombatRole | undefined): string {
  if (role === undefined) return '';
  if (role.kind === 'blocker') return `blocker:${role.pairs.map((p) => p.number).join(',')}`;
  return `attacker:${role.number ?? '-'}:${role.blocked ? 'blocked' : 'open'}`;
}

/** Commanders owned by a seat that the viewer can see (never an opponent's hand). */
export function commandersOf(view: GameView, seat: SeatId): ObjectView[] {
  const all: ObjectView[] = [...view.battlefield, ...view.stack, ...view.exile];
  for (const s of view.seats) all.push(...s.graveyard, ...s.command, ...(s.hand ?? []));
  return all.filter((o) => o.isCommander && o.owner === seat);
}

/**
 * Commander tax per commander. The view keys it by card id, which `ObjectView` does not carry, so
 * the figures cannot be matched to a commander by identity: the caller shows them in order. With
 * one commander (every M3 deck) the order is unambiguous.
 */
export function commanderTaxes(seat: SeatView): number[] {
  return Object.values(seat.commanderTax);
}

export interface CommanderDamage {
  /** The seat whose commander dealt the damage, when the view says (it always does). */
  readonly from: SeatId | null;
  readonly amount: number;
  /** The dealing commander's name in a two-seat game with one commander, otherwise null. */
  readonly name: string | null;
}

/**
 * Commander damage taken by `seat` (CR 903.10a), one row per dealing commander, with the seat that
 * owns it (`GameView.commanderDamageSources`), so several opponents can be told apart.
 */
export function commanderDamageTaken(view: GameView, seat: SeatId): CommanderDamage[] {
  const rows = Object.entries(view.commanderDamage).filter(([key]) => key.startsWith(`${seat}:`));
  const sources = view.seats.filter((s) => s.id !== seat).flatMap((s) => commandersOf(view, s.id));
  const only = view.seats.length === 2 && rows.length === 1 && sources.length === 1;
  return rows.map(([key, amount]) => ({
    from: view.commanderDamageSources[key] ?? null,
    amount,
    name: only ? (sources[0]?.name ?? null) : null,
  }));
}

const BAND_VAR: Readonly<Record<Color, string>> = {
  W: 'var(--card-w)',
  U: 'var(--card-u)',
  B: 'var(--card-b)',
  R: 'var(--card-r)',
  G: 'var(--card-g)',
};

/** The colour band of a frame, from the token palette only. Two colours blend; more use gold. */
export function bandBackground(colors: readonly Color[]): string {
  const [a, b, ...rest] = colors;
  if (a === undefined) return 'var(--card-colorless)';
  if (b === undefined) return BAND_VAR[a];
  if (rest.length > 0) return 'var(--card-multi)';
  return `linear-gradient(90deg, ${BAND_VAR[a]} 50%, ${BAND_VAR[b]} 50%)`;
}

/**
 * Issue 22: the colours a card is framed in. Its own colours; a land, which has none, takes the
 * colours of the mana it could produce (`ObjectView.landMana`, colourless left out).
 */
export function frameColors(
  o: Pick<ObjectView, 'colors' | 'types' | 'landMana'>,
): readonly Color[] {
  if (o.colors.length > 0 || !o.types.includes('land')) return o.colors;
  return (o.landMana ?? []).filter((c): c is Color => c !== 'C');
}

/**
 * The border of a frame as a CSS image (it is painted under a transparent border, so it must be
 * an image even for one colour): one colour, two colours split on the diagonal, gold for more,
 * grey for none.
 */
export function frameImage(colors: readonly Color[]): string {
  const [a, b, ...rest] = colors;
  const flat = (c: string) => `linear-gradient(${c}, ${c})`;
  if (a === undefined) return flat('var(--card-colorless)');
  if (b === undefined) return flat(BAND_VAR[a]);
  if (rest.length > 0) return flat('var(--card-multi)');
  return `linear-gradient(135deg, ${BAND_VAR[a]} 50%, ${BAND_VAR[b]} 50%)`;
}

export function isCreatureView(o: ObjectView): boolean {
  return o.types.includes('creature');
}

export type RowKind = 'creature' | 'land' | 'other';

/** Creatures first (a land creature is a creature), then lands, then everything else. */
export function rowKindOf(o: ObjectView): RowKind {
  if (o.types.includes('creature')) return 'creature';
  if (o.types.includes('land')) return 'land';
  return 'other';
}

/** True for a Vehicle (CR 301.7) that is a creature right now: crewed until end of turn. */
export function isCrewedVehicle(o: ObjectView): boolean {
  return o.subtypes.includes('Vehicle') && o.types.includes('creature');
}

/** The tooltip of a Vehicle's greyed printed power and toughness (CR 301.7a). */
export const PRINTED_TITLE =
  'Printed power and toughness: it has them only while it is a creature (crew it)';

/** What a corner stat is: loyalty, defense, power and toughness, or a Vehicle's printed pair. */
export interface CornerStat {
  readonly kind: 'loyalty' | 'defense' | 'pt' | 'printed';
  readonly text: string;
  /** Hover text for a `*` (D-109): what defines it. A Vehicle's greyed pair has `PRINTED_TITLE`. */
  readonly title?: string;
}

/**
 * The number drawn in a frame's corner: loyalty or defense for those types, else P/T. An uncrewed
 * Vehicle (CR 301.7a: no power and toughness until it is a creature) has `power: null`; its
 * printed pair is shown as `printed`, to be drawn greyed and never read as a live P/T.
 *
 * A card whose face prints `*` (`note`, D-109) shows the `*` wherever it is not a permanent or a spell
 * (a hand, a graveyard, exile, the command zone: CR 208.2a has it printed there) and the derived
 * number on the battlefield and the stack; either way the title says what defines it.
 */
export function cornerStat(o: ObjectView, note?: DefinedPtNote): CornerStat | null {
  // Off the battlefield there are no counters: a planeswalker card shows its printed loyalty (D-200, CR 306.5a); defense is not in the view.
  const live = o.zone === 'battlefield';
  if (live && o.types.includes('planeswalker'))
    return { kind: 'loyalty', text: String(o.counters.loyalty ?? 0) };
  if (!live && o.zone !== 'stack' && o.printedLoyalty !== undefined)
    return { kind: 'loyalty', text: String(o.printedLoyalty) };
  if (live && o.types.includes('battle'))
    return { kind: 'defense', text: String(o.counters.defense ?? 0) };
  if (o.power !== null && o.toughness !== null) {
    if (note === undefined) return { kind: 'pt', text: `${o.power}/${o.toughness}` };
    const printed = o.zone !== 'battlefield' && o.zone !== 'stack';
    const power = printed && note.power ? '*' : o.power;
    const toughness = printed && note.toughness ? '*' : o.toughness;
    return {
      kind: 'pt',
      text: `${power}/${toughness}`,
      title: printed ? `${note.text} (now ${o.power}/${o.toughness})` : note.text,
    };
  }
  if (live && o.printedPt !== undefined)
    return { kind: 'printed', text: `${o.printedPt.power}/${o.printedPt.toughness}` };
  return null;
}

/**
 * Counter chips for the frame, without the ones the corner already shows. A Saga with chapter
 * abilities shows its lore counters as the "Lore N / M" badge instead (`loreBadge`).
 */
export function counterChips(o: ObjectView): { name: string; count: number }[] {
  return Object.entries(o.counters)
    .filter(([name, count]) => count > 0 && name !== 'loyalty' && name !== 'defense')
    .filter(([name]) => !(name === 'lore' && o.finalChapter !== undefined))
    .map(([name, count]) => ({ name, count }));
}
