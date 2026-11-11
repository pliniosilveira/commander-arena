/**
 * The decision layer's local state: what the player has picked so far in the current decision.
 * It belongs to one decision id and is reset when the engine asks the next question.
 */
import {
  type AttackTarget,
  type ChosenTarget,
  type DamageAssignment,
  type DecisionId,
  defaultDivision,
  type ObjectId,
  type PendingDecision,
  type SeatId,
} from '@commander-arena/engine';
import { type Arrangement, defaultArrangement, NO_ARRANGEMENT } from './arrange';
import { type AttackPick, requiredAttacks } from './attack';
import { type BlockState, NO_BLOCKS } from './block';
import { defaultResolveOrder, type ResolveOrder } from './order';
import type { Tap } from './payment';
import { initialUntap, isUntapChoice } from './untap';
import { initialX } from './x-picker';

export interface UiState {
  readonly decisionId: DecisionId | null;
  readonly attacks: readonly AttackPick[];
  /** Where new attackers go: set by clicking a player strip. */
  readonly preferredTarget: AttackTarget | null;
  readonly block: BlockState;
  readonly targets: readonly ChosenTarget[];
  readonly taps: readonly Tap[];
  readonly cards: readonly ObjectId[];
  /** Permanents picked for a choosePermanent decision. */
  readonly permanents: readonly ObjectId[];
  /** Players picked for a proliferate choice (D-149, CR 701.34a): the players whose poison counters grow. */
  readonly players: readonly SeatId[];
  /** Cards picked for a chooseCards decision (search, discard), in the order they were picked. */
  readonly found: readonly ObjectId[];
  /** Where the cards of an arrangeCards decision (scry, surveil, reorder) are placed so far. */
  readonly arrange: Arrangement;
  /** The trigger order shown for an orderTriggers decision: indices, first to resolve first. */
  readonly triggerOrder: ResolveOrder;
  readonly damage: readonly DamageAssignment[];
  /** The X being announced for a chooseX decision (D-103). */
  readonly x: number;
  /** The modes picked for a chooseModes decision (D-114): indices in printed order. */
  readonly modes: readonly number[];
  /** The creatures, artifacts or graveyard cards picked for a choosePayOptions decision (D-120). */
  readonly payOptions: readonly ObjectId[];
  /** A source whose mana color (or ability) the player is choosing, and where its popover goes. */
  readonly chooser: ChooserAnchor | null;
}

export interface ChooserAnchor {
  readonly object: ObjectId;
  /** While paying: the ability of the source whose color is being chosen. */
  readonly abilityIndex?: number;
  /** While paying, for a source that sacrifices a permanent of a kind and also asks a color (D-222): the permanent already chosen, the color is asked next. */
  readonly sacrifice?: ObjectId;
  /** The card the popover points at, in the coordinates of the decision layer (issue 85). */
  readonly left: number;
  readonly top: number;
  /** The foot of the card; the popover opens under it when it fits, above `top` when it does not. */
  readonly bottom?: number;
}

export function initialUi(pending: PendingDecision | null): UiState {
  return {
    decisionId: pending?.id ?? null,
    attacks: pending?.kind === 'declareAttackers' ? requiredAttacks(pending, null) : [],
    preferredTarget: null,
    block: NO_BLOCKS,
    // A copy of a spell starts with the targets it has: keeping them is an answer (CR 707.10c, D-129).
    targets: pending?.kind === 'targets' && pending.forCopy === true ? (pending.current ?? []) : [],
    taps: [],
    cards: [],
    // The untap step's checklist starts with every permanent checked (they all untap).
    permanents:
      pending?.kind === 'choosePermanent' && isUntapChoice(pending) ? initialUntap(pending) : [],
    players: [],
    found: [],
    arrange: pending?.kind === 'arrangeCards' ? defaultArrangement(pending) : NO_ARRANGEMENT,
    triggerOrder: pending?.kind === 'orderTriggers' ? defaultResolveOrder(pending) : [],
    damage: pending?.kind === 'assignDamage' ? defaultDivision(pending.choices) : [],
    x: pending?.kind === 'chooseX' ? initialX(pending) : 0,
    modes: [],
    // The engine's own suggestion is the starting answer; the player edits it.
    payOptions: pending?.kind === 'choosePayOptions' ? pending.suggested : [],
    chooser: null,
  };
}

/** The state to show: the stored one while it belongs to this decision, a fresh one otherwise. */
export function uiFor(stored: UiState, pending: PendingDecision | null): UiState {
  return stored.decisionId === (pending?.id ?? null) ? stored : initialUi(pending);
}
