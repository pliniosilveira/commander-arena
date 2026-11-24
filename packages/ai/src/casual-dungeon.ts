/**
 * CasualAgent's answer to "which room does the venture marker move to" (`purpose` 'dungeonRoom', CR 701.49b, 309.5a): the options are the rooms the arrows of the
 * room it is on point to. The agent takes the room whose ability is worth most to it right now: a body or cards, life loss for an opponent, counters on a creature it
 * controls, a goad of an opponent's creature, and last a scry. A room that needs a creature to be of use (the counters, the goad) is only liked when there is one to
 * target. The rooms are known by the id the engine gives them (`data/dungeons.ts`); one it does not know ranks last, so every answer is one of the options and
 * deterministic (ties go to the first option).
 */
import type { Action, ChooseOptionDecision, GameView } from '@commander-arena/engine';

/** The worth of a room, the higher the better: Undercity's rooms by what their ability does. */
const ROOM_VALUE: Readonly<Record<string, number>> = {
  'throne-of-the-dead-three': 9,
  trap: 8,
  catacombs: 7,
  archives: 6,
  forge: 5,
  stash: 4,
  arena: 3,
  'lost-well': 2,
};

function roomValue(view: GameView, seat: number, room: string): number {
  const base = ROOM_VALUE[room] ?? 0;
  const creatures = view.battlefield.filter((o) => o.types.includes('creature'));
  // Counters on a creature of its own, a goad of one of an opponent's: no creature to use them on, no worth.
  if (room === 'forge' && !creatures.some((o) => o.controller === seat)) return 0;
  if (room === 'arena' && !creatures.some((o) => o.controller !== seat)) return 0;
  return base;
}

export function chooseDungeonRoom(view: GameView, d: ChooseOptionDecision): Action {
  let best: string | undefined;
  for (const option of d.options) {
    if (best === undefined || roomValue(view, d.seat, option) > roomValue(view, d.seat, best)) {
      best = option;
    }
  }
  if (best === undefined) throw new Error('a choice with no options');
  return { kind: 'chooseOption', option: best };
}
