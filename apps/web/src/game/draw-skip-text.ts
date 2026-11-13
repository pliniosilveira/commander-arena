/**
 * The words of the replacement of a card draw (D-332, CR 614.11): "If you would draw a card, skip that draw instead", with the condition a
 * "while" names ("while your library has no cards in it"). Composed from the AST. A `while` the words do not cover gives `null`, and the
 * card's Oracle text stays the only description (AGENTS.md "Honesty"). Pure.
 */
import type { Condition, Replacement } from '@commander-arena/engine';

/** "your library has no cards in it", "your library has fewer than 3 cards in it": a condition on the library of the controller, as a "while" says it. */
function libraryWhile(condition: Condition): string | null {
  if (condition.kind !== 'cardsInLibrary') return null;
  const { cmp, value } = condition.compare;
  if (cmp === 'atMost') {
    return value === 0
      ? 'your library has no cards in it'
      : `your library has fewer than ${value + 1} cards in it`;
  }
  return cmp === 'atLeast'
    ? `your library has ${value} or more cards in it`
    : `your library has exactly ${value} cards in it`;
}

/** "If you would draw a card while your library has no cards in it, skip that draw instead"; null for a `while` the words do not cover. */
export function skipDrawWording(
  replacement: Extract<Replacement, { kind: 'skipDraw' }>,
): string | null {
  if (replacement.while === undefined) return 'If you would draw a card, skip that draw instead';
  const when = libraryWhile(replacement.while);
  return when === null ? null : `If you would draw a card while ${when}, skip that draw instead`;
}
