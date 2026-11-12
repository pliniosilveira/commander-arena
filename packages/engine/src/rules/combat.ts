/**
 * Combat: declaring attackers and blockers, planning and dealing combat damage (CR 506-511).
 *
 * Damage assignment follows CR 510.1 as amended by the Foundations update: an attacker blocked by
 * several creatures divides its damage among them as its controller chooses (CR 510.1c); lethal
 * damage matters only for trample (CR 702.19b), where any nonzero deathtouch damage counts as lethal
 * (CR 702.2c). First strike and double strike add a first damage step (CR 510.4).
 */
import type { ObjectId, SeatId } from '../ids';
import type {
  AttackTarget,
  DamageAssignment,
  DamageChoice,
  DamageRecipient,
} from '../state/combat-types';
import type { GameEvent } from '../state/events';
import { getObject, patchObject } from '../state/ops';
import type { AttackerState, CombatState, GameObject, GameState } from '../state/types';
import { type Dealt, dealDamageAsking, lethalDamageTo } from './damage';
import type { Asked, OrderFlow } from './damage-order';
import { attackedTarget, defenderRecord } from './defending';
import { derive } from './derive';
import { hasKeyword } from './keywords';

export type DamageStep = 'firstStrike' | 'regular';

export interface DamagePlan {
  /** Assignments with no choice: unblocked attackers, single blockers, blockers hitting attackers. */
  readonly auto: readonly DamageAssignment[];
  /** Assignments the active player must decide (CR 510.1c, 702.19b). */
  readonly choices: readonly DamageChoice[];
}

function liveCreature(state: GameState, id: ObjectId): GameObject | null {
  const obj = state.objects[id];
  if (obj?.zone !== 'battlefield') return null;
  return derive(state, obj).types.includes('creature') ? obj : null;
}

/** CR 508.1f-k: tap the attackers (unless vigilance, CR 702.20b) and record the combat. */
export function declareAttackers(
  input: GameState,
  seat: SeatId,
  attacks: readonly { attacker: ObjectId; target: AttackTarget }[],
): { state: GameState; events: GameEvent[] } {
  let state = input;
  const events: GameEvent[] = [];
  for (const a of attacks) {
    const obj = getObject(state, a.attacker);
    if (!hasKeyword(state, obj, 'vigilance') && !obj.tapped) {
      state = patchObject(state, a.attacker, { tapped: true });
      events.push({ kind: 'tapped', object: a.attacker });
    }
  }
  if (attacks.length === 0) return { state: { ...state, combat: null }, events };
  const combat: CombatState = {
    attackers: attacks.map((a) => ({
      object: a.attacker,
      target: a.target,
      blocked: false,
      // CR 508.5 (D-200): the defending player of an attacker of a planeswalker or battle is who controls or protects it as it is declared.
      ...(a.target.kind === 'permanent' ? defenderRecord(state, a.target) : {}),
    })),
    blocks: [],
    firstStrikers: null,
  };
  // D-151: "attacks for the first time each turn" reads how many times each creature was declared as an attacker this turn.
  state = {
    ...state,
    turnLog: {
      ...state.turnLog,
      attacked: [...state.turnLog.attacked, ...attacks.map((a) => a.attacker)],
      // CR 508.6 (D-921): only an attack on a player is an attack on that player; one on a planeswalker or a battle is not.
      attackedPlayers: [
        ...state.turnLog.attackedPlayers,
        ...attacks.flatMap((a) =>
          a.target.kind === 'player' ? [{ attacker: a.attacker, player: a.target.seat }] : [],
        ),
      ],
    },
  };
  events.push({
    kind: 'attackersDeclared',
    seat,
    attackers: attacks.map((a) => ({ object: a.attacker, target: a.target })),
  });
  return { state: { ...state, combat }, events };
}

/** CR 509.1g-h: blockers become blocking; an attacker with a blocker becomes blocked. */
export function declareBlockers(
  state: GameState,
  seat: SeatId,
  blocks: readonly { blocker: ObjectId; attacker: ObjectId }[],
): { state: GameState; events: GameEvent[] } {
  const combat = state.combat;
  if (!combat || blocks.length === 0) return { state, events: [] };
  const blocked = new Set(blocks.map((b) => b.attacker));
  const attackers: AttackerState[] = combat.attackers.map((a) =>
    blocked.has(a.object) ? { ...a, blocked: true } : a,
  );
  return {
    state: { ...state, combat: { ...combat, attackers, blocks: [...combat.blocks, ...blocks] } },
    events: [{ kind: 'blockersDeclared', seat, blocks }],
  };
}

