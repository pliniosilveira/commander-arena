/**
 * The Ring tempts you (CR 701.54, D-196).
 *
 * "Each time the Ring tempts you, choose a creature you control. That creature becomes your Ring-bearer until another creature becomes your
 * Ring-bearer or another player gains control of it" (CR 701.54a). Ring-bearer is a designation of a permanent, and not a copiable value
 * (CR 701.54b): `GameObject.ringBearer` names the player it is the Ring-bearer of. A player who has none of the emblem gets one named The Ring
 * before choosing (CR 701.54c); the emblem is a record on the seat (`SeatState.ring`), which says how many times the Ring has tempted the player.
 * Nothing else reads an emblem's characteristics, so it is not an object.
 *
 * The Ring has "Your Ring-bearer is legendary and can't be blocked by creatures with greater power" from the first time (read by `derive`
 * and by the block rules through `isRingBearerOf`), and three triggered abilities that belong to no object and turn on as it tempts the player
 * more often (CR 701.54c), found here as the inherent abilities of the monarch are (`monarch.ts`, `triggers.ts`):
 * - two or more times: "Whenever your Ring-bearer attacks, draw a card, then discard a card."
 * - three or more: "Whenever your Ring-bearer becomes blocked by a creature, the blocking creature's controller sacrifices it at end of combat."
 * - four or more: "Whenever your Ring-bearer deals combat damage to a player, each opponent loses 3 life."
 *
 * "Whenever the Ring tempts you" triggers when the player has done what CR 701.54a says, even when some or all of it was impossible
 * (CR 701.54d): the event `ringTempted`, emitted also when the player controlled no creature. "Is your Ring-bearer" is true for a creature on the
 * battlefield under your control with the designation (CR 701.54e).
 */

