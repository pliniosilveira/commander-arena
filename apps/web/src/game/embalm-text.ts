import { COLOR_NAMES } from './words';

/** The wording of Embalm (CR 702.128, issue 104): the reminder of its chip and the exceptions of a permanent that enters as a copy when it was embalmed. */

/** The reminder of Embalm (CR 702.128a), for the tooltip of its chip. */
export const EMBALM_REMINDER =
  "Exile this card from your graveyard: create a token that's a copy of it, except it's white, it has no mana cost, and it's a Zombie in addition to its other types. Activate only as a sorcery.";

/** ", except if it was embalmed, the token has no mana cost, it's white, and it's a Zombie in addition to its other types" (CR 707.9b, 702.128b): the exceptions of `entersAsCopy.ifEmbalmed`. */
export function embalmedExceptionText(exceptions: {
  readonly setColors?: readonly string[];
  readonly noManaCost?: true;
  readonly addSubtypes?: readonly string[];
}): string {
  const parts: string[] = [];
  if (exceptions.noManaCost === true) parts.push('the token has no mana cost');
  if (exceptions.setColors !== undefined && exceptions.setColors.length === 1) {
    parts.push(`it's ${COLOR_NAMES[exceptions.setColors[0] ?? ''] ?? 'colorless'}`);
  }
  if (exceptions.addSubtypes !== undefined && exceptions.addSubtypes.length > 0) {
    parts.push(`it's a ${exceptions.addSubtypes.join(' ')} in addition to its other types`);
  }
  if (parts.length === 0) return '';
  const last = parts.pop();
  const list = parts.length === 0 ? (last ?? '') : `${parts.join(', ')}, and ${last}`;
  return `, except if it was embalmed, ${list}`;
}
