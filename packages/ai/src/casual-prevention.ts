/**
 * CasualAgent and damage prevention (CR 615): when to cast a Fog-style spell. The view carries only
 * rules text, so a spell is read from its text, like helpful spells (`casual-helpful.ts`).
 *
 * - The agent casts only the spells that protect it with no target: "Prevent all combat damage that
 *   would be dealt this turn" and "Prevent all damage that would be dealt to you this turn". Any
 *   other text that starts with "Prevent" (a numeric shield, one that names a target or protects
 *   creatures) is never cast: the target scoring favours the opponent's things, and a shield on
 *   creatures does not save the life total.
 * - It casts one only on the opponent's turn, in the declare blockers step once the blocks are known
 *   and before damage, when the unblocked (and trampling) combat damage aimed at it would leave it
 *   with `NEAR_LETHAL_LIFE` life or less. That is lethal damage, or damage that would leave it one
 *   hit from dead. Never otherwise, so a Fog is not wasted on a small attack nor cast in a main phase.
 * - At most once per turn (the loop guard lives in `casual-priority.ts`): once the shield exists a
 *   second copy adds nothing.
 */
import type { GameView, ObjectView } from '@commander-arena/engine';
import { findObject, hasKeyword, ownLife, powerOf, toughnessOf } from './casual-view';

/** The agent casts a prevention spell when the combat damage would leave it this much life or less. */
export const NEAR_LETHAL_LIFE = 5;

const PREVENTION = /^\s*prevent\b/i;
const SELF_SHIELD =
  /^\s*prevent all (combat )?damage that would be (dealt to you|dealt) this turn/i;
const FOG = /^\s*prevent all combat damage that would be dealt this turn/i;

/** An instant or sorcery whose text is a prevention effect. */
export const isPreventionSpell = (o: ObjectView): boolean =>
  (o.types.includes('instant') || o.types.includes('sorcery')) && PREVENTION.test(o.oracleText);

/** The one loop-guard key of a turn: a prevention spell is cast at most once in it. */
export const preventionKey = (view: GameView): string => `prevent:${view.turn}`;

/** Combat damage that would be dealt to the agent's life total if nothing changes (CR 510.1, 702.19b). */
export function incomingCombatDamage(view: GameView): number {
  const combat = view.combat;
  if (combat === null) return 0;
  let total = 0;
  for (const a of combat.attackers) {
    if (a.target.kind !== 'player' || a.target.seat !== view.viewer) continue;
    const attacker = findObject(view, a.object);
    if (attacker === undefined) continue;
    // Double strike deals damage in two steps (CR 702.4b).
    const power = powerOf(attacker) * (hasKeyword(attacker, 'doubleStrike') ? 2 : 1);
    if (!a.blocked) {
      total += power;
    } else if (hasKeyword(attacker, 'trample')) {
      // CR 702.19b: lethal damage to every blocker, the rest to the player (deathtouch makes 1 lethal).
      const lethal = a.blockedBy.reduce((sum, id) => {
        const blocker = findObject(view, id);
        if (blocker === undefined) return sum;
        return (
          sum +
          (hasKeyword(attacker, 'deathtouch')
            ? 1
            : Math.max(0, toughnessOf(blocker) - blocker.damage))
        );
      }, 0);
      total += Math.max(0, power - lethal);
    }
  }
  return total;
}

/** Whether casting this prevention `spell` now is what the file comment describes. */
export function worthCastingPrevention(view: GameView, spell: ObjectView): boolean {
  if (!FOG.test(spell.oracleText) && !SELF_SHIELD.test(spell.oracleText)) return false;
  if (view.activeSeat === view.viewer || view.step !== 'declareBlockers') return false;
  const incoming = incomingCombatDamage(view);
  return incoming > 0 && ownLife(view) - incoming <= NEAR_LETHAL_LIFE;
}
