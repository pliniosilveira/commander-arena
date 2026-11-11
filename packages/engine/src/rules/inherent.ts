/**
 * The inherent abilities that belong to no object (D-127, D-196): the two of the monarch (CR 725.2) and the three of the Ring (CR 701.54c). Each is
 * shown on the stack under the name of the thing it belongs to, with the rule's own text.
 */
import type { InherentAbility } from '../state/types';
import { MONARCH_TEXT } from './monarch';
import { RING_TEXT } from './ring';

/** The full text of an inherent ability, as the rule words it. */
export const INHERENT_TEXT: Readonly<Record<InherentAbility, string>> = {
  ...MONARCH_TEXT,
  ...RING_TEXT,
};

/** What an inherent ability is shown as: "The monarch" or "The Ring". */
export function inherentName(ability: InherentAbility): string {
  return ability === 'monarchDraw' || ability === 'monarchSteal' ? 'The monarch' : 'The Ring';
}
