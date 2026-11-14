/**
 * Auras and Equipment: what they can be attached to, attaching them, and the state-based actions
 * that undo an illegal attachment.
 *
 * - CR 303.4a: an Aura spell's target is defined by its enchant ability (`auraTargetSpec`); CR 608.3c:
 *   it enters attached to that target (`attachEntered`).
 * - CR 701.3 (Attach): `attachObject` moves an Aura or Equipment onto a permanent. One that cannot
 *   be attached there does not move (CR 701.3b); attaching to the permanent it is already on does
 *   nothing; attaching to a different one gives it a new timestamp (CR 701.3c).
 * - CR 704.5m: an Aura attached to an illegal object, or to nothing, goes to the graveyard
 *   (`illegalAuras`). CR 704.5n, 704.5p: Equipment attached to an illegal permanent, and any other
 *   permanent that is attached to something, becomes unattached and stays (`illegalAttachments`).
 *
 * Enchant legality ("an illegal object as defined by its enchant ability", CR 303.4c) ignores
 * hexproof and shroud: those restrict targeting, not being attached.
 */

import type { ObjectFilter, TargetSpec } from '../ast/types';
import type { CardFace } from '../cards/definition';
import type { ObjectId } from '../ids';
import type { GameEvent } from '../state/events';
import { allocateTimestamp, patchObject } from '../state/ops';
import type { GameObject, GameState } from '../state/types';
import { controllerOf } from './control';
import { derive } from './derive';
import { typeViewOf } from './derive-view';
import { hasProtectionFrom } from './protection';
import { matchesFilter } from './select';

/** The id of the target slot an Aura spell gets from its enchant ability (CR 303.4a). */
export const ENCHANT_TARGET_ID = 'enchant';

/** The enchant filter of an Aura's printed abilities, or null when it has none (CR 702.5a). */
function enchantFilterIn(face: CardFace): ObjectFilter | null {
  for (const a of face.abilities) {
    if (a.kind === 'keyword' && a.keyword.kind === 'enchant') return a.keyword.filter;
  }
  return null;
}

/**
 * The target slot of an Aura spell (CR 303.4a), or null for a card that is not an Aura. The filter
 * is read on the battlefield: an Aura enchants permanents (`validateCard` refuses other zones).
 */
export function auraTargetSpec(face: CardFace | null): TargetSpec | null {
  if (face === null || !face.subtypes.includes('Aura') || !face.types.includes('enchantment')) {
    return null;
  }
  const filter = enchantFilterIn(face);
  if (filter === null) return null;
  return {
    id: ENCHANT_TARGET_ID,
    what: { kind: 'object', filter: { ...filter, zone: 'battlefield' } },
  };
}

/** The enchant filter of a permanent that is an Aura now, or null. */
function enchantFilterOf(state: GameState, aura: GameObject): ObjectFilter | null {
  const d = derive(state, aura);
  if (!d.subtypes.includes('Aura')) return null;
  for (const a of d.abilities) {
    if (a.kind === 'keyword' && a.keyword.kind === 'enchant') return a.keyword.filter;
  }
  return null;
}

/**
 * Whether `attachment` could be attached to `host` (CR 701.3a): an Aura to what its enchant ability
 * allows and not to itself (CR 303.4d), an Equipment to a creature other than itself (CR 301.5,
 * 301.5c). Both must be on the battlefield. Anything else cannot be attached (CR 701.3b).
 */
export function canAttach(state: GameState, attachment: GameObject, host: GameObject): boolean {
  if (attachment.zone !== 'battlefield' || host.zone !== 'battlefield') return false;
  if (attachment.id === host.id) return false;
  // CR 702.16d (D-229): protection from a color: it can't be enchanted by Auras or equipped by Equipment of that color.
  if (hasProtectionFrom(state, host, attachment.id)) return false;
  const d = derive(state, attachment);
  if (d.subtypes.includes('Aura')) {
    const filter = enchantFilterOf(state, attachment);
    return (
      filter !== null &&
      matchesFilter(state, host, filter, {
        controller: controllerOf(state, attachment),
        source: attachment.id,
      })
    );
  }
  if (d.subtypes.includes('Equipment')) return derive(state, host).types.includes('creature');
  return false;
}

