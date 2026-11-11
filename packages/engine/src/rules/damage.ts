/**
 * Dealing damage (CR 120). One function for every damage event, so spells and combat agree.
 *
 * Results of damage (CR 120.3): a player loses that much life, or, from a source with infect, gets that
 * many poison counters (CR 120.3a, 120.3b, 702.90b); a planeswalker loses that many loyalty counters; a
 * battle loses that many defense counters; a creature has the damage marked on it, or, from a source
 * with wither or infect, gets that many -1/-1 counters (CR 120.3d, 120.3e, 702.80a, 702.90c). Combat
 * damage dealt to a player by a creature with toxic also gives that player poison counters (CR 120.3g,
 * 702.164c). Damage from a source with lifelink also gains its controller that much life (CR 120.3f,
 * 702.15b). Combat damage a commander deals to a player is tracked for the 21-damage rule
 * (CR 903.10a, 704.6c). Deathtouch is remembered on the creature for CR 704.5h. The prevention effects (CR 615) and the redirection
 * effects (CR 614.9) take their part first, in the order of `damage-order.ts` (CR 616.1): the damage is then dealt to the recipient they leave.
 */
import type { Ability } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import type { DamageRecipient } from '../state/combat-types';
import type { GameEvent } from '../state/events';
import { getSeat, loseLifeBy, patchObject, patchSeat } from '../state/ops';
import type { GameObject, GameState } from '../state/types';
import { controllerOf } from './control';
import { type Asked, type OrderFlow, quietFlow, settleDamage } from './damage-order';
import { derive } from './derive';
import { abilitiesHaveKeyword } from './keywords';
import { gainLife } from './life-gain';
import { hasProtectionFrom } from './protection';
import { commanderDamageKey } from './sba';

interface SourceInfo {
  readonly controller: SeatId;
  readonly deathtouch: boolean;
  readonly lifelink: boolean;
  /** Infect (CR 702.90): poison counters instead of life loss, -1/-1 counters instead of marked damage. */
  readonly infect: boolean;
  /** Wither (CR 702.80a): -1/-1 counters instead of marked damage on a creature. */
  readonly wither: boolean;
  /** The creature's total toxic value (CR 702.164b): the sum of its toxic N values. */
  readonly toxic: number;
  /** The commander card, when the source is a commander (CR 903.10a). */
  readonly commanderCard: string | null;
}

/** CR 702.164b: a creature's total toxic value is the sum of the N values of its toxic abilities. */
function toxicValue(abilities: readonly Ability[]): number {
  let total = 0;
  for (const a of abilities)
    if (a.kind === 'keyword' && a.keyword.kind === 'toxic') total += a.keyword.count;
  return total;
}

/** The source as it is now, or as it last existed if it has left (CR 113.7a, 608.2h). */
function sourceInfo(state: GameState, source: ObjectId): SourceInfo | null {
  const live = state.objects[source];
  const obj = live ?? state.lki[source]?.object;
  if (!obj) return null;
  const abilities = live ? derive(state, live).abilities : (state.lki[source]?.abilities ?? []);
  const card = obj.card;
  return {
    controller: controllerOf(state, obj),
    deathtouch: abilitiesHaveKeyword(abilities, 'deathtouch'),
    lifelink: abilitiesHaveKeyword(abilities, 'lifelink'),
    infect: abilitiesHaveKeyword(abilities, 'infect'),
    wither: abilitiesHaveKeyword(abilities, 'wither'),
    toxic: toxicValue(abilities),
    commanderCard: card !== null && state.cards[card]?.isCommander ? card : null,
  };
}

/**
 * Damage that is lethal to a creature (CR 120.6, 702.2c): its toughness less the damage marked on it, 0 when that is already lethal;
 * from a source with deathtouch any damage above 0 is lethal, so 1 while it has any toughness left. The amount trample and "excess
 * damage" count (CR 702.19b), not what abilities or effects might change.
 */
export function lethalDamageTo(
  state: GameState,
  creature: GameObject,
  deathtouch: boolean,
): number {
  const toughness = derive(state, creature).toughness ?? 0;
  const remaining = Math.max(0, toughness - creature.damage);
  return deathtouch && remaining > 0 ? 1 : remaining;
}

