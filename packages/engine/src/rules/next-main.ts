import type { GameState } from '../state/types';

/**
 * The main phase "your next main phase" names, found as a delayed trigger is created (D-217, CR 603.7a, 500.1): in the controller's own turn before the precombat
 * main phase begins, that phase; in it or in combat, the postcombat main phase of the turn; later, or in another player's turn, the precombat main phase of the
 * controller's next turn. A phase that has begun does not trigger it.
 */
export function nextMainStep(state: GameState, controller: number): 'main1' | 'main2' {
  if (state.turn.activeSeat !== controller) return 'main1';
  switch (state.turn.step) {
    case 'untap':
    case 'upkeep':
    case 'draw':
      return 'main1';
    case 'precombatMain':
    case 'beginningOfCombat':
    case 'declareAttackers':
    case 'declareBlockers':
    case 'firstStrikeDamage':
    case 'combatDamage':
    case 'endOfCombat':
      return 'main2';
    default:
      return 'main1';
  }
}