function attackersInCombat(state: GameState): AttackerState[] {
  return (state.combat?.attackers ?? []).filter((a) => liveCreature(state, a.object) !== null);
}

/** Blocking creatures still in combat, with the attacker each blocks (CR 506.4). */
function blocksInCombat(state: GameState): { blocker: ObjectId; attacker: ObjectId }[] {
  const attackers = new Set(attackersInCombat(state).map((a) => a.object));
  return (state.combat?.blocks ?? []).filter(
    (b) => liveCreature(state, b.blocker) !== null && attackers.has(b.attacker),
  );
}

function hasFirstOrDoubleStrike(state: GameState, obj: GameObject): boolean {
  return hasKeyword(state, obj, 'firstStrike') || hasKeyword(state, obj, 'doubleStrike');
}

/** The creatures in combat that have first strike or double strike right now (CR 510.4). */
export function firstStrikersNow(state: GameState): ObjectId[] {
  const ids = [
    ...attackersInCombat(state).map((a) => a.object),
    ...blocksInCombat(state).map((b) => b.blocker),
  ];
  return ids.filter((id) => hasFirstOrDoubleStrike(state, getObject(state, id)));
}

/** CR 510.4: does the combat phase get a first-strike damage step? Checked as damage begins. */
export function needsFirstStrikeStep(state: GameState): boolean {
  return firstStrikersNow(state).length > 0;
}

/** Records who had first strike or double strike as the first damage step begins (CR 510.4). */
export function beginFirstStrikeStep(state: GameState): GameState {
  const combat = state.combat;
  if (!combat) return state;
  return { ...state, combat: { ...combat, firstStrikers: firstStrikersNow(state) } };
}

function eligible(state: GameState, obj: GameObject, step: DamageStep): boolean {
  const combat = state.combat;
  if (step === 'firstStrike') return hasFirstOrDoubleStrike(state, obj);
  // The regular step after a first-strike step: creatures that had neither at the first step, plus
  // creatures that currently have double strike (CR 510.4). With no first-strike step: everyone.
  if (!combat || combat.firstStrikers === null) return true;
  return !combat.firstStrikers.includes(obj.id) || hasKeyword(state, obj, 'doubleStrike');
}

function recipientOf(state: GameState, target: AttackTarget): DamageRecipient | null {
  if (target.kind === 'player') {
    return state.seats[target.seat]?.hasLost ? null : { kind: 'player', seat: target.seat };
  }
  const obj = state.objects[target.object];
  return obj && obj.zone === 'battlefield' ? { kind: 'object', id: target.object } : null;
}