/**
 * CR 701.3: attaches `attachmentId` to `hostId`. Does nothing, and says so with an empty result,
 * when it cannot be attached there or is already attached there (CR 701.3b). From another
 * permanent it first becomes unattached from it (`replaced`).
 */
export function attachObject(
  state: GameState,
  attachmentId: ObjectId,
  hostId: ObjectId,
): { state: GameState; events: GameEvent[] } {
  const attachment = state.objects[attachmentId];
  const host = state.objects[hostId];
  if (attachment === undefined || host === undefined) return { state, events: [] };
  if (!canAttach(state, attachment, host)) return { state, events: [] };
  if (attachment.attachedTo === hostId) return { state, events: [] };
  const events: GameEvent[] = [];
  if (attachment.attachedTo !== null) {
    events.push({
      kind: 'unattached',
      object: attachmentId,
      from: attachment.attachedTo,
      reason: 'replaced',
    });
  }
  // CR 701.3c: moving to a different object gives it a new timestamp.
  const [timestamp, stamped] = allocateTimestamp(state);
  events.push({ kind: 'attached', object: attachmentId, to: hostId });
  return {
    state: patchObject(stamped, attachmentId, { attachedTo: hostId, timestamp }),
    events,
  };
}

/**
 * CR 608.3c: an Aura spell that resolved enters the battlefield attached to the object it targeted.
 * `entered` is the new permanent. It is already known to be legal (the target was checked when the
 * spell resolved), so nothing here refuses; a target that stopped being legal in between is dealt
 * with by CR 704.5m.
 */
export function attachEntered(
  state: GameState,
  entered: ObjectId,
  host: ObjectId,
): { state: GameState; events: GameEvent[] } {
  if (state.objects[host]?.zone !== 'battlefield') return { state, events: [] };
  return {
    state: patchObject(state, entered, { attachedTo: host }),
    events: [{ kind: 'attached', object: entered, to: host }],
  };
}

/** CR 704.5m: Auras on the battlefield attached to an illegal object, or to nothing. */
export function illegalAuras(state: GameState): GameObject[] {
  const out: GameObject[] = [];
  for (const id of state.battlefield) {
    const obj = state.objects[id];
    // The subtypes are the ones layers 1, 4 and 5 leave, which `derive` copies as they are: no later layer changes them.
    if (obj === undefined || !typeViewOf(state, obj).subtypes.includes('Aura')) continue;
    const host = obj.attachedTo === null ? undefined : state.objects[obj.attachedTo];
    if (host === undefined || !canAttach(state, obj, host)) out.push(obj);
  }
  return out;
}

/**
 * CR 704.5n, 704.5p: permanents that are attached to something they may not be. An Equipment
 * attached to a permanent that is not a creature or no longer on the battlefield; and a permanent
 * that is neither an Aura nor an Equipment (a creature, or an Equipment that lost its subtype)
 * attached to anything. `reason` says whether the host is gone or only illegal.
 */
export function illegalAttachments(
  state: GameState,
): { object: GameObject; from: ObjectId; reason: 'left' | 'illegal' }[] {
  const out: { object: GameObject; from: ObjectId; reason: 'left' | 'illegal' }[] = [];
  for (const id of state.battlefield) {
    const obj = state.objects[id];
    if (obj === undefined || obj.attachedTo === null) continue;
    const d = typeViewOf(state, obj);
    if (d.subtypes.includes('Aura')) continue; // CR 704.5m: it goes to the graveyard instead
    const host = state.objects[obj.attachedTo];
    const hostIsThere = host?.zone === 'battlefield';
    if (!d.subtypes.includes('Equipment') || d.types.includes('creature')) {
      out.push({ object: obj, from: obj.attachedTo, reason: hostIsThere ? 'illegal' : 'left' });
    } else if (host === undefined || !canAttach(state, obj, host)) {
      out.push({ object: obj, from: obj.attachedTo, reason: hostIsThere ? 'illegal' : 'left' });
    }
  }
  return out;
}

/** Becomes unattached and stays where it is (CR 701.3d). */
export function unattach(
  state: GameState,
  object: ObjectId,
  from: ObjectId,
  reason: 'left' | 'illegal',
): { state: GameState; events: GameEvent[] } {
  return {
    state: patchObject(state, object, { attachedTo: null }),
    events: [{ kind: 'unattached', object, from, reason }],
  };
}
