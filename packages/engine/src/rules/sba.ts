/**
 * State-based actions (CR 704). All applicable actions are found against the same state and then
 * performed together as one event (CR 704.3); the caller repeats until none apply (CR 117.5).
 *
 * Implemented: 704.5a life, 704.5b empty library draw, 704.5c poison, 704.5d tokens off the
 * battlefield, 704.5f toughness 0, 704.5g lethal damage, 704.5h deathtouch damage, 704.5q +1/+1
 * and -1/-1 counters, 704.5i planeswalker loyalty, 704.5w battle defense, 704.6c commander damage,
 * 704.6d / 903.9a commander to the command zone.
 * 704.5m an Aura attached to an illegal object or to nothing, 704.5n an Equipment attached to an
 * illegal permanent, 704.5p any other attached permanent (rules/attach.ts).
 * 704.5j the legend rule (rules/legend-rule.ts): a `choosePermanent` decision for the controller.
 * 704.5g, 704.5h a regeneration shield replaces the destruction (rules/regenerate.ts, CR 701.19a).
 * 704.5s a Saga with as many lore counters as its final chapter number is sacrificed once none of
 * its chapter abilities is waiting or on the stack (rules/saga.ts; CR 714.4).
 * Not yet: Siege battles (CR 704.5v, which involves a triggered ability), spell copies.
 */
import type { SeatId } from '../ids';
import type { NewDecision } from '../state/decisions';
import type { GameEvent, LossReason } from '../state/events';
import { getObject, getSeat, patchObject, patchSeat, removeFromZone } from '../state/ops';
import type { GameObject, GameState } from '../state/types';
import { illegalAttachments, illegalAuras, unattach } from './attach';
import { gainCitysBlessings } from './city-blessing';
import { controllerOf } from './control';
import { endLostControlEffects } from './control-effects';
import { derive } from './derive';
import { replacementSources } from './die-replacement';
import { type LegendCandidate, legendRuleDecision } from './legend-rule';
import { monarchAfterLoss } from './monarch';
import { cannotLoseGame } from './player-protection';
import { regenerateInstead } from './regenerate';
import { endLostRingBearers } from './ring';
import { sacrificePermanent } from './sacrifice';
import { sagaIsDone } from './saga';
import { moveObject } from './zones';

export interface SbaResult {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
  readonly performed: boolean;
  /**
   * A decision a player must make before checking continues: the owner's (CR 903.9a), or the
   * controller's choice among legendary duplicates (CR 704.5j).
   */
  readonly decision: NewDecision | null;
}

const COMMANDER_DAMAGE_LOSS = 21;

function hasIndestructible(state: GameState, obj: GameObject): boolean {
  return derive(state, obj).abilities.some(
    (a) => a.kind === 'keyword' && a.keyword.kind === 'indestructible',
  );
}

export function commanderDamageKey(seat: SeatId, card: string): string {
  return `${seat}:${card}`;
}

function lossReasons(state: GameState): Map<SeatId, LossReason> {
  const reasons = new Map<SeatId, LossReason>();
  for (const seat of state.seats) {
    if (seat.hasLost) continue;
    // CR 104.3 (D-149): "You can't lose the game": none of these state-based actions makes the player lose.
    if (cannotLoseGame(state, seat.id)) continue;
    if (seat.life <= 0)
      reasons.set(seat.id, 'life'); // CR 704.5a
    else if (seat.drewFromEmptyLibrary)
      reasons.set(seat.id, 'emptyLibrary'); // CR 704.5b
    else if (seat.poison >= 10)
      reasons.set(seat.id, 'poison'); // CR 704.5c
    else {
      for (const [key, dmg] of Object.entries(state.commanderDamage)) {
        // CR 704.6c: 21 or more combat damage from the same commander.
        if (key.startsWith(`${seat.id}:`) && dmg >= COMMANDER_DAMAGE_LOSS) {
          reasons.set(seat.id, 'commanderDamage');
          break;
        }
      }
    }
  }
  return reasons;
}

