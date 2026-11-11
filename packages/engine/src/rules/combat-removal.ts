/**
 * Taking a creature out of the combat in progress (CR 506.4): regeneration (CR 701.19a) and a change of controller (CR 506.4, 613.1b) do it.
 */
import type { ObjectId } from '../ids';
import type { GameState } from '../state/types';

/** CR 506.4: takes `id` out of the combat in progress, as an attacker or as a blocker. */
export function removeFromCombat(
  state: GameState,
  id: ObjectId,
): { state: GameState; removed: boolean } {
  const combat = state.combat;
  if (combat === null) return { state, removed: false };
  const attacking = combat.attackers.some((a) => a.object === id);
  const blocking = combat.blocks.some((b) => b.blocker === id);
  if (!attacking && !blocking) return { state, removed: false };
  return {
    state: {
      ...state,
      combat: {
        ...combat,
        // A creature blocked by it stays blocked (CR 509.1h): only its entry in the list of blocks goes.
        attackers: combat.attackers.filter((a) => a.object !== id),
        blocks: combat.blocks.filter((b) => b.blocker !== id && b.attacker !== id),
      },
    },
    removed: true,
  };
}

/**
 * CR 506.4, 506.4c (D-200): the planeswalker or battle `id` was removed from combat because its controller or protector changed: it stops being attacked. The
 * creatures that attacked it stay in combat (they may be blocked by their defending player) and, unblocked, deal no combat damage. Returns the state and
 * whether any creature was attacking it.
 */
export function removeAttackedFromCombat(
  state: GameState,
  id: ObjectId,
): { state: GameState; removed: boolean } {
  const combat = state.combat;
  if (combat === null) return { state, removed: false };
  const attacked = combat.attackers.some(
    (a) => a.target.kind === 'permanent' && a.target.object === id,
  );
  if (!attacked) return { state, removed: false };
  return {
    state: {
      ...state,
      combat: {
        ...combat,
        attackers: combat.attackers.map((a) =>
          a.target.kind === 'permanent' && a.target.object === id
            ? { ...a, targetGone: true as const }
            : a,
        ),
      },
    },
    removed: true,
  };
}
