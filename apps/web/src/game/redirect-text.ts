/**
 * The words of the damage redirection slice (D-192, CR 614.9, 514.2): "All damage that would be dealt to you and other permanents you control is
 * dealt to this creature instead." and "Damage isn't removed from this creature during cleanup steps." Composed from the AST: the group of
 * recipients is worded from its filter (`groupPhrase`), never from a card name. A shape the words do not cover gives `null`, and the card's Oracle
 * text stays the only description (AGENTS.md "Honesty"). Pure.
 */
import type { Replacement } from '@commander-arena/engine';
import { thingsPhrase } from './filter-text';

/** "Damage isn't removed from this creature during cleanup steps" (no period). */
export function keepsDamageWording(noun: string): string {
  return `Damage isn't removed from this ${noun} during cleanup steps`;
}

/** "All damage that would be dealt to you and other permanents you control is dealt to this creature instead" (no period); null for a group the words cannot say. */
export function redirectDamageWording(
  replacement: Extract<Replacement, { kind: 'redirectDamage' }>,
  noun: string,
): string | null {
  // "other permanents you control": a redirection never applies to damage dealt to its own creature, so the group is worded with "other".
  const group =
    replacement.permanents === undefined || replacement.permanents.anyOf !== undefined
      ? null
      : (thingsPhrase({ ...replacement.permanents, other: true }, true)?.replace(
          ' on the battlefield',
          '',
        ) ?? null);
  if (replacement.permanents !== undefined && group === null) return null;
  const recipients = [...(replacement.you ? ['you'] : []), ...(group === null ? [] : [group])];
  if (recipients.length === 0) return null;
  return `All damage that would be dealt to ${recipients.join(' and ')} is dealt to this ${noun} instead`;
}