/** Damage that was dealt: the state after it and what happened. */
export interface Dealt {
  readonly kind: 'dealt';
  readonly state: GameState;
  readonly events: GameEvent[];
}

/**
 * "Excess damage is dealt to that creature's controller instead" (D-145, CR 702.19b, 120.3): `source` deals `amount` to the creature
 * `target`: the lethal part to the creature and the rest to its controller, two damage events by the same source (a prevention effect,
 * lifelink and deathtouch apply to each). Whether the source has trample is the caller's question: this does the split. As every
 * damage event it may ask the affected player which prevention effect to apply first (`flow`, D-191); the answer is the question
 * returned, with nothing dealt.
 */
export function dealDamageWithExcess(
  input: GameState,
  source: ObjectId,
  target: GameObject,
  amount: number,
  flow: OrderFlow,
): Dealt | Asked {
  const deathtouch = sourceInfo(input, source)?.deathtouch === true;
  const lethal = lethalDamageTo(input, target, deathtouch);
  const toCreature = Math.min(amount, lethal);
  const first = dealDamageAsking(
    input,
    source,
    { kind: 'object', id: target.id },
    toCreature,
    false,
    flow,
  );
  if (first.kind === 'asked') return first;
  const second = dealDamageAsking(
    first.state,
    source,
    { kind: 'player', seat: controllerOf(input, target) },
    amount - lethal,
    false,
    flow,
  );
  if (second.kind === 'asked') return second;
  return { kind: 'dealt', state: second.state, events: [...first.events, ...second.events] };
}

/** One damage event, with the default order of the prevention effects and no question (the rider of a mana ability, a test). */
export function dealDamage(
  input: GameState,
  source: ObjectId,
  to: DamageRecipient,
  wouldDeal: number,
  combat: boolean,
): { state: GameState; events: GameEvent[] } {
  const r = dealDamageAsking(input, source, to, wouldDeal, combat, quietFlow());
  if (r.kind === 'asked')
    throw new Error('A damage event asked a question with a flow that never asks');
  return { state: r.state, events: r.events };
}

/**
 * One damage event (CR 120.3), the one function for all damage. The prevention effects that apply are settled first (CR 616.1,
 * `damage-order.ts`): when their order matters the affected player is asked, through `flow`, and the question comes back with nothing
 * dealt; the caller keeps the answers and deals the same damage again.
 */
