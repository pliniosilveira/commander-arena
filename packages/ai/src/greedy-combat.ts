/**
 * GreedyAgent combat (M7b, SPEC 17.3 A11, D-162): attack with every creature that survives the
 * attack, block only to prevent lethal damage. Both rules read the view and the decision only.
 *
 * A creature SURVIVES an attack when the opponent cannot kill it with the blockers they could put in
 * front of it. The blockers are the untapped creatures of the opponent that `couldBlock` allows
 * (flying and reach, fear, intimidate, shadow, landwalk and "can't block" are read from the view).
 * One blocker kills the attacker when its damage (twice its power with double strike) reaches the
 * attacker's remaining toughness, or it has deathtouch and any power; indestructible attackers
 * cannot be killed by damage. First strike (CR 702.7): if the attacker strikes first and the blocker
 * does not, and the attacker's power would kill that blocker, the blocker deals no damage. An
 * attacker with menace (CR 702.111b) needs two blockers, so it is judged against each pair of
 * potential blockers: together they kill it by their summed damage or if either has deathtouch.
 * Larger gang blocks of creatures that could not kill the attacker alone are NOT assumed: the
 * benchmark is deliberately optimistic about them. An even trade is not survival, so a creature that
 * a blocker would kill is held back, whatever it would kill in return.
 *
 * An all-out attack is made when it would be lethal (the lethal check of PRIOR_ART 7.2 heuristic 1):
 * assume each untapped potential blocker group stops one of the biggest attackers it can block,
 * biggest first; if what is left reaches the opponent's life, ten poison counters, or 21 commander
 * damage from a commander, every candidate attacks.
 *
 * Blocks: when the unblocked attackers at the agent are lethal (life, poison, or 21 commander damage),
 * it blocks until what is left is not lethal, preferring the block that already makes it safe and
 * otherwise the biggest attacker, with the cheapest creatures that can block (by mana value). Under
 * no other circumstance does it block.
 */
import type {
  Action,
  AttackTarget,
  DeclareAttackersDecision,
  DeclareBlockersDecision,
  GameView,
  ObjectId,
  ObjectView,
  SeatId,
} from '@commander-arena/engine';
import { couldBlock } from './casual-evasion';
import { type PlannedAttack, payForAttacks } from './casual-play-rules';
import { lifeDamageOf, poisonDamageOf, poisonOf } from './casual-poison';
import {
  findObject,
  hasKeyword,
  isCreature,
  manaValueOf,
  opponentLife,
  ownLife,
  powerOf,
  toughnessOf,
} from './casual-view';
import { COMMANDER_LETHAL, commanderClock } from './evaluate';
import { withinBlockBudget } from './legal';
import type { Reason } from './reasons';

export interface Choice {
  readonly action: Action;
  readonly reason: Reason;
}

const strikesFirst = (o: ObjectView): boolean =>
  hasKeyword(o, 'firstStrike') || hasKeyword(o, 'doubleStrike');

/** Damage `o` deals to what it fights over a whole combat: double strike deals its power twice. */
const dealt = (o: ObjectView): number => powerOf(o) * (hasKeyword(o, 'doubleStrike') ? 2 : 1);

const remaining = (o: ObjectView): number => toughnessOf(o) - o.damage;

/** Whether `dmg` damage from `source` destroys `target` (CR 702.2 deathtouch, 702.12 indestructible). */
function lethalTo(source: ObjectView, dmg: number, target: ObjectView): boolean {
  if (hasKeyword(target, 'indestructible') || dmg <= 0) return false;
  return hasKeyword(source, 'deathtouch') || dmg >= remaining(target);
}

/** The untapped creatures of the opponent that could block `attacker`. */
export function potentialBlockers(view: GameView, attacker: ObjectView): ObjectView[] {
  return view.battlefield.filter(
    (o) =>
      o.controller !== view.viewer && isCreature(o) && !o.tapped && couldBlock(view, attacker, o),
  );
}

/** One blocker kills the attacker (first strike taken into account). */
function blockerKills(blocker: ObjectView, attacker: ObjectView): boolean {
  if (!lethalTo(blocker, dealt(blocker), attacker)) return false;
  if (
    strikesFirst(attacker) &&
    !strikesFirst(blocker) &&
    lethalTo(attacker, powerOf(attacker), blocker)
  ) {
    return false;
  }
  return true;
}

