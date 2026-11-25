/**
 * Whom to attack when there are several opponents (more opponents, issue 479). One ranking shared by
 * the casual, greedy and heuristic agents: the opponent the attackers can kill comes first (the same
 * blocker-aware lethal check as `heuristic-danger.ts`), then the one who has the initiative (combat damage to them takes it, CR 726.2, and it ventures every turn), then the one with the least life, the most
 * poison, the most commander damage taken, the fewest untapped creatures, and finally the lowest seat.
 * With one living opponent the ranking has one entry, so two-seat play is unchanged.
 */
import type { AttackTarget, GameView, ObjectView, SeatId } from '@commander-arena/engine';
import { poisonOf } from './casual-poison';
import { commanderClock } from './evaluate';
import { attackIsLethal, untappedCreatures } from './heuristic-danger';

/** The living opponents of the viewer, best target first for `attackers`. */
export function rankOpponents(view: GameView, attackers: readonly ObjectView[]): SeatId[] {
  const rows = view.seats
    .filter((s) => s.id !== view.viewer && !s.hasLost)
    .map((s) => ({
      seat: s.id,
      lethal: attackIsLethal(view, s.id, attackers),
      initiative: view.initiative === s.id,
      life: s.life,
      poison: poisonOf(view, s.id),
      commander: commanderClock(view.commanderDamage, s.id),
      blockers: untappedCreatures(view, s.id).length,
    }));
  rows.sort(
    (a, b) =>
      Number(b.lethal) - Number(a.lethal) ||
      Number(b.initiative) - Number(a.initiative) ||
      a.life - b.life ||
      b.poison - a.poison ||
      b.commander - a.commander ||
      a.blockers - b.blockers ||
      a.seat - b.seat,
  );
  return rows.map((r) => r.seat);
}

/**
 * The target for one attacker: the ranked seats' player in order, else any other opposing player,
 * else the first offered target (only permanents could be attacked).
 */
export function targetFor(
  view: GameView,
  targets: readonly AttackTarget[],
  ranked: readonly SeatId[],
): AttackTarget | undefined {
  for (const seat of ranked) {
    const t = targets.find((x) => x.kind === 'player' && x.seat === seat);
    if (t !== undefined) return t;
  }
  return targets.find((t) => t.kind === 'player' && t.seat !== view.viewer) ?? targets[0];
}
