/**
 * CasualAgent combat: which creatures attack and how blockers are assigned. The rules are simple
 * and conservative. They read only the view and the decision, and they use the keyword list for
 * evasion and first strike where that is cheap; they do not simulate combat tricks.
 */
import type {
  Action,
  AttackTarget,
  DeclareAttackersDecision,
  DeclareBlockersDecision,
  GameView,
  ObjectId,
  ObjectView,
} from '@commander-arena/engine';
import { couldBlock } from './casual-evasion';
import { type PlannedAttack, payForAttacks } from './casual-play-rules';
import { lifeDamageOf, poisonLethal, poisonThreat } from './casual-poison';
import {
  findObject,
  hasKeyword,
  manaValueOf,
  opponentLife,
  ownLife,
  powerOf,
  toughnessOf,
} from './casual-view';
import { withinBlockBudget } from './legal';

/** Below this much life the agent accepts a creature trade that costs it more than it wins. */
export const TRADE_LIFE = 15;

const strikesFirst = (o: ObjectView): boolean =>
  hasKeyword(o, 'firstStrike') || hasKeyword(o, 'doubleStrike');

/** Whether `damage` from `source` destroys `target` (deathtouch needs only 1, CR 702.2). */
function kills(source: ObjectView, target: ObjectView): boolean {
  if (hasKeyword(target, 'indestructible') || powerOf(source) <= 0) return false;
  return hasKeyword(source, 'deathtouch') || powerOf(source) >= toughnessOf(target);
}

/**
 * Whether `blocker` is still alive after fighting `attacker`: it is not killed by the attacker's
 * damage, or it is indestructible, or it kills the attacker first (first strike, CR 702.7).
 */
function survives(blocker: ObjectView, attacker: ObjectView): boolean {
  if (hasKeyword(blocker, 'indestructible') || !kills(attacker, blocker)) return true;
  return strikesFirst(blocker) && !strikesFirst(attacker) && kills(blocker, attacker);
}

/**
 * Untapped creatures the opponent could put in front of `attacker`: evasion (flying, fear,
 * intimidate, shadow, landwalk, "can't be blocked") and "can't block" are read from the view
 * (casual-evasion.ts), so an attack nothing can stop counts as safe.
 */
function possibleBlockers(view: GameView, attacker: ObjectView): ObjectView[] {
  return view.battlefield.filter(
    (o) =>
      o.controller !== view.viewer &&
      o.types.includes('creature') &&
      !o.tapped &&
      couldBlock(view, attacker, o),
  );
}

/**
 * Safe or profitable to attack with `attacker`: nothing can block it, or no single blocker
 * (two for menace) can kill it, or every blocker that could kill it dies to it and is worth at
 * least as much (an even or winning trade).
 */
export function isSafeAttack(view: GameView, attacker: ObjectView): boolean {
  const blockers = possibleBlockers(view, attacker);
  const menace = hasKeyword(attacker, 'menace');
  if (blockers.length === 0 || (menace && blockers.length < 2)) return true;
  const powers = blockers.map(powerOf).sort((a, b) => b - a);
  // A menace attacker is blocked by two creatures, which deal damage together (CR 702.111b).
  const biggest = menace ? (powers[0] ?? 0) + (powers[1] ?? 0) : (powers[0] ?? 0);
  if (toughnessOf(attacker) > biggest && !blockers.some((b) => hasKeyword(b, 'deathtouch'))) {
    return true;
  }
  if (menace) return false;
  return blockers.every(
    (b) =>
      !kills(b, attacker) ||
      (survives(attacker, b) && powerOf(attacker) >= toughnessOf(b)) ||
      (kills(attacker, b) && manaValueOf(b) >= manaValueOf(attacker)),
  );
}

/** The player attack target, or the first offered target when only permanents can be attacked. */
function chooseAttackTarget(
  view: GameView,
  targets: readonly AttackTarget[],
): AttackTarget | undefined {
  const player = targets.find((t) => t.kind === 'player' && t.seat !== view.viewer);
  return player ?? targets[0];
}

export function chooseAttackers(view: GameView, d: DeclareAttackersDecision): Action {
  const candidates = d.candidates.flatMap((c) => {
    const object = findObject(view, c.attacker);
    const target = chooseAttackTarget(view, c.targets);
    return object === undefined || target === undefined ? [] : [{ object, target, c }];
  });
  // Attacking power that can reach the opposing player; an all-out attack is right if it is lethal.
  // Infect damage is poison, not life loss, and ten poison counters are lethal too (casual-poison.ts).
  const atPlayer = candidates.filter((x) => x.target.kind === 'player').map((x) => x.object);
  const playerPower = atPlayer.reduce((sum, o) => sum + lifeDamageOf(o), 0);
  const lethal = playerPower >= opponentLife(view) || poisonLethal(view, atPlayer);
  // CR 508.1d: a creature that attacks each combat if able is declared whatever the agent thinks.
  const required = new Set(d.mustAttack);
  const wanted: PlannedAttack[] = candidates
    .filter(
      (x) =>
        required.has(x.c.attacker) ||
        lethal ||
        (powerOf(x.object) > 0 && isSafeAttack(view, x.object)),
    )
    .map((x) => ({
      attacker: x.c.attacker,
      object: x.object,
      target: x.target,
      targets: x.c.targets,
    }));
  // D-203 (CR 306.6): an opposing planeswalker the safe attackers can kill this combat is attacked instead of the player, with the strongest of them
  // first and no more than it takes; the rest still go at the player. Not when the attack is lethal on the player (that wins the game).
  const aimed = lethal ? wanted : aimAtPlaneswalkers(view, wanted);
  // CR 508.1h (D-125): attacking a taxed target costs mana; send as many as can be paid for.
  const attacks = payForAttacks(d, aimed, lethal).map((p) => ({
    attacker: p.attacker,
    target: p.target,
  }));
  return { kind: 'declareAttackers', attacks };
}

