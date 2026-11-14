/**
 * Preparation cards (CR 722, D-214). A permanent with a prepare spell can be prepared ("enters prepared"): it has the designation, and its controller creates a copy
 * of the prepare spell in exile, which they may cast for as long as the permanent stays on the battlefield and prepared. The permanent loses the designation as the
 * spell is cast. The copy is an object of the exile zone that is not a card (`card` is null, `copyOf` is the card whose second face it is, as a copy of a spell is): it
 * is the "copy" of CR 722.3c, and it is not removed by the state-based action of CR 704.5e, which this engine applies only as such a copy leaves the stack. It goes
 * when its permanent leaves the battlefield or stops being prepared.
 */
import type { CardId, ObjectId } from '../ids';
import type { GameEvent } from '../state/events';
import {
  addToZone,
  allocateObjectId,
  allocateTimestamp,
  definitionOf,
  patchObject,
  removeFromZone,
  setObject,
} from '../state/ops';
import type { GameObject, GameState } from '../state/types';
import { controllerOf } from './control';

/**
 * The card whose prepare spell the object has (CR 722.2a, 722.2b), or null: a preparation card face up as its creature, or a token that is a copy of one
 * (the prepare spell is part of the copiable values, D-225).
 */
export function prepareCardOf(state: GameState, obj: GameObject): CardId | null {
  if (obj.token !== null) return obj.token.prepareOf ?? null;
  return obj.card !== null && obj.face === 0 && definitionOf(state, obj.card).layout === 'prepare'
    ? obj.card
    : null;
}

/** Whether the permanent has a prepare spell (CR 722.3a: the designation is only for a permanent that has one). */
export function hasPrepareSpell(state: GameState, obj: GameObject): boolean {
  return obj.zone === 'battlefield' && prepareCardOf(state, obj) !== null;
}

/**
 * CR 722.3a, 722.3c: the permanent becomes prepared, if it has a prepare spell and is not prepared already; its controller creates the copy of the prepare spell in
 * exile. Nothing happens otherwise.
 */
export function becomePrepared(
  state: GameState,
  id: ObjectId,
): { state: GameState; events: GameEvent[] } {
  const obj = state.objects[id];
  const prepareCard = obj === undefined ? null : prepareCardOf(state, obj);
  if (
    obj === undefined ||
    obj.prepared === true ||
    !hasPrepareSpell(state, obj) ||
    prepareCard === null
  ) {
    return { state, events: [] };
  }
  const [copyId, s1] = allocateObjectId(state);
  const [timestamp, s2] = allocateTimestamp(s1);
  const controller = controllerOf(state, obj);
  const copy: GameObject = {
    id: copyId,
    card: null,
    copyOf: prepareCard,
    zone: 'exile',
    zoneOwner: null,
    owner: controller,
    controller,
    // The prepare spell is the second face of the card; "in every other zone the card has only its normal characteristics" is about the card, not this copy (CR 722.3c).
    face: 1,
    tapped: false,
    counters: {},
    damage: 0,
    damagedByDeathtouch: false,
    timestamp,
    token: null,
    attachedTo: null,
    protector: null,
    stack: null,
    prepareOf: id,
  };
  let next = addToZone(setObject(s2, copy), 'exile', null, copyId);
  next = patchObject(next, id, { prepared: true, prepareCopy: copyId });
  return { state: next, events: [{ kind: 'prepared', object: id, copy: copyId }] };
}

/** CR 722.3b: the permanent is no longer prepared and the copy of its prepare spell that waits in exile is gone. */
export function becomeUnprepared(state: GameState, id: ObjectId): GameState {
  const obj = state.objects[id];
  if (obj === undefined) return state;
  let next = state;
  if (obj.prepareCopy !== undefined) next = dropPrepareCopy(next, obj.prepareCopy);
  const { prepared: _p, prepareCopy: _c, ...rest } = next.objects[id] ?? obj;
  return setObject(next, rest);
}

/** The copy of a prepare spell ceases to exist (it was made for a permanent that left or is no longer prepared). */
export function dropPrepareCopy(state: GameState, copyId: ObjectId): GameState {
  const copy = state.objects[copyId];
  if (copy === undefined || copy.prepareOf === undefined) return state;
  const removed = removeFromZone(state, copy);
  const { [copyId]: _gone, ...rest } = removed.objects;
  return { ...removed, objects: rest };
}

/** The prepared permanent a copy waits for, when it is still on the battlefield and prepared and controlled by `seat`. */
export function preparedPermanentOf(
  state: GameState,
  copy: GameObject,
  seat: number,
): GameObject | null {
  if (copy.prepareOf === undefined) return null;
  const permanent = state.objects[copy.prepareOf];
  if (
    permanent === undefined ||
    permanent.zone !== 'battlefield' ||
    permanent.prepared !== true ||
    permanent.prepareCopy !== copy.id ||
    controllerOf(state, permanent) !== seat
  ) {
    return null;
  }
  return permanent;
}
