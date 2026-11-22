/** Lookups over a `GameView` shared by the stack and log panels. */
import type { GameView, ObjectId, ObjectView, SeatId } from '@commander-arena/engine';
import { seatNameOf } from '../../game/seat-name';

export type StackTarget = ObjectView['targets'][number];

/** Every object the viewer can see, by id: battlefield, stack, exile, graveyards, hand, command. */
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
  }
  return map;
}

export function seatName(seat: SeatId, viewer: SeatId, seatCount = 2): string {
  return seatNameOf(seat, viewer, seatCount);
}

/** "Serra Angel", "You", "Opponent", or "a permanent that left" for an object that is gone. */
export function targetLabel(
  target: StackTarget,
  index: ReadonlyMap<ObjectId, ObjectView>,
  viewer: SeatId,
  seatCount = 2,
): string {
  if (target.kind === 'player') return seatName(target.seat, viewer, seatCount);
  return index.get(target.id)?.name ?? 'an object that left';
}
