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

import type { Keyword, ObjectFilter, TargetSpec } from '../ast/types';
import type { CardFace } from '../cards/definition';
import type { ObjectId, SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import { allocateTimestamp, patchObject } from '../state/ops';
import type { GameObject, GameState } from '../state/types';
import { controllerOf } from './control';
import { derive } from './derive';
import { isBestowedAura } from './derive-alt';
import { typeViewOf } from './derive-view';
import { playerHasProtectionFrom } from './player-protection';
import { hasProtectionFrom } from './protection';
import { matchesFilter } from './select';

/** The id of the target slot an Aura spell gets from its enchant ability (CR 303.4a). */
export const ENCHANT_TARGET_ID = 'enchant';

/** The enchant keyword of an Aura's printed abilities, or null when it has none (CR 702.5a). */
function enchantKeywordIn(face: CardFace): Extract<Keyword, { kind: 'enchant' }> | null {
  for (const a of face.abilities) {
    if (a.kind === 'keyword' && a.keyword.kind === 'enchant') return a.keyword;
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
  const enchant = enchantKeywordIn(face);
  if (enchant === null) return null;
  // CR 702.5a, 303.4a (issue 160, D-629): "Enchant player": the Aura spell targets a player.
  if (enchant.player === true)
    return { id: ENCHANT_TARGET_ID, what: { kind: 'player', filter: 'any' } };
  return {
    id: ENCHANT_TARGET_ID,
    what: { kind: 'object', filter: { ...enchant.filter, zone: enchantZone(enchant.filter) } },
  };
}

/**
 * Where the objects an enchant ability allows are (CR 702.5a): the battlefield, or, for "Enchant creature card in a graveyard" (Animate Dead), a graveyard. An Aura attached to such a card is
 * legal while the card is in a graveyard and the enchant ability, as the Aura has it now, still allows it (CR 704.5m).
 */
export function enchantZone(filter: ObjectFilter): 'battlefield' | 'graveyard' {
  return filter.zone === 'graveyard' ? 'graveyard' : 'battlefield';
}

/** The zone of the objects the permanent that is an Aura now may enchant, from the enchant ability it has now; the battlefield for an Aura that enchants players and for anything else. */
export function enchantZoneOf(state: GameState, aura: GameObject): 'battlefield' | 'graveyard' {
  const filter = enchantFilterOf(state, aura);
  return filter === null ? 'battlefield' : enchantZone(filter);
}

/**
 * The target slot of a spell cast for its bestow cost (CR 702.103b, rules text not checked): "enchant creature", like any Aura spell's. Its other target slots, if its card
 * had any, are not changed.
 */
export const BESTOW_TARGET_SPEC: TargetSpec = {
  id: ENCHANT_TARGET_ID,
  what: { kind: 'object', filter: { types: ['creature'], zone: 'battlefield' } },
};

/** The enchant filter of a permanent that is an Aura now, or null (also null for an Aura that enchants a player). */
function enchantFilterOf(state: GameState, aura: GameObject): ObjectFilter | null {
  const d = derive(state, aura);
  if (!d.subtypes.includes('Aura')) return null;
  for (const a of d.abilities) {
    if (a.kind === 'keyword' && a.keyword.kind === 'enchant') {
      return a.keyword.player === true ? null : a.keyword.filter;
    }
  }
  return null;
}

/** Whether a permanent that is an Aura now enchants players (CR 702.5a, "Enchant player", D-629). */
export function enchantsPlayers(state: GameState, aura: GameObject): boolean {
  const d = derive(state, aura);
  return (
    d.subtypes.includes('Aura') &&
    d.abilities.some(
      (a) => a.kind === 'keyword' && a.keyword.kind === 'enchant' && a.keyword.player === true,
    )
  );
}

/**
 * Whether `aura` could enchant the player `seat` (CR 303.4c, 702.5a, 702.16c; D-629): the player is still in the game and has no protection from the Aura (from its card type
 * or from everything).
 */
export function canEnchantPlayer(state: GameState, aura: GameObject, seat: SeatId): boolean {
  if (aura.zone !== 'battlefield' || !enchantsPlayers(state, aura)) return false;
  const player = state.seats[seat];
  if (player === undefined || player.hasLost) return false;
  return !playerHasProtectionFrom(state, seat, aura.id);
}

/**
 * Whether `attachment` could be attached to `host` (CR 701.3a): an Aura to what its enchant ability
 * allows and not to itself (CR 303.4d), an Equipment to a creature other than itself (CR 301.5,
 * 301.5c). Both must be on the battlefield. Anything else cannot be attached (CR 701.3b).
 */
export function canAttach(state: GameState, attachment: GameObject, host: GameObject): boolean {
  if (attachment.zone !== 'battlefield') return false;
  if (attachment.id === host.id) return false;
  const d = derive(state, attachment);
  if (d.subtypes.includes('Aura')) {
    const filter = enchantFilterOf(state, attachment);
    if (filter === null) return false;
    // CR 702.5a, 303.4a (Animate Dead): "Enchant creature card in a graveyard": the host is a card in a graveyard, which is no permanent and has no protection (CR 702.16b).
    const zone = enchantZone(filter);
    if (host.zone !== zone) return false;
    // CR 702.16d (D-229): protection from a color: it can't be enchanted by Auras or equipped by Equipment of that color.
    if (zone === 'battlefield' && hasProtectionFrom(state, host, attachment.id)) return false;
    return matchesFilter(
      state,
      host,
      { ...filter, zone },
      { controller: controllerOf(state, attachment), source: attachment.id },
    );
  }
  if (host.zone !== 'battlefield' || hasProtectionFrom(state, host, attachment.id)) return false;
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
  const hostObject = state.objects[host];
  if (hostObject === undefined) return { state, events: [] };
  // CR 608.3c (Animate Dead): an Aura that enchants a card in a graveyard enters attached to the card it targeted.
  const there =
    hostObject.zone === 'battlefield' ||
    (hostObject.zone === 'graveyard' &&
      state.objects[entered] !== undefined &&
      enchantZoneOf(state, state.objects[entered]) === 'graveyard');
  if (!there) return { state, events: [] };
  return {
    state: patchObject(state, entered, { attachedTo: host }),
    events: [{ kind: 'attached', object: entered, to: host }],
  };
}

/**
 * CR 608.3c, 303.4b (D-629): an Aura spell that enchants a player and resolved enters the battlefield attached to the player it targeted. `entered` is the new permanent.
 */
export function attachEnteredToPlayer(
  state: GameState,
  entered: ObjectId,
  seat: SeatId,
): { state: GameState; events: GameEvent[] } {
  if (state.seats[seat] === undefined) return { state, events: [] };
  return {
    state: patchObject(state, entered, { attachedToPlayer: seat }),
    events: [{ kind: 'attachedToPlayer', object: entered, seat }],
  };
}

/** CR 704.5m: Auras on the battlefield attached to an illegal object, or to nothing. */
export function illegalAuras(state: GameState): GameObject[] {
  const out: GameObject[] = [];
  for (const id of state.battlefield) {
    const obj = state.objects[id];
    // The subtypes are the ones layers 1, 4 and 5 leave, which `derive` copies as they are: no later layer changes them.
    if (obj === undefined || !typeViewOf(state, obj).subtypes.includes('Aura')) continue;
    // CR 702.103f: a bestowed Aura whose host is gone or illegal becomes unattached and a creature instead (`illegalAttachments`).
    if (isBestowedAura(obj)) continue;
    // CR 303.4c, 704.5m (D-629): an Aura that enchants a player is legal while that player is in the game and has no protection from it; attached to an object, or
    // to no one, it is illegal. An Aura that enchants objects and is attached to a player is illegal too.
    if (enchantsPlayers(state, obj)) {
      if (obj.attachedTo !== null || obj.attachedToPlayer === undefined) out.push(obj);
      else if (!canEnchantPlayer(state, obj, obj.attachedToPlayer)) out.push(obj);
      continue;
    }
    if (obj.attachedToPlayer !== undefined) {
      out.push(obj);
      continue;
    }
    const host = obj.attachedTo === null ? undefined : state.objects[obj.attachedTo];
    if (host === undefined || !canAttach(state, obj, host)) out.push(obj);
  }
  return out;
}

/**
 * CR 303.7 (Role), 704.5y: a permanent enchanted by two or more Role Auras controlled by the same player keeps the one with the latest timestamp; the others are put into their owners'
 * graveyards (rule numbers from the audit row DEV-17 and the card rulings; the rule text was not available to this build, so this is unverified). Roles controlled by different players
 * on the same permanent all stay.
 */
export function duplicateRoles(state: GameState): GameObject[] {
  const newest = new Map<string, GameObject>();
  const roles: { obj: GameObject; key: string }[] = [];
  for (const id of state.battlefield) {
    const obj = state.objects[id];
    if (obj === undefined || obj.attachedTo === null) continue;
    if (!typeViewOf(state, obj).subtypes.includes('Role')) continue;
    const key = `${obj.attachedTo}/${controllerOf(state, obj)}`;
    roles.push({ obj, key });
    const best = newest.get(key);
    if (best === undefined || obj.timestamp > best.timestamp) newest.set(key, obj);
  }
  return roles.filter((r) => newest.get(r.key) !== r.obj).map((r) => r.obj);
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
    const host = state.objects[obj.attachedTo];
    const hostIsThere = host?.zone === 'battlefield';
    if (isBestowedAura(obj)) {
      // CR 702.103f (bestow, rules text not checked): attached to something it may not enchant, it becomes unattached and stops being an Aura; it is not put into the graveyard.
      if (host === undefined || !canAttach(state, obj, host)) {
        out.push({ object: obj, from: obj.attachedTo, reason: hostIsThere ? 'illegal' : 'left' });
      }
      continue;
    }
    if (d.subtypes.includes('Aura')) continue; // CR 704.5m: it goes to the graveyard instead
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