/** Two blockers (menace) kill the attacker together, by summed damage or by a deathtouch blocker. */
function pairKills(a: ObjectView, b: ObjectView, attacker: ObjectView): boolean {
  if (hasKeyword(attacker, 'indestructible')) return false;
  const deathtouch =
    (hasKeyword(a, 'deathtouch') && dealt(a) > 0) || (hasKeyword(b, 'deathtouch') && dealt(b) > 0);
  if (!deathtouch && dealt(a) + dealt(b) < remaining(attacker)) return false;
  // The attacker strikes first and can kill both blockers before they deal damage.
  if (
    strikesFirst(attacker) &&
    !strikesFirst(a) &&
    !strikesFirst(b) &&
    !hasKeyword(a, 'indestructible') &&
    !hasKeyword(b, 'indestructible') &&
    (hasKeyword(attacker, 'deathtouch')
      ? powerOf(attacker) >= 2
      : powerOf(attacker) >= remaining(a) + remaining(b))
  ) {
    return false;
  }
  return true;
}

/** The creature survives an attack: the opponent has no block that kills it (see the module comment). */
export function survivesAttack(view: GameView, attacker: ObjectView): boolean {
  if (hasKeyword(attacker, 'indestructible')) return true;
  const blockers = potentialBlockers(view, attacker);
  if (hasKeyword(attacker, 'menace')) {
    for (let i = 0; i < blockers.length; i += 1) {
      for (let j = i + 1; j < blockers.length; j += 1) {
        const [x, y] = [blockers[i], blockers[j]];
        if (x !== undefined && y !== undefined && pairKills(x, y, attacker)) return false;
      }
    }
    return true;
  }
  return !blockers.some((b) => blockerKills(b, attacker));
}

const opposingSeat = (view: GameView): SeatId | undefined =>
  view.seats.find((s) => s.id !== view.viewer && !s.hasLost)?.id;

/** Whether `unblocked`, all reaching `seat` unhindered, would make it lose (life, poison, commander). */
function reachesLethal(
  view: GameView,
  seat: SeatId,
  life: number,
  poison: number,
  unblocked: readonly ObjectView[],
): boolean {
  const damage = unblocked.reduce((sum, o) => sum + lifeDamageOf(o), 0);
  if (damage >= life) return true;
  const given = unblocked.reduce((sum, o) => sum + poisonDamageOf(o), 0);
  if (given > 0 && poison + given >= 10) return true;
  const clock = commanderClock(view.commanderDamage, seat);
  return unblocked.some(
    (o) => o.isCommander && powerOf(o) > 0 && clock + lifeDamageOf(o) >= COMMANDER_LETHAL,
  );
}

/**
 * The attackers left once each untapped potential blocker group has stopped one attacker, biggest
 * attacker first (a menace attacker takes two blockers).
 */
function leftAfterBlocks(view: GameView, attackers: readonly ObjectView[]): ObjectView[] {
  const free = new Set(
    view.battlefield.filter((o) => o.controller !== view.viewer && isCreature(o) && !o.tapped),
  );
  const left: ObjectView[] = [];
  for (const a of [...attackers].sort((x, y) => lifeDamageOf(y) - lifeDamageOf(x))) {
    const need = hasKeyword(a, 'menace') ? 2 : 1;
    const group = [...free].filter((b) => couldBlock(view, a, b)).slice(0, need);
    if (group.length < need) {
      left.push(a);
      continue;
    }
    for (const b of group) free.delete(b);
  }
  return left;
}

/** The player attack target, or the first offered target when only permanents can be attacked. */
function attackTarget(view: GameView, targets: readonly AttackTarget[]): AttackTarget | undefined {
  return targets.find((t) => t.kind === 'player' && t.seat !== view.viewer) ?? targets[0];
}

