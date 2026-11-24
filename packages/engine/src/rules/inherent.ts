/**
 * The inherent abilities that belong to no object (D-127, D-196): the two of the monarch (CR 725.2) and the three of the Ring (CR 701.54c). Each is
 * shown on the stack under the name of the thing it belongs to, with the rule's own text.
 */
import type { InherentAbility } from '../state/types';
import { roomDungeonName, roomOfInherent, roomText } from './dungeon';
import { INITIATIVE_TEXT } from './initiative';
import { MONARCH_TEXT } from './monarch';
import { RING_TEXT } from './ring';
import { SPEED_TEXT } from './speed';

const FIXED_TEXT: Readonly<Record<Exclude<InherentAbility, `room:${string}`>, string>> = {
  ...MONARCH_TEXT,
  ...INITIATIVE_TEXT,
  ...RING_TEXT,
  ...SPEED_TEXT,
};

/** The full text of an inherent ability, as the rule words it; a room ability shows the text of its room. */
export function inherentText(ability: InherentAbility): string {
  const room = roomOfInherent(ability);
  return room === null ? FIXED_TEXT[ability as keyof typeof FIXED_TEXT] : roomText(room);
}

/** What an inherent ability is shown as: "The monarch", "The initiative", "The Ring", "Speed" or the dungeon of a room ability. */
export function inherentName(ability: InherentAbility): string {
  if (ability === 'speedUp') return 'Speed';
  const room = roomOfInherent(ability);
  if (room !== null) return roomDungeonName(room);
  if (
    ability === 'initiativeUpkeep' ||
    ability === 'initiativeDamage' ||
    ability === 'initiativeTaken'
  )
    return 'The initiative';
  return ability === 'monarchDraw' || ability === 'monarchSteal' ? 'The monarch' : 'The Ring';
}
