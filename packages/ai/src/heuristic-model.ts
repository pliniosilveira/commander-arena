/**
 * What the HeuristicAgent has seen of how its opponent blocks (M7c, D-163). Attacks are scored by playing
 * them out against an ASSUMED opponent that blocks sensibly (`defaultPlan`); a passive opponent, one that
 * lets creatures through when a good block was there, makes that assumption too pessimistic and the agent
 * would sit behind a board it could attack past. So the agent counts, after each of its own attacks, the
 * attackers that had a SENSIBLE block available (a blocker that survives, or trades with an attacker worth at
 * least as much) and how many of those were blocked, and attacks are scored as the average of two plays, one
 * against a sensible opponent and one against one that blocks only when it is in danger, weighted by
 * `passiveWeight`.
 *
 * One count is kept per defending seat (issue 483): with 3 or 4 seats a passive and a careful opponent are
 * not averaged, `passiveWeightFor(seat)` reads one seat's; `passiveWeight` is the whole table's.
 *
 * Only public information is read: the combat of the view, in the declare-blockers step of the agent's own
 * turn. The count lives as long as the agent (one game).
 */
import type { GameView, ObjectView, SeatId } from '@commander-arena/engine';
import { hasKeyword } from './casual-view';
import { creatureValue } from './evaluate';
import { potentialBlockers } from './greedy-combat';
import { duel } from './heuristic-duel';
import { type AgentWeights, DEFAULT_WEIGHTS } from './weights';

/** Whether `blocker` blocking `attacker` is a block a sensible player makes. */
function sensible(attacker: ObjectView, blocker: ObjectView, weights: AgentWeights): boolean {
  const r = duel(attacker, blocker);
  return (
    !r.blockerDies ||
    (r.attackerDies && creatureValue(attacker, weights) >= creatureValue(blocker, weights))
  );
}

export class OpponentModel {
  /** The weights the creature values of a sensible block are read with (the agent's). */
  private readonly weights: AgentWeights;
  private offered = 0;
  private made = 0;
  private readonly bySeat = new Map<SeatId, { offered: number; made: number }>();
  private seenTurn = -1;

  constructor(weights: AgentWeights = DEFAULT_WEIGHTS) {
    this.weights = weights;
  }

  /** Reads the declare-blockers step of the agent's own turn, once per turn. */
  observe(view: GameView): void {
    if (
      view.step !== 'declareBlockers' ||
      view.activeSeat !== view.viewer ||
      view.combat === null ||
      view.turn === this.seenTurn
    ) {
      return;
    }
    this.seenTurn = view.turn;
    for (const a of view.combat.attackers) {
      const attacker = view.battlefield.find((o) => o.id === a.object);
      if (attacker === undefined || attacker.controller !== view.viewer) continue;
      if (hasKeyword(attacker, 'menace') || attacker.power === null || attacker.power <= 0)
        continue;
      // The defender is the player attacked; an attack on a permanent has no seat to credit.
      const defender = a.target.kind === 'player' ? a.target.seat : null;
      const offered = potentialBlockers(view, attacker).filter(
        (b) =>
          (defender === null || b.controller === defender) && sensible(attacker, b, this.weights),
      );
      if (offered.length === 0) continue;
      this.offered += 1;
      if (a.blocked) this.made += 1;
      if (defender === null) continue;
      const row = this.bySeat.get(defender) ?? { offered: 0, made: 0 };
      row.offered += 1;
      if (a.blocked) row.made += 1;
      this.bySeat.set(defender, row);
    }
  }

  /**
   * The chance that the opponent lets a creature through when it could block it well: the share of the
   * sensible blocks that were not made, with one made and one missed as the prior (so 1/2 before anything is
   * seen).
   */
  get passiveWeight(): number {
    return (this.offered - this.made + 1) / (this.offered + 2);
  }

  /** The same chance for one defending seat, with the same prior (1/2 before anything is seen of it). */
  passiveWeightFor(seat: SeatId): number {
    const row = this.bySeat.get(seat);
    return row === undefined ? 0.5 : (row.offered - row.made + 1) / (row.offered + 2);
  }

  /** What was counted, for the tests: `[sensible blocks offered, made]`. */
  get counts(): readonly [number, number] {
    return [this.offered, this.made];
  }
}
