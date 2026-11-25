/**
 * Danger and lethal tests of the HeuristicAgent (M7c, PRIOR_ART 7.2 heuristics 1 and 2, D-163): how much
 * of an attack gets past a set of blockers, and whether that is lethal or leaves the defender "in
 * danger". Everything reads a `GameView` and names the seats, so the same code judges the agent's own
 * defence, the attack it plans and the crack-back it fears.
 *
 * Three channels, as in the commander format (CR 704.5a, 704.5c, 704.6c):
 *  - life: lethal when the damage reaches the life total; in danger when the life left is at most
 *    `danger.life`;
 *  - poison: lethal at ten counters; in danger from `danger.poison`;
 *  - commander damage: lethal when one commander has dealt 21 in all; in danger from `danger.commander`
 *    (70% of the way, the evaluator's own mark).
 * The danger thresholds are fields of `AgentWeights` (`weights.ts`), first tuned by the M7c measurements
 * (D-163); lethal is the rules' and takes no weights.
 */
import type { GameView, ObjectView, SeatId } from '@commander-arena/engine';
import { couldBlock } from './casual-evasion';
import { lifeDamageOf, poisonDamageOf } from './casual-poison';
import { hasKeyword, isCreature, powerOf, toughnessOf } from './casual-view';
import { COMMANDER_LETHAL, commanderClock, POISON_LETHAL } from './evaluate';
import type { DangerWeights } from './weights';

/** What gets past the blockers to the defender. */
export interface Breakthrough {
  readonly life: number;
  readonly poison: number;
  /** The most commander damage one commander attacker deals (the worst single commander counts). */
  readonly commander: number;
}

export interface Verdict {
  readonly lethal: boolean;
  readonly danger: boolean;
  readonly lifeAfter: number;
}

/** Damage an attacker deals to a player in one combat: double strike deals its power twice (CR 702.4). */
export const hitDamage = (o: ObjectView): number =>
  lifeDamageOf(o) * (hasKeyword(o, 'doubleStrike') ? 2 : 1);

const seatOf = (view: GameView, seat: SeatId) => view.seats.find((s) => s.id === seat);

/** The untapped creatures `seat` controls: what could block. */
export function untappedCreatures(view: GameView, seat: SeatId): ObjectView[] {
  return view.battlefield.filter((o) => o.controller === seat && isCreature(o) && !o.tapped);
}

const byId = (a: ObjectView, b: ObjectView): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * What of `attackers` reaches `defender` when `blockers` (untapped creatures of the defender) each stop
 * one attacker, biggest attacker first (a menace attacker takes two blockers, CR 702.111b). The
 * blockers chosen for an attacker are the ones that can block the fewest others, so the estimate is
 * the defender's best; a blocked attacker with trample still sends its excess over the blockers'
 * toughness through (CR 702.19b), and double strike counts twice.
 */
export function breakthrough(
  view: GameView,
  attackers: readonly ObjectView[],
  blockers: readonly ObjectView[],
): Breakthrough {
  const free = new Set(blockers);
  let life = 0;
  let poison = 0;
  let commander = 0;
  const flexible = (b: ObjectView): number =>
    attackers.filter((a) => couldBlock(view, a, b)).length;
  const order = [...attackers].sort(
    (x, y) => hitDamage(y) + poisonDamageOf(y) - hitDamage(x) - poisonDamageOf(x) || byId(x, y),
  );
  for (const a of order) {
    const need = hasKeyword(a, 'menace') ? 2 : 1;
    const eligible = [...free]
      .filter((b) => couldBlock(view, a, b))
      .sort((x, y) => flexible(x) - flexible(y) || byId(x, y));
    // A trampler is best absorbed by the sturdiest blockers.
    const group = (
      hasKeyword(a, 'trample')
        ? eligible.sort((x, y) => toughnessOf(y) - toughnessOf(x) || byId(x, y))
        : eligible
    ).slice(0, need);
    let through = hitDamage(a);
    let poisonThrough = poisonDamageOf(a);
    if (group.length === need) {
      for (const b of group) free.delete(b);
      if (hasKeyword(a, 'trample')) {
        const absorbed = group.reduce((sum, b) => sum + Math.max(toughnessOf(b) - b.damage, 0), 0);
        through = Math.max(through - absorbed, 0);
        poisonThrough = through > 0 ? poisonThrough : 0;
      } else {
        through = 0;
        poisonThrough = 0;
      }
    }
    life += through;
    poison += poisonThrough;
    if (a.isCommander && through > 0) commander = Math.max(commander, through);
  }
  return { life, poison, commander };
}

/** Whether `b` getting through is lethal for `defender` (CR 704.5a, 704.5c, 704.6c). */
function isLethal(view: GameView, defender: SeatId, b: Breakthrough): boolean {
  const s = seatOf(view, defender);
  const clock = commanderClock(view.commanderDamage, defender);
  return (
    b.life >= (s?.life ?? 0) ||
    (b.poison > 0 && (s?.poison ?? 0) + b.poison >= POISON_LETHAL) ||
    (b.commander > 0 && clock + b.commander >= COMMANDER_LETHAL)
  );
}

/** Lethal and danger for `defender` when `b` gets through (see the module comment). */
export function verdict(
  view: GameView,
  defender: SeatId,
  b: Breakthrough,
  w: DangerWeights,
): Verdict {
  const s = seatOf(view, defender);
  const poison = s?.poison ?? 0;
  const clock = commanderClock(view.commanderDamage, defender);
  const lifeAfter = (s?.life ?? 0) - b.life;
  const lethal = isLethal(view, defender, b);
  const danger =
    lethal ||
    (b.life > 0 && lifeAfter <= w.life) ||
    (b.poison > 0 && poison + b.poison >= w.poison) ||
    (b.commander > 0 && clock + b.commander >= w.commander);
  return { lethal, danger, lifeAfter };
}

/** The creatures of `seat` that could attack next turn: every creature with power, tapped or not (it untaps). */
export function futureAttackers(view: GameView, seat: SeatId): ObjectView[] {
  return view.battlefield.filter(
    (o) => o.controller === seat && isCreature(o) && powerOf(o) > 0 && !hasKeyword(o, 'defender'),
  );
}

/** Whether `attackers` (of `attacker`'s side) are lethal on `defender` once its untapped creatures block. */
export function attackIsLethal(
  view: GameView,
  defender: SeatId,
  attackers: readonly ObjectView[],
): boolean {
  if (attackers.length === 0) return false;
  return isLethal(view, defender, breakthrough(view, attackers, untappedCreatures(view, defender)));
}
