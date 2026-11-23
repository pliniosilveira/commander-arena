/** Lookups over a `GameView` used by the decision layer. Pure, so they are unit tested. */
import type {
  AttackTarget,
  DamageRecipient,
  GameView,
  ObjectId,
  ObjectView,
  SeatId,
} from '@commander-arena/engine';
import { chapterWord } from '../../game/saga';
import { seatNameOf } from '../../game/seat-name';

/** Every object the viewer can see, by id: battlefield, stack, exile, graveyards, hand, command, the top of their library. */
export function objectIndex(view: GameView): ReadonlyMap<ObjectId, ObjectView> {
  const map = new Map<ObjectId, ObjectView>();
  const add = (list: readonly ObjectView[] | null) => {
    for (const o of list ?? []) map.set(o.id, o);
  };
  add(view.battlefield);
  add(view.stack);
  add(view.exile);
  add(view.phasedOut ?? null);
  for (const seat of view.seats) {
    add(seat.hand);
    add(seat.graveyard);
    add(seat.command);
    // D-151 (CR 401.5): the top card of the viewer's own library, while they may look at it or cast it (the opponent's is never in the view).
    add(seat.libraryTop === undefined ? null : [seat.libraryTop]);
  }
  return map;
}

export type Index = ReadonlyMap<ObjectId, ObjectView>;

/** "You", "Opponent", or "Opponent N" with more than two seats (`seatCount`, default 2). */
export function seatLabel(seat: SeatId, viewer: SeatId, seatCount = 2): string {
  return seatNameOf(seat, viewer, seatCount);
}

export function nameOf(index: Index, id: ObjectId): string {
  return index.get(id)?.name ?? 'a card';
}

/**
 * A spell on the stack by name, an ability on it as "Name's ability" (the view names it after its
 * source, CR 113.7a). When the view no longer has the object, "that spell": nothing is guessed.
 */
export function stackName(index: Index, id: ObjectId): string {
  const obj = index.get(id);
  if (obj === undefined) return 'that spell';
  if (obj.abilitySource === undefined) return obj.name;
  const chapter = chapterWord(obj.chapter);
  return chapter === null ? `${obj.name}'s ability` : `${obj.name}'s ${chapter} ability`;
}

export function attackTargetLabel(
  target: AttackTarget,
  index: Index,
  viewer: SeatId,
  seatCount = 2,
): string {
  return target.kind === 'player'
    ? seatLabel(target.seat, viewer, seatCount)
    : nameOf(index, target.object);
}

export function recipientLabel(
  to: DamageRecipient,
  index: Index,
  viewer: SeatId,
  seatCount = 2,
): string {
  return to.kind === 'player' ? seatLabel(to.seat, viewer, seatCount) : nameOf(index, to.id);
}

export function sameAttackTarget(a: AttackTarget, b: AttackTarget): boolean {
  return a.kind === 'player'
    ? b.kind === 'player' && a.seat === b.seat
    : b.kind === 'permanent' && a.object === b.object;
}

export function sameRecipient(a: DamageRecipient, b: DamageRecipient): boolean {
  return a.kind === 'player'
    ? b.kind === 'player' && a.seat === b.seat
    : b.kind === 'object' && a.id === b.id;
}

/** The viewer's own hand, in order (empty when the view has none). */
export function myHand(view: GameView): readonly ObjectView[] {
  return view.seats[view.viewer]?.hand ?? [];
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
