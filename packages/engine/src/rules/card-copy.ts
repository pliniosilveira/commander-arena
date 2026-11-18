/**
 * "Copy it. You may cast the copy without paying its mana cost" (CR 707.12, 707.2, 704.5e, D-654): the copy of a card that an effect makes in exile so that its controller may cast it
 * while the effect resolves. It is an object with no card of its own (`card` null) whose characteristics are those of the card it copies (`copyOf`, as a copy of a spell has), marked
 * `cardCopy`. Casting it is the ordinary cast of CR 608.2g (`rules/cast-free.ts`): it moves to the stack as a copy of a spell (`rules/zones.ts`). One that is not cast ceases to exist at
 * the next state-based check (`rules/sba.ts`, CR 704.5e).
 */
import type { CardId, ObjectId, SeatId } from '../ids';
import { addToZone, allocateObjectId, allocateTimestamp, setObject } from '../state/ops';
import type { GameObject, GameState } from '../state/types';

/** Makes the copy of `card` in exile for `controller`, who owns it. Returns the state and the copy. */
export function makeCardCopy(
  input: GameState,
  card: CardId,
  controller: SeatId,
): { readonly state: GameState; readonly copy: ObjectId } {
  const [id, s1] = allocateObjectId(input);
  const [timestamp, s2] = allocateTimestamp(s1);
  const copy: GameObject = {
    id,
    card: null,
    copyOf: card,
    cardCopy: true,
    zone: 'exile',
    zoneOwner: null,
    owner: controller,
    controller,
    face: 0,
    tapped: false,
    counters: {},
    damage: 0,
    damagedByDeathtouch: false,
    timestamp,
    token: null,
    attachedTo: null,
    protector: null,
    stack: null,
  };
  return { state: addToZone(setObject(s2, copy), 'exile', null, id), copy: id };
}
