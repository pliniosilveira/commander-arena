/**
 * "If you cast a creature spell this way, it gains haste and "At the beginning of the end step, sacrifice this creature."" (Strago and Relm, CR 608.2g, 613.1f, 400.7): the
 * `castFree.creatureGains` rider. The spell carries the abilities (`StackData.creatureGains`); as it enters the battlefield as a creature, the permanent has each of them for as
 * long as it stays there, one layer 6 effect for each in the order they are written (as Backup's grant does, CR 702.165a). A spell that is not a creature, or never becomes a
 * permanent, gives nothing: the permanent is a new object (CR 400.7), and a creature that leaves and comes back has none of them.
 */
import type { ObjectId } from '../ids';
import { allocateTimestamp } from '../state/ops';
import type { GameState, StackData } from '../state/types';

export function applyCreatureGains(
  state: GameState,
  id: ObjectId,
  gains: NonNullable<StackData['creatureGains']>,
): GameState {
  let next = state;
  if (next.objects[id] === undefined) return state;
  for (const ability of gains) {
    const [stamp, stamped] = allocateTimestamp(next);
    next = {
      ...stamped,
      continuousEffects: [
        ...stamped.continuousEffects,
        {
          id: `ce${stamp}`,
          timestamp: stamp,
          objects: [id],
          until: 'permanent',
          change: { kind: 'grantAbility', ability },
        },
      ],
    };
  }
  return next;
}
