/**
 * Who may attack, what they may attack, and who may block what (CR 506-509).
 *
 * Implemented restrictions: only untapped creatures that are not battles may attack or block
 * (CR 508.1a, 509.1a); an attacker needs haste or must have been controlled since its controller's
 * turn began (CR 302.6, 702.10b); defender (CR 702.3b); flying and reach (CR 702.9b, 702.17b);
 * menace (CR 702.111b). Restrictions and requirements (D-094): "can't block" and "can't be blocked"
 * (CR 509.1b), the evasion keywords landwalk, fear, intimidate, shadow and skulk (CR 702.14,
 * 702.36, 702.13, 702.28, 702.118), and "attacks each combat if able" (CR 508.1d). The cost of attacking ("can't attack you unless their
 * controller pays", CR 508.1h, D-125) is read in `attack-tax.ts`, the cost of blocking (CR 509.1d) in
 * `block-tax.ts`.
 */
import type { ObjectId, SeatId } from '../ids';
import type { AttackTarget } from '../state/combat-types';
import { getObject } from '../state/ops';
import type { ContinuousEffect, GameObject, GameState } from '../state/types';
import { attackTargets } from './attack-targets';
import { payableAttackTax, untaxedTargets } from './attack-tax';
import { payableBlockTax } from './block-tax';
import { controllerOf } from './control';
import { attackerDefender } from './defending';
import { derive } from './derive';
import { abilitiesHaveKeyword, hasKeyword } from './keywords';
import { isSummoningSick } from './mana-engine';
import { hasProtectionFrom } from './protection';
import { hasRestriction } from './restrictions';
import { ringBearerSeat } from './ring-bearer';
import { matchesFilter } from './select';

function isLiveCreature(state: GameState, obj: GameObject | undefined): obj is GameObject {
  return (
    obj !== undefined && obj.zone === 'battlefield' && derive(state, obj).types.includes('creature')
  );
}

/** CR 508.1a, 702.3b: can this creature be declared as an attacker by `seat` now? */
export function canAttack(state: GameState, obj: GameObject, seat: SeatId): boolean {
  if (!isLiveCreature(state, obj) || controllerOf(state, obj) !== seat || obj.tapped) return false;
  if (derive(state, obj).types.includes('battle')) return false;
  if (hasKeyword(state, obj, 'defender')) return false;
  // D-145: "can't attack" (a static ability, a `restrict` effect, "unless you control ...").
  if (hasRestriction(state, obj, 'cantAttack')) return false;
  return !isSummoningSick(state, obj);
}

export function attackCandidates(
  state: GameState,
  seat: SeatId,
): { attacker: ObjectId; targets: AttackTarget[] }[] {
  const targets = attackTargets(state, seat);
  if (targets.length === 0) return [];
  return state.battlefield
    .filter((id) => canAttack(state, getObject(state, id), seat))
    .map((attacker) => ({ attacker, targets: narrowedTargets(state, attacker, targets) }));
}

/** The group requirements ("creatures your opponents control attack each combat if able", D-179) that name `obj` as one of their creatures now. */
function groupRequirements(
  state: GameState,
  obj: GameObject,
): Extract<ContinuousEffect['change'], { kind: 'requireAttack' }>[] {
  const found: Extract<ContinuousEffect['change'], { kind: 'requireAttack' }>[] = [];
  for (const e of state.continuousEffects) {
    if (e.change.kind !== 'requireAttack') continue;
    const ctx = { controller: e.change.controller, source: null };
    if (matchesFilter(state, obj, { ...e.change.filter, zone: 'battlefield' }, ctx)) {
      found.push(e.change);
    }
  }
  return found;
}

/**
 * CR 508.1d (D-179): "and attack a player other than you if able": a creature under such a requirement that is able to attack a player other than
 * the controller of the effect attacks one, so only those players are left among its targets. When every player it could attack is that
 * controller (two players), the requirement cannot be obeyed and changes nothing; planeswalkers and battles are not players.
 */