/** CR 510.1: what each creature assigns now, and which assignments need a decision. */
export function buildDamagePlan(state: GameState, step: DamageStep): DamagePlan {
  const auto: DamageAssignment[] = [];
  const choices: DamageChoice[] = [];
  const blocks = blocksInCombat(state);

  for (const attacker of attackersInCombat(state)) {
    const obj = getObject(state, attacker.object);
    if (!eligible(state, obj, step)) continue;
    const power = derive(state, obj).power ?? 0;
    if (power <= 0) continue; // CR 510.1a
    // CR 506.4, 506.4c (D-200): an attacker whose planeswalker or battle was removed from combat attacks nothing and deals no damage to it.
    const attacked = attackedTarget(state, attacker);
    const target = attacked === null ? null : recipientOf(state, attacked);
    const blockers = blocks.filter((b) => b.attacker === attacker.object).map((b) => b.blocker);

    if (!attacker.blocked) {
      // CR 510.1b: an unblocked creature assigns its damage to what it is attacking.
      if (target) auto.push({ source: attacker.object, to: target, amount: power });
      continue;
    }
    const trample = hasKeyword(state, obj, 'trample');
    if (blockers.length === 0) {
      // CR 702.19d: a blocked trampler with no blockers left assigns everything to what it attacks.
      if (trample && target) auto.push({ source: attacker.object, to: target, amount: power });
      continue;
    }
    const deathtouch = hasKeyword(state, obj, 'deathtouch');
    const lethal = blockers.map((id) => ({
      object: id,
      lethal: lethalDamageTo(state, getObject(state, id), deathtouch),
    }));
    const single = lethal[0];
    if (blockers.length === 1 && single && (!trample || power <= single.lethal)) {
      // CR 510.1c: exactly one blocker gets all of it (a trampler with no excess has no choice either).
      auto.push({
        source: attacker.object,
        to: { kind: 'object', id: single.object },
        amount: power,
      });
      continue;
    }
    choices.push({
      source: attacker.object,
      power,
      deathtouch,
      trample,
      blockers: lethal,
      tramplesOver: trample ? target : null,
    });
  }

  // CR 510.1d: a blocker assigns all its damage to the creature it blocks.
  for (const b of blocks) {
    const obj = getObject(state, b.blocker);
    if (!eligible(state, obj, step)) continue;
    const power = derive(state, obj).power ?? 0;
    if (power > 0)
      auto.push({ source: b.blocker, to: { kind: 'object', id: b.attacker }, amount: power });
  }
  return { auto, choices };
}

/** Returns an error message, or null when the chosen division is legal (CR 510.1e, 702.19b). */
export function validateAssignments(
  choices: readonly DamageChoice[],
  assignments: readonly DamageAssignment[],
): string | null {
  for (const a of assignments) {
    if (!choices.some((c) => c.source === a.source)) return 'That creature has no choice to make';
    if (!Number.isInteger(a.amount) || a.amount < 0) return 'Damage must be a whole number';
  }
  for (const choice of choices) {
    const mine = assignments.filter((a) => a.source === choice.source);
    if (mine.reduce((sum, a) => sum + a.amount, 0) !== choice.power) {
      return `Assign exactly ${choice.power} damage from each creature`;
    }
    const toBlockers = new Map<ObjectId, number>();
    let toTarget = 0;
    for (const a of mine) {
      if (
        a.to.kind === 'object' &&
        choice.blockers.some((b) => b.object === (a.to as { id: ObjectId }).id)
      ) {
        const id = (a.to as { id: ObjectId }).id;
        toBlockers.set(id, (toBlockers.get(id) ?? 0) + a.amount);
      } else if (choice.tramplesOver && sameRecipient(a.to, choice.tramplesOver)) {
        toTarget += a.amount;
      } else {
        return 'Damage can only go to the blockers, or with trample to what the creature attacks';
      }
    }
    // CR 702.19b: excess goes past the blockers only once every blocker has been assigned lethal.
    if (toTarget > 0) {
      const allLethal = choice.blockers.every((b) => (toBlockers.get(b.object) ?? 0) >= b.lethal);
      if (!allLethal) return 'Assign lethal damage to every blocker before trampling over';
    }
  }
  return null;
}

function sameRecipient(a: DamageRecipient, b: DamageRecipient): boolean {
  return a.kind === 'player'
    ? b.kind === 'player' && a.seat === b.seat
    : b.kind === 'object' && a.id === b.id;
}

/** CR 510.2: all assigned combat damage is dealt simultaneously. */
export function dealCombatDamage(
  input: GameState,
  assignments: readonly DamageAssignment[],
  flow: OrderFlow,
): Dealt | Asked {
  let state = input;
  const events: GameEvent[] = [];
  for (const a of assignments) {
    if (a.amount <= 0) continue;
    // D-191: an event whose prevention effects can be applied in an order that matters asks first; nothing of the batch has been dealt
    // then (the caller deals it all again with the answer), so the batch stays simultaneous and no trigger is collected in the middle of it.
    const r = dealDamageAsking(state, a.source, a.to, a.amount, true, flow);
    if (r.kind === 'asked') return r;
    state = r.state;
    events.push(...r.events);
  }
  return { kind: 'dealt', state, events };
}

/** The combat phase ends: everything is removed from combat (CR 511.3). */
export function endCombat(state: GameState): GameState {
  return state.combat === null ? state : { ...state, combat: null };
}