export function dealDamageAsking(
  input: GameState,
  source: ObjectId,
  wouldDealTo: DamageRecipient,
  wouldDeal: number,
  combat: boolean,
  flow: OrderFlow,
): Dealt | Asked {
  if (wouldDeal <= 0) return { kind: 'dealt', state: input, events: [] };
  // CR 702.16e (D-229): damage that would be dealt to a permanent with protection from a color of the source is prevented. It is applied before the
  // other prevention effects (CR 616.1: the affected player chooses the order; taking protection first keeps a shield for later and never costs them).
  if (wouldDealTo.kind === 'object') {
    const target = input.objects[wouldDealTo.id];
    if (target !== undefined && hasProtectionFrom(input, target, source)) {
      return { kind: 'dealt', state: input, events: [] };
    }
  }
  // CR 615.1, 615.6: prevention shields apply as the damage would be dealt; what they prevent never
  // happens, so none of the results below (life, marked damage, lifelink, commander damage) follow.
  // CR 614.9 (D-192): a redirection effect makes the recipient another one: everything below is then the result for that recipient (CR 120.3).
  const shielded = settleDamage(
    input,
    { source, to: wouldDealTo, amount: wouldDeal, combat },
    flow,
  );
  if (shielded.kind === 'asked') return shielded;
  const amount = shielded.remaining;
  const to = shielded.to;
  if (amount <= 0) return { kind: 'dealt', state: shielded.state, events: [...shielded.events] };
  const info = sourceInfo(shielded.state, source);
  let state = shielded.state;
  const events: GameEvent[] = [
    ...shielded.events,
    { kind: 'damageDealt', source, to, amount, combat },
  ];

  if (to.kind === 'player') {
    // D-139: "whose controller was dealt combat damage by this creature this turn".
    if (combat) {
      state = {
        ...state,
        turnLog: {
          ...state.turnLog,
          combatDamaged: [...state.turnLog.combatDamaged, { source, player: to.seat }],
        },
      };
    }
    // D-151, CR 120.3: the damage each player has been dealt this turn ("an opponent was dealt 7 or more damage this turn").
    const taken = [...state.turnLog.damageTaken];
    for (let i = taken.length; i < state.seats.length; i += 1) taken[i] = 0;
    taken[to.seat] = (taken[to.seat] ?? 0) + amount;
    state = { ...state, turnLog: { ...state.turnLog, damageTaken: taken } };
    const seat = getSeat(state, to.seat);
    if (info?.infect === true) {
      // CR 120.3b, 702.90b: the damage gives poison counters instead of causing life loss.
      state = patchSeat(state, to.seat, { poison: seat.poison + amount });
      events.push({
        kind: 'poisonChanged',
        seat: to.seat,
        from: seat.poison,
        to: seat.poison + amount,
      });
    } else {
      state = loseLifeBy(state, to.seat, amount);
      events.push({ kind: 'lifeChanged', seat: to.seat, from: seat.life, to: seat.life - amount });
    }
    if (combat && info !== null && info.toxic > 0) {
      // CR 120.3g, 702.164c: combat damage from a creature with toxic gives poison counters as well.
      const now = getSeat(state, to.seat).poison;
      state = patchSeat(state, to.seat, { poison: now + info.toxic });
      events.push({ kind: 'poisonChanged', seat: to.seat, from: now, to: now + info.toxic });
    }
    if (combat && info?.commanderCard) {
      const key = commanderDamageKey(to.seat, info.commanderCard);
      state = {
        ...state,
        commanderDamage: {
          ...state.commanderDamage,
          [key]: (state.commanderDamage[key] ?? 0) + amount,
        },
      };
    }
  } else {
    const obj = state.objects[to.id];
    if (obj && obj.zone === 'battlefield') {
      const types = derive(state, obj).types;
      const counters = { ...obj.counters };
      let damage = obj.damage;
      let damagedByDeathtouch = obj.damagedByDeathtouch;
      if (types.includes('creature')) {
        if (info?.infect === true || info?.wither === true) {
          // CR 120.3d, 702.80a, 702.90c: -1/-1 counters, not marked damage. They are put on at once and
          // are not damage, so lethal damage (CR 704.5g) does not count them; toughness does.
          counters['-1/-1'] = (counters['-1/-1'] ?? 0) + amount;
          events.push({ kind: 'counterAdded', object: to.id, counter: '-1/-1', count: amount });
        } else {
          // CR 120.3e: damage is marked on a creature.
          damage += amount;
        }
        // CR 702.2b, 704.5h: any damage from a deathtouch source, marked or not, is lethal.
        if (info?.deathtouch) damagedByDeathtouch = true;
      }
      if (types.includes('planeswalker')) {
        // CR 120.3c: damage to a planeswalker removes that many loyalty counters.
        const removed = Math.min(amount, counters.loyalty ?? 0);
        counters.loyalty = (counters.loyalty ?? 0) - removed;
        if (removed > 0) {
          events.push({
            kind: 'counterRemoved',
            object: to.id,
            counter: 'loyalty',
            count: removed,
          });
        }
      }
      if (types.includes('battle')) {
        // CR 120.3h: damage to a battle removes that many defense counters.
        const removed = Math.min(amount, counters.defense ?? 0);
        counters.defense = (counters.defense ?? 0) - removed;
        if (removed > 0) {
          events.push({
            kind: 'counterRemoved',
            object: to.id,
            counter: 'defense',
            count: removed,
          });
        }
      }
      state = patchObject(state, to.id, { damage, damagedByDeathtouch, counters });
    }
  }

  if (info?.lifelink) {
    // CR 120.3f, 702.15b: the source's controller gains that much life.
    const gained = gainLife(state, info.controller, amount);
    state = gained.state;
    events.push(...gained.events);
  }
  return { kind: 'dealt', state, events };
}
