/**
 * The crack-back of the HeuristicAgent's attack search (M7c, D-163; `heuristic-attacks.ts`): what the opponents'
 * next attack could cost the agent once its own attack is over, as a score penalty. Every creature an opponent
 * controls untaps and attacks, the agent's untapped creatures block (`breakthrough` in `heuristic-danger.ts`),
 * and what gets through costs the life it takes (`attacks.crackWeight`), plus `attacks.crackDanger` when it
 * leaves the agent in danger, and `attacks.crackLethalShare` of a lost game when it is lethal.
 *
 * Against a deck that can do it (issue 653, step 2b: the opponent profile, `heuristic-profile.ts`), the attack is
 * also counted with a creature cast from the hand that attacks at once (`hiddenAttackersOf` in
 * `heuristic-threats.ts`: haste, or flash), in the share of the chance that the opponent holds one. A deck with
 * no such creature it can pay for is feared for its battlefield alone.
 */
import type { GameView, ObjectView, SeatId } from '@commander-arena/engine';
import { LOSS, lifeValue } from './evaluate';
import { breakthrough, futureAttackers, untappedCreatures, verdict } from './heuristic-danger';
import type { HiddenAttacker } from './heuristic-threats';
import type { AgentWeights } from './weights';

/**
 * What the opponents' next attack could cost the agent in this position (a score penalty, 0 or more; see the
 * module comment). Used on the view after a simulated combat, where the agent's attackers are tapped. With
 * several opponents each one's loss is weighted by `attackShare`, how likely it is to turn on the agent rather
 * than on the others. `hidden` holds the creature each opponent may cast and attack with at once, and the chance
 * it holds one.
 */
export function crackBackPenalty(
  view: GameView,
  me: SeatId,
  weights: AgentWeights,
  hidden: ReadonlyMap<SeatId, HiddenAttacker> = new Map(),
): number {
  const w = weights.attacks;
  const seat = view.seats.find((s) => s.id === me);
  if (seat === undefined) return 0;
  const blockers = untappedCreatures(view, me);
  const lethal = w.crackLethalShare * LOSS;
  let penalty = 0;
  for (const other of view.seats) {
    if (other.id === me || other.hasLost) continue;
    const attackers = futureAttackers(view, other.id);
    const cost = (extra: readonly ObjectView[]): number | 'lethal' => {
      const b = breakthrough(view, [...attackers, ...extra], blockers);
      const v = verdict(view, me, b, weights.danger);
      if (v.lethal) return 'lethal';
      return (
        attackShare(view, other.id, me) *
        (w.crackWeight * (lifeValue(seat.life, weights) - lifeValue(seat.life - b.life, weights)) +
          (v.danger ? w.crackDanger : 0))
      );
    };
    const seen = cost([]);
    // A lethal crack-back is still lethal when the opponent also has others to choose from.
    if (seen === 'lethal') return lethal;
    const h = hidden.get(other.id);
    if (h === undefined || h.chance <= 0) {
      penalty += seen;
      continue;
    }
    const withHidden = cost([h.attacker]);
    penalty += (1 - h.chance) * seen + h.chance * (withHidden === 'lethal' ? lethal : withHidden);
  }
  return penalty;
}

/**
 * How likely `attacker` is to attack `me` rather than another seat, from 0 to 1: its targets (every living
 * seat but itself) weighted by 1 / life, so the one with the least life draws the most attacks. With one
 * possible target (two seats) it is 1.
 */
export function attackShare(view: GameView, attacker: SeatId, me: SeatId): number {
  const targets = view.seats.filter((s) => s.id !== attacker && !s.hasLost);
  const weight = (life: number): number => 1 / Math.max(life, 1);
  const total = targets.reduce((sum, s) => sum + weight(s.life), 0);
  const mine = targets.find((s) => s.id === me);
  return mine === undefined || total === 0 ? 1 : weight(mine.life) / total;
}
