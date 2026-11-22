/**
 * The companion conditions the engine understands (CR 702.139a, Companion): the closed set of `CompanionCondition`, with the sentence of the real card that states each one. The parser
 * rule `keyword.companion` reads the same sentences, and the deck check (`companion.ts`) finds a stored card's condition by them. A condition is added here only with the real
 * Oracle text of its card, never from memory.
 */
import type { CompanionCondition } from '@commander-arena/engine';

export interface KnownCompanionCondition {
  readonly condition: CompanionCondition;
  /** The sentence that follows "Companion —", without the final period and without reminder text. */
  readonly sentence: string;
}

/** Jegantha, the Wellspring. */
export const NO_REPEATED_MANA_SYMBOL_SENTENCE =
  'No card in your starting deck has more than one of the same mana symbol in its mana cost';

export const KNOWN_COMPANION_CONDITIONS: readonly KnownCompanionCondition[] = [
  {
    condition: { kind: 'noRepeatedManaSymbol' },
    sentence: NO_REPEATED_MANA_SYMBOL_SENTENCE,
  },
];

/** The line "Companion — [condition]" of a card's Oracle text, as written: what follows the dash. Null when the card has no such line. */
function companionLine(text: string): string | null {
  const match = /^Companion\s*[—–]\s*(.*)$/m.exec(text);
  return match?.[1] ?? null;
}

/** Does the stored card have a companion ability (CR 702.139a), whatever its condition? */
export function hasCompanionAbility(card: {
  readonly keywords: readonly string[];
  readonly faces: readonly { readonly oracleText: string }[];
}): boolean {
  if (card.keywords.some((k) => k.toLowerCase() === 'companion')) return true;
  return companionLine(card.faces.map((f) => f.oracleText).join('\n')) !== null;
}

/**
 * The condition of a card's companion ability, or null when the card has none or its condition is not one of the known ones (the caller tells the two apart with
 * `hasCompanionAbility`). Reminder text in parentheses and the final period are not part of the condition.
 */
export function companionConditionOf(card: {
  readonly faces: readonly { readonly oracleText: string }[];
}): CompanionCondition | null {
  const line = companionLine(card.faces.map((f) => f.oracleText).join('\n'));
  if (line === null) return null;
  const sentence = line
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.$/, '');
  return KNOWN_COMPANION_CONDITIONS.find((k) => k.sentence === sentence)?.condition ?? null;
}