function narrowedTargets(
  state: GameState,
  attacker: ObjectId,
  targets: AttackTarget[],
): AttackTarget[] {
  // CR 508.1d (D-185): "attacks that opponent this turn if able" (Encore): a creature that can attack that player attacks that player.
  const forced = playersToAttack(state, attacker);
  if (forced.length > 0) {
    const wanted = targets.filter((t) => t.kind === 'player' && forced.includes(t.seat));
    if (wanted.length > 0) return wanted;
  }
  const away = groupRequirements(state, getObject(state, attacker)).flatMap((r) =>
    r.awayFrom === undefined ? [] : [r.awayFrom],
  );
  if (away.length === 0) return targets;
  const others = targets.filter((t) => t.kind === 'player' && !away.includes(t.seat));
  return others.length > 0 ? others : targets;
}

/** The players `obj` is required to attack this turn if able (`mustAttackPlayer`, D-185). */
function playersToAttack(state: GameState, id: ObjectId): SeatId[] {
  const seats: SeatId[] = [];
  for (const e of state.continuousEffects) {
    if (e.change.kind === 'mustAttackPlayer' && e.objects.includes(id)) seats.push(e.change.seat);
  }
  return seats;
}

function sameTarget(a: AttackTarget, b: AttackTarget): boolean {
  return a.kind === 'player'
    ? b.kind === 'player' && a.seat === b.seat
    : b.kind === 'permanent' && a.object === b.object;
}

/**
 * CR 508.1d: the candidates that are affected by "attacks each combat if able". A creature that
 * is able to attack is one of the candidates (untapped, not summoning sick, no defender), so
 * the requirement is read from them: one that can't attack is not required to. Nor is one whose every target
 * costs mana to attack: a player is not required to pay a cost to attack (CR 508.1d, D-125).
 */
export function requiredAttackers(
  state: GameState,
  candidates: readonly { attacker: ObjectId; targets: readonly AttackTarget[] }[],
): ObjectId[] {
  return candidates
    .filter(
      (c) =>
        hasRestriction(state, getObject(state, c.attacker), 'attacksEachCombat') ||
        playersToAttack(state, c.attacker).length > 0 ||
        groupRequirements(state, getObject(state, c.attacker)).length > 0,
    )
    .filter((c) => untaxedTargets(state, c.targets).length > 0)
    .map((c) => c.attacker);
}

/** Returns an error message, or null when the declaration is legal (CR 508.1). */
export function validateAttacks(
  state: GameState,
  seat: SeatId,
  attacks: readonly { attacker: ObjectId; target: AttackTarget }[],
): string | null {
  const candidates = attackCandidates(state, seat);
  const seen = new Set<ObjectId>();
  for (const a of attacks) {
    const candidate = candidates.find((c) => c.attacker === a.attacker);
    if (!candidate) return 'That creature cannot attack';
    if (seen.has(a.attacker)) return 'A creature can attack only once';
    seen.add(a.attacker);
    if (!candidate.targets.some((t) => sameTarget(t, a.target))) return 'That cannot be attacked';
  }
  // CR 508.1d: a requirement that could be obeyed must be: a creature that attacks each combat if
  // able and is able to attack has to be declared.
  if (requiredAttackers(state, candidates).some((id) => !seen.has(id))) {
    return 'A creature that attacks each combat if able must attack';
  }
  // CR 508.1h: the cost of attacking ("can't attack you unless their controller pays") must be payable once the
  // attackers are tapped (CR 508.1f); a player who cannot pay declares fewer attackers (D-125).
  if (!payableAttackTax(state, seat, attacks))
    return 'You cannot pay the cost to attack with those creatures';
  return null;
}

/**
 * CR 702.14c: whether the player who controls `blocker` controls a land that a landwalk of the
 * attacker names: one with the land type, or (nonbasic landwalk) one without the supertype basic.
 */
function controlsLandWalked(state: GameState, defender: SeatId, landType: string): boolean {
  return state.battlefield.some((id) => {
    const land = getObject(state, id);
    if (controllerOf(state, land) !== defender) return false;
    const d = derive(state, land);
    if (!d.types.includes('land')) return false;
    return landType === 'nonbasic'
      ? !d.supertypes.includes('basic')
      : d.subtypes.includes(landType);
  });
}

/**
 * The evasion and "can't be blocked" restrictions of CR 509.1b that look at the attacker: a creature
 * that can't be blocked, landwalk (CR 702.14c), fear (CR 702.36b), intimidate (CR 702.13b),
 * skulk (CR 702.118b) and shadow (CR 702.28b, both directions). Different evasion abilities are cumulative (CR 509.1b).
 */
