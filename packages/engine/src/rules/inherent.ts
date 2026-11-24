/**
 * The inherent abilities that belong to no object (D-127, D-196): the two of the monarch (CR 725.2) and the three of the Ring (CR 701.54c). Each is
 * shown on the stack under the name of the thing it belongs to, with the rule's own text.
 */
import type { InherentAbility } from '../state/types';
import { ROOM_TEXT } from './dungeon';
import { INITIATIVE_TEXT } from './initiative';
import { MONARCH_TEXT } from './monarch';
import { RING_TEXT } from './ring';
import { SPEED_TEXT } from './speed';

/** The full text of an inherent ability, as the rule words it. */
export const INHERENT_TEXT: Readonly<Record<InherentAbility, string>> = {
  ...MONARCH_TEXT,
  ...RING_TEXT,
  ...SPEED_TEXT,
  ...INITIATIVE_TEXT,
  ...ROOM_TEXT,
};

/** What an inherent ability is shown as: "The monarch", "The Ring", "Speed", "The initiative" or the name of a dungeon. */
export function inherentName(ability: InherentAbility): string {
  if (ability === 'speedUp') return 'Speed';
  // CR 726.2: the initiative's three abilities; CR 309.4c: a room ability has the dungeon card as its source.
  if (ability.startsWith('initiative')) return 'The initiative';
  if (ability.startsWith('undercity:')) return 'Undercity';
  return ability === 'monarchDraw' || ability === 'monarchSteal' ? 'The monarch' : 'The Ring';
}