export function chooseGreedyAttack(view: GameView, d: DeclareAttackersDecision): Choice {
  const candidates = d.candidates.flatMap((c) => {
    const object = findObject(view, c.attacker);
    const target = attackTarget(view, c.targets);
    return object === undefined || target === undefined ? [] : [{ object, target, c }];
  });
  const opponent = opposingSeat(view);
  const atPlayer = candidates.filter((x) => x.target.kind === 'player').map((x) => x.object);
  const lethal =
    opponent !== undefined &&
    atPlayer.length > 0 &&
    reachesLethal(
      view,
      opponent,
      opponentLife(view),
      poisonOf(view, opponent),
      leftAfterBlocks(view, atPlayer),
    );
  // CR 508.1d: a creature that attacks each combat if able is declared whatever the agent thinks.
  const required = new Set(d.mustAttack);
  const wanted: PlannedAttack[] = candidates
    .filter(
      (x) =>
        required.has(x.c.attacker) ||
        lethal ||
        (powerOf(x.object) > 0 && survivesAttack(view, x.object)),
    )
    .map((x) => ({
      attacker: x.c.attacker,
      object: x.object,
      target: x.target,
      targets: x.c.targets,
    }));
  // CR 508.1h (D-125): attacking a taxed target costs mana; send as many as can be paid for.
  const attacks = payForAttacks(d, wanted, lethal).map((p) => ({
    attacker: p.attacker,
    target: p.target,
  }));
  const forcedOnly = attacks.length > 0 && attacks.every((a) => required.has(a.attacker));
  const reason: Reason = lethal
    ? 'lethal'
    : attacks.length === 0
      ? candidates.length === 0
        ? 'no-attackers'
        : 'hold-back'
      : forcedOnly &&
          !candidates.some((x) => !required.has(x.c.attacker) && survivesAttack(view, x.object))
        ? 'must-attack'
        : 'safe-attack';
  return { action: { kind: 'declareAttackers', attacks }, reason };
}

export function chooseGreedyBlocks(view: GameView, d: DeclareBlockersDecision): Choice {
  const life = ownLife(view);
  const poison = poisonOf(view, view.viewer);
  const attackers = d.attackers.flatMap((a) => {
    const object = findObject(view, a.attacker);
    return object === undefined || a.target.kind !== 'player' || a.target.seat !== view.viewer
      ? []
      : [{ ...a, object }];
  });
  const lethal = (unblocked: readonly ObjectView[]) =>
    reachesLethal(view, view.viewer, life, poison, unblocked);
  const blockers = d.candidates.flatMap((c) => {
    const object = findObject(view, c.blocker);
    return object === undefined ? [] : [{ object, canBlock: c.canBlock }];
  });
  const used = new Set<ObjectId>();
  const blocks: { blocker: ObjectId; attacker: ObjectId }[] = [];
  let unblocked = attackers.map((a) => a.object);
  // The cheapest creatures that could block, free and able to block this attacker (ties by id).
  const groupFor = (a: (typeof attackers)[number]): ObjectView[] | undefined => {
    const free = blockers
      .filter((b) => !used.has(b.object.id) && b.canBlock.includes(a.attacker))
      .map((b) => b.object)
      .sort((x, y) => manaValueOf(x) - manaValueOf(y) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
    return free.length < a.minBlockers ? undefined : free.slice(0, a.minBlockers);
  };
  while (lethal(unblocked)) {
    const blockable = attackers
      .filter((a) => unblocked.includes(a.object) && groupFor(a) !== undefined)
      .sort(
        (x, y) =>
          lifeDamageOf(y.object) +
          poisonDamageOf(y.object) -
          lifeDamageOf(x.object) -
          poisonDamageOf(x.object),
      );
    const decisive = blockable.find((a) => !lethal(unblocked.filter((o) => o !== a.object)));
    const pick = decisive ?? blockable[0];
    const group = pick === undefined ? undefined : groupFor(pick);
    if (pick === undefined || group === undefined) break;
    for (const b of group) {
      used.add(b.id);
      blocks.push({ blocker: b.id, attacker: pick.attacker });
    }
    unblocked = unblocked.filter((o) => o !== pick.object);
  }
  // CR 509.1d (D-149): blocking may cost mana (Archangel of Tithes): only the blocks that can be paid for.
  const paid = withinBlockBudget(d, blocks);
  return {
    action: { kind: 'declareBlockers', blocks: paid },
    reason: paid.length > 0 ? 'chump-danger' : 'no-block',
  };
}