function evades(state: GameState, blocker: GameObject, attacker: GameObject): boolean {
  const a = derive(state, attacker);
  if (a.restrictions.includes('cantBeBlocked')) return true;
  // CR 509.1b, 702.111b (D-133): menace needs two blockers and the restriction allows one, so nothing can block it.
  if (
    a.restrictions.includes('cantBeBlockedByMoreThanOne') &&
    abilitiesHaveKeyword(a.abilities, 'menace')
  ) {
    return true;
  }
  // CR 509.1b (D-139): "Juggernauts you control can't be blocked by Walls": the creatures the attacker's static abilities name can't block
  // it, read as the blocker is now.
  if (
    a.blockLimits.some((limit) =>
      matchesFilter(state, blocker, limit.filter, {
        controller: limit.controller,
        source: limit.source,
      }),
    )
  ) {
    return true;
  }
  const b = derive(state, blocker);
  // CR 702.16f (D-229): protection from a color: it can't be blocked by creatures of that color.
  if (hasProtectionFrom(state, attacker, blocker.id)) return true;
  // CR 701.54c (D-196): "Your Ring-bearer ... can't be blocked by creatures with greater power", read as the blockers are declared.
  if (ringBearerSeat(state, attacker) !== null && (b.power ?? 0) > (a.power ?? 0)) return true;
  const artifactCreature = b.types.includes('artifact') && b.types.includes('creature');
  let attackerShadow = false;
  for (const ability of a.abilities) {
    if (ability.kind !== 'keyword') continue;
    const k = ability.keyword;
    if (k.kind === 'shadow') attackerShadow = true;
    // CR 702.118b (D-120): a creature with skulk can't be blocked by creatures with greater power, read
    // as the blockers are declared.
    else if (k.kind === 'skulk' && (b.power ?? 0) > (a.power ?? 0)) return true;
    else if (k.kind === 'fear' && !artifactCreature && !b.colors.includes('B')) return true;
    else if (
      k.kind === 'intimidate' &&
      !artifactCreature &&
      !b.colors.some((c) => a.colors.includes(c))
    ) {
      return true;
    } else if (
      k.kind === 'landwalk' &&
      controlsLandWalked(state, controllerOf(state, blocker), k.landType)
    ) {
      return true;
    }
  }
  // CR 702.28b: a creature with shadow can't be blocked by creatures without shadow, and a
  // creature without shadow can't be blocked by creatures with shadow.
  const blockerShadow = abilitiesHaveKeyword(b.abilities, 'shadow');
  return attackerShadow !== blockerShadow;
}

/**
 * CR 509.1a, 509.1b, 702.9b, 702.17b: could this creature legally block that attacker on its own?
 * The restrictions of the blocker ("can't block") and of the attacker (evasion) are read here, so
 * the declaration, the legal actions and the AI all see the same answer.
 */
export function canBlockAttacker(
  state: GameState,
  blocker: GameObject,
  attacker: GameObject,
): boolean {
  if (!isLiveCreature(state, blocker) || blocker.tapped) return false;
  if (derive(state, blocker).types.includes('battle')) return false;
  if (hasRestriction(state, blocker, 'cantBlock')) return false;
  if (evades(state, blocker, attacker)) return false;
  if (hasKeyword(state, attacker, 'flying')) {
    return hasKeyword(state, blocker, 'flying') || hasKeyword(state, blocker, 'reach');
  }
  return true;
}

export function blockCandidates(
  state: GameState,
  defender: SeatId,
): { blocker: ObjectId; canBlock: ObjectId[] }[] {
  const combat = state.combat;
  if (!combat) return [];
  const attackers = combat.attackers.filter(
    (a) =>
      state.objects[a.object]?.zone === 'battlefield' && attackerDefender(state, a) === defender,
  );
  const out: { blocker: ObjectId; canBlock: ObjectId[] }[] = [];
  for (const id of state.battlefield) {
    const blocker = getObject(state, id);
    if (controllerOf(state, blocker) !== defender) continue;
    const canBlock = attackers
      .filter((a) => canBlockAttacker(state, blocker, getObject(state, a.object)))
      .map((a) => a.object);
    if (canBlock.length > 0) out.push({ blocker: id, canBlock });
  }
  return out;
}

