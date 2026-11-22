/**
 * The companion (CR 702.139a, 116.2g, SPEC A35): bringing it into the hand is a special action that costs {3}, once
 * per game, and is card advantage, so the agent brings it eventually. The engine lists `bringCompanion` only when it
 * is legal and the {3} is payable (the seat's own turn, an empty stack, a main phase). The agent takes it only in its
 * own second main phase and only after every other use of its mana was considered: `casual-priority.ts` calls
 * `chooseBringCompanion` once no worthwhile spell, special action, face-down turn-up or Room unlock is left, so the
 * {3} comes out of mana that would go unused this turn. Combat is over by then, so no trick it held open is spent.
 * Once the card is in the hand the ordinary casting rules apply to it. The choice uses no randomness.
 */
import type { Action, GameView, PriorityDecision } from '@commander-arena/engine';

/** `bringCompanion` when the agent should take it now, or null. */
export function chooseBringCompanion(view: GameView, d: PriorityDecision): Action | null {
  if (view.activeSeat !== view.viewer || view.step !== 'postcombatMain') return null;
  if (view.stack.length > 0) return null;
  return d.options.some((o) => o.kind === 'bringCompanion') ? { kind: 'bringCompanion' } : null;
}
