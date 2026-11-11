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
 * Only public information is read: the combat of the view, in the declare-blockers step of the agent's own
 * turn. The count lives as long as the agent (one game).
 */
import type { GameView, ObjectView } from '@commander-arena/engine';
import { hasKeyword } from './casual-view';
import { creatureValue } from './evaluate';
import { potentialBlockers } from './greedy-combat';
import { duel } from './heuristic-duel';

/** Whether `blocker` blocking `attacker` is a block a sensible player makes. */
function sensible(attacker: ObjectView, blocker: ObjectView): boolean {
  const r = duel(attacker, blocker);
  return !r.blockerDies || (r.attackerDies && creatureValue(attacker) >= creatureValue(blocker));
}

export class OpponentModel {
  private offered = 0;
  private made = 0;
  private seenTurn = -1;

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
      if (!potentialBlockers(view, attacker).some((b) => sensible(attacker, b))) continue;
      this.offered += 1;
      if (a.blocked) this.made += 1;
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

  /** What was counted, for the tests: `[sensible blocks offered, made]`. */
  get counts(): readonly [number, number] {
    return [this.offered, this.made];
  }
}
