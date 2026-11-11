import { isValidManaSymbol, parseManaCost } from '@commander-arena/engine';

export interface ConvertedManaCost {
  /** Symbols without braces, e.g. ["2", "W", "U/B"]; null when the card has no mana cost. */
  readonly symbols: string[] | null;
  /** Problems that make the cost unusable by the engine. */
  readonly problems: string[];
}

/**
 * Converts Scryfall's mana cost string ("{2}{W}{U/B}") into the engine's symbol array. An empty
 * string is "no mana cost" (CR 202.1), which is null, not an empty cost. Symbols the engine does
 * not accept, and hybrid Phyrexian symbols that its cost parser cannot represent yet, are
 * reported as problems so the card is marked unsupported instead of failing at cast time.
 */
export function convertManaCost(manaCost: string): ConvertedManaCost {
  const trimmed = manaCost.trim();
  if (trimmed === '') return { symbols: null, problems: [] };
  const symbols: string[] = [];
  const problems: string[] = [];
  const re = /\{([^{}]*)\}/g;
  let consumed = 0;
  for (const m of trimmed.matchAll(re)) {
    if (m.index !== consumed) problems.push(`unreadable mana cost "${trimmed}"`);
    consumed = m.index + m[0].length;
    const symbol = m[1] ?? '';
    if (!isValidManaSymbol(symbol)) problems.push(`unknown mana symbol {${symbol}}`);
    symbols.push(symbol);
  }
  if (consumed !== trimmed.length && problems.length === 0) {
    problems.push(`unreadable mana cost "${trimmed}"`);
  }
  if (symbols.length === 0) return { symbols: null, problems: [...new Set(problems)] };
  if (problems.length === 0) {
    try {
      parseManaCost(symbols);
    } catch (e) {
      problems.push(e instanceof Error ? e.message : `unusable mana cost "${trimmed}"`);
    }
  }
  return { symbols, problems: [...new Set(problems)] };
}