export function checkStateBasedActions(input: GameState): SbaResult {
  const events: GameEvent[] = [];
  let state = input;
  let performed = false;

  // CR 611.2b (D-189): a control effect that lasts "for as long as you control this" ends for good as that stops being so. The state it leaves
  // behind (who controls what) is what everything below looks at, so the check is made again at once.
  const lostControl = endLostControlEffects(state);
  if (lostControl !== null) {
    return {
      state: lostControl.state,
      events: lostControl.events,
      performed: true,
      decision: null,
    };
  }

  // CR 701.54a (D-196): a creature stops being a player's Ring-bearer when another player gains control of it.
  const lostBearer = endLostRingBearers(state);
  if (lostBearer !== null) {
    return {
      state: lostBearer.state,
      events: lostBearer.events,
      performed: true,
      decision: null,
    };
  }

  // CR 702.131b (D-ASCEND): Ascend, "any time you control ten or more permanents", is checked here; the next pass goes on with the new state.
  const blessed = gainCitysBlessings(state);
  if (blessed !== null) {
    return { state: blessed.state, events: blessed.events, performed: true, decision: null };
  }

  // 1. Find everything against the unchanged state (CR 704.3).
  const losses = lossReasons(state);
  const toGraveyard: GameObject[] = []; // CR 704.5f, not a destruction
  const destroyed: GameObject[] = []; // CR 704.5g, 704.5h
  const cease: GameObject[] = []; // CR 704.5d
  const annihilate: GameObject[] = []; // CR 704.5q
  const fallenAuras = illegalAuras(state); // CR 704.5m
  const unattached = illegalAttachments(state); // CR 704.5n, 704.5p
  const legendary: LegendCandidate[] = []; // CR 704.5j
  const finishedSagas: GameObject[] = []; // CR 704.5s

  for (const obj of Object.values(state.objects)) {
    // CR 704.5d: a token in a zone other than the battlefield; an emblem is not one of those tokens, it stays in the command zone (CR 114.5, D-201).
    if (obj.token && obj.zone !== 'battlefield' && obj.emblem !== true) cease.push(obj);
    if (obj.zone !== 'battlefield') continue;
    const d = derive(state, obj);
    if (d.supertypes.includes('legendary')) legendary.push({ object: obj, name: d.name });
    if (d.types.includes('creature') && d.toughness !== null) {
      if (d.toughness <= 0) toGraveyard.push(obj);
      else if (
        // CR 704.5g, 704.5h: lethal damage, or any damage from a deathtouch source. Damage from a
        // source with wither or infect is not marked (CR 120.3d) but is still damage dealt, so the flag
        // alone says it was dealt.
        (obj.damage >= d.toughness || obj.damagedByDeathtouch) &&
        !hasIndestructible(state, obj)
      ) {
        destroyed.push(obj);
      }
    }
    if (sagaIsDone(state, obj, d)) finishedSagas.push(obj);
    if ((obj.counters['+1/+1'] ?? 0) > 0 && (obj.counters['-1/-1'] ?? 0) > 0) annihilate.push(obj);
    // CR 704.5i: a planeswalker with loyalty 0 is put into its owner's graveyard.
    if (d.types.includes('planeswalker') && (obj.counters.loyalty ?? 0) === 0)
      toGraveyard.push(obj);
    // CR 704.5w: a non-Siege battle with defense 0 is put into its owner's graveyard.
    if (
      d.types.includes('battle') &&
      !d.subtypes.includes('Siege') &&
      (obj.counters.defense ?? 0) === 0
    ) {
      toGraveyard.push(obj);
    }
  }

  // 2. Perform them together.
  for (const [seat, reason] of losses) {
    state = patchSeat(state, seat, { hasLost: true, drewFromEmptyLibrary: false });
    events.push({ kind: 'playerLost', seat, reason });
    performed = true;
  }
  if (losses.size > 0) {
    // CR 725.4 (D-127): a monarch who left the game hands the designation on as they leave.
    const handed = monarchAfterLoss(state);
    state = handed.state;
    events.push(...handed.events);
  }
  const clearFlag = state.seats.filter((s) => s.drewFromEmptyLibrary);
  for (const s of clearFlag) state = patchSeat(state, s.id, { drewFromEmptyLibrary: false });
  if (clearFlag.length > 0) performed = true;

  const order = (a: GameObject, b: GameObject) => a.timestamp - b.timestamp;
  // CR 704.3, 614.12 (D-133): the creatures put into graveyards in this check die together, so a "would die" replacement of
  // one of them replaces the deaths of the others even if it was moved first.
  const replacers = replacementSources(state);
  // CR 704.5m: an Aura is put into the graveyard, not destroyed; the creature it enchanted may be
  // dying in the same check, which the next pass of the caller's loop settles.
  for (const obj of [...toGraveyard, ...fallenAuras, ...destroyed].sort(order)) {
    // CR 701.19a, 704.5g (D-120): a regeneration shield replaces the destruction by lethal damage or
    // deathtouch with: remove the damage, tap it, remove it from combat. Only a destruction is replaced,
    // not a creature put into a graveyard for 0 toughness (CR 704.5f) or an Aura (CR 704.5m).
    const regenerated = destroyed.includes(obj) ? regenerateInstead(state, obj.id) : null;
    if (regenerated !== null) {
      state = regenerated.state;
      events.push(...regenerated.events);
      performed = true;
      continue;
    }
    const result = moveObject(state, { object: obj.id, to: 'graveyard', replacers });
    if (result.kind === 'done') {
      state = result.state;
      events.push(...result.events);
      performed = true;
    }
  }
  // CR 704.5s, 701.21a: the Saga's controller sacrifices it (so it is a sacrifice, not a death by
  // destruction, and indestructible does not matter). One that left in this check is skipped.
  for (const obj of finishedSagas.sort(order)) {
    const sacrificed = sacrificePermanent(state, obj.id, controllerOf(state, obj));
    if (sacrificed === null) continue;
    state = sacrificed.state;
    events.push(...sacrificed.events);
    performed = true;
  }
  for (const { object, from, reason } of unattached) {
    if (state.objects[object.id] === undefined) continue; // it left in the same check
    const r = unattach(state, object.id, from, reason);
    state = r.state;
    events.push(...r.events);
    performed = true;
  }
  for (const obj of cease) {
    const current = state.objects[obj.id];
    if (!current) continue;
    state = removeFromZone(state, current);
    const { [obj.id]: _gone, ...rest } = state.objects;
    state = { ...state, objects: rest };
    performed = true;
  }
  for (const obj of annihilate) {
    const current = state.objects[obj.id];
    if (!current) continue;
    const plus = current.counters['+1/+1'] ?? 0;
    const minus = current.counters['-1/-1'] ?? 0;
    const n = Math.min(plus, minus);
    state = patchObject(state, obj.id, {
      counters: { ...current.counters, '+1/+1': plus - n, '-1/-1': minus - n },
    });
    events.push({ kind: 'counterRemoved', object: obj.id, counter: '+1/+1', count: n });
    events.push({ kind: 'counterRemoved', object: obj.id, counter: '-1/-1', count: n });
    performed = true;
  }

  // 3. CR 704.5j: the legend rule is a choice, asked when nothing else was performed in this check;
  // the caller checks again after the answer. Then CR 903.9a: a commander that went to a graveyard
  // or exile since the last check. Entries that put a commander there during step 2 are handled on
  // the next iteration.
  if (!performed) {
    const duplicates = legendRuleDecision(state, legendary);
    if (duplicates !== null) return { state, events, performed: false, decision: duplicates };
    const live = state.commanderWatch.filter((id) => {
      const o = state.objects[id];
      return o !== undefined && (o.zone === 'graveyard' || o.zone === 'exile');
    });
    if (live.length !== state.commanderWatch.length) {
      state = { ...state, commanderWatch: live };
    }
    const first = live[0];
    if (first !== undefined) {
      const obj = getObject(state, first);
      return {
        state,
        events,
        performed: false,
        decision: {
          kind: 'commanderZone',
          seat: obj.owner,
          card: obj.card as NonNullable<typeof obj.card>,
          object: obj.id,
          from: obj.zone === 'exile' ? 'exile' : 'graveyard',
        },
      };
    }
  }
  return { state, events, performed, decision: null };
}

/**
 * Ends the game when at most one seat remains (CR 104.2a, 104.3). If every remaining seat lost at
 * once the game is a draw (CR 104.4a; SPEC A14 states it for any number of seats).
 */
export function evaluateGameEnd(state: GameState): {
  state: GameState;
  events: readonly GameEvent[];
} {
  if (state.result) return { state, events: [] };
  const alive = state.seats.filter((s) => !getSeat(state, s.id).hasLost);
  if (alive.length >= 2) return { state, events: [] };
  if (alive.length === 0) {
    return {
      state: { ...state, result: { kind: 'draw' }, pending: null },
      events: [{ kind: 'gameEnded', result: 'draw', winner: null }],
    };
  }
  const winner = (alive[0] as NonNullable<(typeof alive)[0]>).id;
  return {
    state: { ...state, result: { kind: 'win', winner }, pending: null },
    events: [{ kind: 'gameEnded', result: 'win', winner }],
  };
}