/**
 * Sends enough of the planned attackers at each opposing planeswalker that they can kill, lowest loyalty first (D-203, CR 306.6, 120.3c): the attackers
 * that may attack it (their `targets` list it), strongest first, until their power covers its loyalty. A planeswalker the planned attackers cannot kill
 * is left alone: the damage would be lost on it.
 */
function aimAtPlaneswalkers(view: GameView, wanted: readonly PlannedAttack[]): PlannedAttack[] {
  const walkers = view.battlefield
    .filter((o) => o.controller !== view.viewer && o.types.includes('planeswalker'))
    .sort((a, b) => (a.counters.loyalty ?? 0) - (b.counters.loyalty ?? 0));
  const out = [...wanted];
  for (const walker of walkers) {
    const loyalty = walker.counters.loyalty ?? 0;
    if (loyalty <= 0) continue;
    const at = (a: PlannedAttack): AttackTarget | undefined =>
      a.targets.find((t) => t.kind === 'permanent' && t.object === walker.id);
    const able = out
      .map((a, i) => ({ a, i, target: at(a) }))
      .filter((x) => x.target !== undefined && x.a.target.kind === 'player')
      .sort((x, y) => powerOf(y.a.object) - powerOf(x.a.object));
    let power = 0;
    const picked: typeof able = [];
    for (const x of able) {
      if (power >= loyalty) break;
      picked.push(x);
      power += powerOf(x.a.object);
    }
    if (power < loyalty) continue;
    for (const x of picked) {
      const target = x.target;
      if (target !== undefined) out[x.i] = { ...x.a, target };
    }
  }
  return out;
}

/**
 * Blocks, attackers by power descending. For each attacker, in order of preference: a blocker that
 * survives and kills it, one that survives, a trade that kills it for a creature worth no more
 * (or any killing trade while life is below `TRADE_LIFE`), and finally a chump block, only when
 * the attacking power still unblocked would be lethal. A menace attacker needs two blockers
 * (`minBlockers`); a group is formed only when the pair together kills it or a chump is forced.
 */
export function chooseBlockers(view: GameView, d: DeclareBlockersDecision): Action {
  const life = ownLife(view);
  const attackers = d.attackers
    .flatMap((a) => {
      const object = findObject(view, a.attacker);
      return object === undefined ? [] : [{ ...a, object }];
    })
    .sort((a, b) => powerOf(b.object) - powerOf(a.object));
  const blockerObjects = d.candidates.flatMap((c) => {
    const object = findObject(view, c.blocker);
    return object === undefined ? [] : [{ object, canBlock: c.canBlock }];
  });
  const used = new Set<string>();
  const blocks: { blocker: ObjectId; attacker: ObjectId }[] = [];
  const unblocked = new Set(attackers.map((a) => a.attacker));
  const unblockedAtMe = (): ObjectView[] =>
    attackers
      .filter(
        (a) =>
          unblocked.has(a.attacker) && a.target.kind === 'player' && a.target.seat === view.viewer,
      )
      .map((a) => a.object);
  // Life lost to what is not blocked (infect damage is not life loss), and whether its poison is lethal.
  const threat = (): number => unblockedAtMe().reduce((sum, o) => sum + lifeDamageOf(o), 0);
  const poisoned = (): boolean => poisonThreat(view, unblockedAtMe());

  for (const a of attackers) {
    const free = blockerObjects
      .filter((b) => !used.has(b.object.id) && b.canBlock.includes(a.attacker))
      .map((b) => b.object)
      .sort((x, y) => manaValueOf(x) - manaValueOf(y));
    if (free.length < a.minBlockers) continue;
    let group: ObjectView[] | undefined;
    if (a.minBlockers <= 1) {
      group = [free.find((b) => survives(b, a.object) && kills(b, a.object))].flatMap(
        (b) => b ?? [],
      );
      if (group.length === 0) group = free.filter((b) => survives(b, a.object)).slice(0, 1);
      if (group.length === 0) {
        const trade = free.find(
          (b) =>
            kills(b, a.object) && (manaValueOf(b) <= manaValueOf(a.object) || life < TRADE_LIFE),
        );
        group = trade === undefined ? [] : [trade];
      }
    } else {
      const pair = free.slice(0, a.minBlockers);
      const damage = pair.reduce((sum, b) => sum + powerOf(b), 0);
      const kill = damage >= toughnessOf(a.object) || pair.some((b) => hasKeyword(b, 'deathtouch'));
      group = kill && pair.some((b) => survives(b, a.object)) ? pair : [];
    }
    if (group.length === 0 && (threat() >= life || poisoned()))
      group = free.slice(0, a.minBlockers);
    if (group.length === 0) continue;
    for (const b of group) {
      used.add(b.id);
      blocks.push({ blocker: b.id, attacker: a.attacker });
    }
    unblocked.delete(a.attacker);
  }
  // CR 509.1d (D-149): blocking may cost mana (Archangel of Tithes): only the blocks that can be paid for.
  return { kind: 'declareBlockers', blocks: withinBlockBudget(d, blocks) };
}
