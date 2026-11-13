/**
 * Reason codes (M7b, PRIOR_ART 7.2 heuristic 7): every decision an explaining agent takes is written
 * down as the decision kind, a short summary of the chosen action and one reason from a small closed
 * set. Decisions are already data; the reason makes them reviewable. A scenario test can assert both
 * the action and its reason, and the match harness counts them into a histogram.
 *
 * This is not part of the `Agent` interface (which stays as it is): an agent that explains itself
 * implements `ExplainingAgent`.
 */
import type { Action, DecisionKind, GameView } from '@commander-arena/engine';
import type { Agent } from './agent';
import { findObject } from './casual-view';

export const REASONS = [
  /** A land was played (one a turn is the plan). */
  'land',
  /** A spell was cast: the most expensive one that can be cast (mana on curve). */
  'curve',
  /** Nothing worth doing at priority: pass. */
  'no-play',
  /** The attack (or the all-out attack) is lethal after the opponent's best blocks. */
  'lethal',
  /** Every creature declared had to attack (it attacks each combat if able). */
  'must-attack',
  /** Attackers that no untapped potential blocker can kill. */
  'safe-attack',
  /** Creatures were held back because some blocker could kill them. */
  'hold-back',
  /** An attack was possible but no creature could attack. */
  'no-attackers',
  /** Blockers were declared because the unblocked damage would be lethal. */
  'chump-danger',
  /** No block: the attack does not threaten the game. */
  'no-block',
  /** A blocker that survives, or kills the attacker, blocked (HeuristicAgent, tier 1). */
  'good-block',
  /** A trade of creatures where the attacker is worth at least the blocker (tier 2). */
  'trade-block',
  /** Two creatures blocked one attacker and kill it, losing at most one (tier 3). */
  'gang-block',
  /** The attack that scored best when played out on a sample of the game. */
  'sim-attack',
  /** Creatures were kept home so that the opponent's next attack does not leave the agent in danger. */
  'crack-back',
  /** An attack chosen because the agent decks first and must win before it does (the library clock). */
  'deck-race',
  /** A hand was kept (HeuristicAgent). */
  'keep',
  /** A hand was sent back for a new one (HeuristicAgent). */
  'mulligan',
  /** A land played because it lets a spell be cast this turn or adds a colour the hand needs. */
  'land-fix',
  /** A land played after combat: nothing needed it before. */
  'land-late',
  /** The commander was cast. */
  'commander',
  /** A removal spell was cast at a target worth it. */
  'removal',
  /** A removal spell was cast on an attacking creature. */
  'removal-attacker',
  /** A combat trick (a pump, a keyword) was cast after blockers because it changes the result. */
  'trick',
  /** An instant-speed play made in the opponent's end step. */
  'end-step',
  /** A counterspell cast in response to the opponent's spell. */
  'counter',
  /** An Aura with flash for a commander (D-408) was cast in response to a removal that targets the agent's commander. */
  'protect-commander',
  /** A play was held back for a better window. */
  'hold',
  /** The target of a removal spell is the opposing commander. */
  'target-commander',
  /** The target of a removal spell is the best target by score. */
  'target-best',
  /** A face-down permanent of the agent's was turned face up because it is worth more as the card (D-313). */
  'face-up',
  /** A loyalty ability of a planeswalker of the agent's was activated (D-203). */
  'loyalty',
  /** The decision was answered by the casual handlers (choices, targets, payments, ...). */
  'delegated',
] as const;

export type Reason = (typeof REASONS)[number];

export interface ReasonRecord {
  readonly decisionKind: DecisionKind;
  /** The chosen action in a few words, e.g. "castSpell Serra Angel" or "declareAttackers x3". */
  readonly action: string;
  readonly reason: Reason;
}

/** An agent that records why it chose what it chose, oldest first. */
export interface ExplainingAgent extends Agent {
  readonly reasons: readonly ReasonRecord[];
}

export const isExplaining = (agent: Agent): agent is ExplainingAgent =>
  'reasons' in agent && Array.isArray((agent as { reasons?: unknown }).reasons);

/** The count of each reason in a list of records (reasons that never occurred are left out). */
export function reasonHistogram(records: readonly ReasonRecord[]): Partial<Record<Reason, number>> {
  const counts: Partial<Record<Reason, number>> = {};
  for (const r of records) counts[r.reason] = (counts[r.reason] ?? 0) + 1;
  return counts;
}

/** A short summary of an action for the record: its kind, the card it names and a count for a declaration. */
export function summarizeAction(view: GameView, action: Action): string {
  switch (action.kind) {
    case 'castSpell':
    case 'playLand': {
      const name = findObject(view, action.object)?.name;
      return name === undefined ? action.kind : `${action.kind} ${name}`;
    }
    case 'declareAttackers':
      return `declareAttackers x${action.attacks.length}`;
    case 'declareBlockers':
      return `declareBlockers x${action.blocks.length}`;
    default:
      return action.kind;
  }
}