import type { ObjectId, SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import { patchObject, patchSeat, setObject } from '../state/ops';
import type {
  GameObject,
  GameState,
  Instruction,
  PendingTrigger,
  ResolutionContext,
  TriggeredAbility,
} from '../state/types';
import { controllerOf } from './control';
import { derive } from './derive';
import { ringBearerOf, ringLevel } from './ring-bearer';
import { done, type StepOutcome } from './step-outcome';

/** The loot of the second level (CR 701.54c): "draw a card, then discard a card" (the player chooses the discard). */
export const RING_LOOT_ABILITY: TriggeredAbility = {
  kind: 'triggered',
  trigger: { kind: 'attacks', what: { kind: 'this' } },
  effect: {
    kind: 'sequence',
    effects: [
      { kind: 'draw', player: { kind: 'you' }, count: 1 },
      { kind: 'discard', player: { kind: 'you' }, count: 1 },
    ],
  },
};

/** The sacrifice of the third level (CR 701.54c): the creature that blocks the Ring-bearer, at end of combat, by its controller. */
export const RING_BLOCKED_ABILITY: TriggeredAbility = {
  kind: 'triggered',
  trigger: { kind: 'becomesBlocked', what: { kind: 'this' } },
  effect: { kind: 'delayedSacrifice' },
};

/** The life loss of the fourth level (CR 701.54c): each opponent loses 3 life. */
export const RING_DAMAGE_ABILITY: TriggeredAbility = {
  kind: 'triggered',
  trigger: { kind: 'dealsCombatDamage', what: { kind: 'this' }, to: 'player' },
  effect: { kind: 'loseLife', player: { kind: 'eachOpponent' }, amount: 3 },
};

/** The text each Ring ability shows on the stack: the full texts of CR 701.54c. */
export const RING_TEXT: Readonly<Record<'ringLoot' | 'ringBlocked' | 'ringDamage', string>> = {
  ringLoot: 'Whenever your Ring-bearer attacks, draw a card, then discard a card.',
  ringBlocked:
    "Whenever your Ring-bearer becomes blocked by a creature, the blocking creature's controller sacrifices it at end of combat.",
  ringDamage:
    'Whenever your Ring-bearer deals combat damage to a player, each opponent loses 3 life.',
};

/** The creatures `seat` controls, as `derive` types them now: what the Ring may choose among (CR 701.54a). */
function creaturesOf(state: GameState, seat: SeatId): ObjectId[] {
  return Object.values(state.objects)
    .filter(
      (o) =>
        o.zone === 'battlefield' &&
        controllerOf(state, o) === seat &&
        derive(state, o).types.includes('creature'),
    )
    .map((o) => o.id);
}

type RingTempts = Extract<Instruction, { kind: 'ringTempts' }>;

/**
 * Runs `ringTempts` (CR 701.54a, 701.54c, 701.54d). With two or more creatures the controller is asked which becomes their Ring-bearer (the
 * instruction stays at the head of the queue and nothing has changed yet); with one it is chosen, with none nothing is (and the Ring still
 * tempts them, CR 701.54d). Then, at once: the emblem if they had none, the count one more, the designation moved, the event.
 */
export function runRingTempts(
  state: GameState,
  res: ResolutionContext,
  ins: RingTempts,
): StepOutcome {
  const seat = res.controller;
  const candidates = creaturesOf(state, seat);
  const picked = ins.chosen?.[0] ?? (candidates.length === 1 ? candidates[0] : undefined);
  if (picked === undefined && candidates.length >= 2) {
    return {
      state,
      events: [],
      front: [],
      needs: {
        kind: 'choosePermanent',
        seat,
        source: res.object,
        purpose: 'ringBearer',
        min: 1,
        max: 1,
        legal: candidates,
      },
    };
  }
  const first = state.seats[seat]?.ring === undefined;
  let next = patchSeat(state, seat, { ring: { tempted: ringLevel(state, seat) + 1 } });
  const events: GameEvent[] = [];
  // CR 701.54a: another creature becoming the Ring-bearer ends the designation of the one before. The same creature stays it.
  for (const obj of Object.values(next.objects)) {
    if (obj.ringBearer === seat && obj.id !== picked) {
      next = setObject(next, withoutRingBearer(obj));
      if (obj.zone === 'battlefield') events.push({ kind: 'ringBearerLost', seat, object: obj.id });
    }
  }
  if (picked !== undefined) next = patchObject(next, picked, { ringBearer: seat });
  events.push({
    kind: 'ringTempted',
    seat,
    times: ringLevel(next, seat),
    bearer: picked ?? null,
    first,
  });
  return done(next, events);
}

/** The object without the designation (`patchObject` merges, so it could not remove the key, which the hash reads). */
function withoutRingBearer(obj: GameObject): GameObject {
  const { ringBearer: _gone, ...rest } = obj;
  return rest;
}

/**
 * CR 701.54a: a Ring-bearer stops being one when another player gains control of it. The check is made with the state-based actions, where the
 * durations of control effects are (D-189), so no moment of the change is missed. Returns null when nothing ended.
 */
export function endLostRingBearers(
  state: GameState,
): { readonly state: GameState; readonly events: GameEvent[] } | null {
  let next = state;
  const events: GameEvent[] = [];
  for (const obj of Object.values(state.objects)) {
    if (obj.ringBearer === undefined || obj.zone !== 'battlefield') continue;
    if (controllerOf(state, obj) === obj.ringBearer) continue;
    next = setObject(next, withoutRingBearer(obj));
    events.push({ kind: 'ringBearerLost', seat: obj.ringBearer, object: obj.id });
  }
  return events.length === 0 ? null : { state: next, events };
}

/**
 * The abilities of the Ring (CR 701.54c) that the events trigger, for the players the Ring has tempted enough times. Each belongs to the
 * player it is the Ring of (they control it), has no source and goes on the stack like any other (CR 603.3).
 */
export function findRingTriggers(state: GameState, events: readonly GameEvent[]): PendingTrigger[] {
  const found: PendingTrigger[] = [];
  for (const seatState of state.seats) {
    const level = seatState.ring?.tempted ?? 0;
    if (level < 2) continue;
    const seat = seatState.id;
    const bearer = ringBearerOf(state, seat);
    for (const e of events) {
      if (e.kind === 'attackersDeclared') {
        if (bearer === null || level < 2 || !e.attackers.some((a) => a.object === bearer.id)) {
          continue;
        }
        found.push(pending(seat, 'ringLoot', RING_LOOT_ABILITY, bearer.id));
      } else if (e.kind === 'blockersDeclared') {
        // CR 509.3d: "becomes blocked by a creature" triggers once for each creature that blocks it; the blocker is the subject.
        if (bearer === null || level < 3) continue;
        for (const b of e.blocks) {
          if (b.attacker === bearer.id) {
            found.push(pending(seat, 'ringBlocked', RING_BLOCKED_ABILITY, b.blocker));
          }
        }
      } else if (e.kind === 'damageDealt') {
        // CR 120.2a, 510.2: damage that was prevented entirely has no event, so it triggers nothing (CR 603.2g).
        if (
          bearer !== null &&
          level >= 4 &&
          e.combat &&
          e.amount > 0 &&
          e.to.kind === 'player' &&
          e.source === bearer.id
        ) {
          found.push(pending(seat, 'ringDamage', RING_DAMAGE_ABILITY, bearer.id));
        }
      }
    }
  }
  return found;
}

function pending(
  seat: SeatId,
  inherent: 'ringLoot' | 'ringBlocked' | 'ringDamage',
  ability: TriggeredAbility,
  subject: ObjectId,
): PendingTrigger {
  return { source: null, inherent, controller: seat, abilityIndex: -1, ability, subject };
}