/**
 * CR 509.1c (D-206): the requirements "this creature must be blocked if able" of the attackers are obeyed as far as the rules allow: the declaration
 * must block at least as many of those attackers as any other declaration of the same blockers could (an attacker with menace needs two
 * blockers, CR 702.111b, the others one, and a creature blocks one attacker, CR 509.1a). True when the declaration obeys fewer.
 */
function unmetBlockRequirements(
  state: GameState,
  candidates: readonly { blocker: ObjectId; canBlock: ObjectId[] }[],
  blocks: readonly { blocker: ObjectId; attacker: ObjectId }[],
): boolean {
  const required = [...new Set(candidates.flatMap((c) => c.canBlock))].filter((a) =>
    hasRestriction(state, getObject(state, a), 'mustBeBlocked'),
  );
  if (required.length === 0) return false;
  const need = (a: ObjectId) => (hasKeyword(state, getObject(state, a), 'menace') ? 2 : 1);
  const obeyed = required.filter(
    (a) => blocks.filter((b) => b.attacker === a).length >= need(a),
  ).length;
  // The most requirements any assignment of the blockers could obey (the sets are small: a handful of attackers and blockers).
  const best = (index: number, free: readonly ObjectId[]): number => {
    const attacker = required[index];
    if (attacker === undefined) return 0;
    let top = best(index + 1, free);
    const able = free.filter((b) =>
      candidates.find((c) => c.blocker === b)?.canBlock.includes(attacker),
    );
    const groups: ObjectId[][] =
      need(attacker) === 1
        ? able.map((b) => [b])
        : able.flatMap((b, i) => able.slice(i + 1).map((c) => [b, c]));
    for (const used of groups) {
      top = Math.max(
        top,
        1 +
          best(
            index + 1,
            free.filter((b) => !used.includes(b)),
          ),
      );
    }
    return top;
  };
  return (
    obeyed <
    best(
      0,
      candidates.map((c) => c.blocker),
    )
  );
}

/** Returns an error message, or null when the block declaration is legal (CR 509.1). */
export function validateBlocks(
  state: GameState,
  defender: SeatId,
  blocks: readonly { blocker: ObjectId; attacker: ObjectId }[],
): string | null {
  const candidates = blockCandidates(state, defender);
  const seen = new Set<ObjectId>();
  const perAttacker = new Map<ObjectId, number>();
  for (const b of blocks) {
    const candidate = candidates.find((c) => c.blocker === b.blocker);
    if (!candidate) return 'That creature cannot block';
    if (seen.has(b.blocker)) return 'A creature can block only one attacker';
    seen.add(b.blocker);
    if (!candidate.canBlock.includes(b.attacker)) return 'That creature cannot block that attacker';
    perAttacker.set(b.attacker, (perAttacker.get(b.attacker) ?? 0) + 1);
  }
  // CR 509.1b (D-133): "can't be blocked by more than one creature".
  for (const [attacker, count] of perAttacker) {
    if (
      count > 1 &&
      hasRestriction(state, getObject(state, attacker), 'cantBeBlockedByMoreThanOne')
    ) {
      return 'That attacker cannot be blocked by more than one creature';
    }
  }
  // CR 509.1b, 702.111b: a creature with menace can't be blocked except by two or more creatures.
  for (const [attacker, count] of perAttacker) {
    if (count === 1 && hasKeyword(state, getObject(state, attacker), 'menace')) {
      return 'A creature with menace needs two or more blockers';
    }
  }
  // CR 509.1c (D-206): "must be blocked if able": the declaration obeys as many of these requirements as any legal declaration could.
  const needed = unmetBlockRequirements(state, candidates, blocks);
  if (needed) return 'A creature that must be blocked if able must be blocked';
  // CR 509.1b, 509.1d (D-149): "creatures can't block unless their controller pays {1} for each of those creatures": the mana for the whole
  // declaration must be there (it is paid when the declaration is answered).
  if (!payableBlockTax(state, defender, blocks.length)) {
    return 'You cannot pay the cost to block with that many creatures';
  }
  return null;
}
