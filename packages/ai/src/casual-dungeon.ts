/**
 * CasualAgent's answer to "which room do you move your venture marker into" (CR 701.49b, 309.5a; `chooseOption` of purpose `dungeonRoom`, the options are the names of the rooms).
 * A room is worth what its room ability does for the player now: Trap! (an opponent loses 5 life) and Archives (a card) and Catacombs (a 4/1 body) most, Forge (two +1/+1 counters)
 * when the player controls a creature to put them on (with none it is worth the least), then Arena, Stash and Lost Well. The most valuable room is chosen; ties go to the option listed first, so the answer is
 * deterministic and uses no randomness. Only what the view shows is read (the battlefield is public).
 */
import type { Action, ChooseOptionDecision, GameView } from '@commander-arena/engine';

/** What a room is worth, by the name the card prints, for a player who controls `creatures` creatures. */
function roomValue(name: string, creatures: number): number {
  switch (name) {
    case 'Trap!':
      return 5;
    case 'Archives':
    case 'Catacombs':
      return 4;
    case 'Forge':
      return creatures > 0 ? 4 : 1;
    case 'Arena':
    case 'Stash':
      return 2;
    case 'Lost Well':
      return 1.5;
    default:
      return 0;
  }
}

export function chooseDungeonRoom(view: GameView, d: ChooseOptionDecision): Action {
  const creatures = view.battlefield.filter(
    (o) => o.controller === view.viewer && o.types.includes('creature'),
  ).length;
  let best: string | undefined;
  for (const option of d.options) {
    if (best === undefined || roomValue(option, creatures) > roomValue(best, creatures)) {
      best = option;
    }
  }
  if (best === undefined) throw new Error('a choice with no options');
  return { kind: 'chooseOption', option: best };
}
