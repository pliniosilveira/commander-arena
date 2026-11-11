/**
 * Mana symbol recognizer for AST validation (CR 107.4). A symbol is written without braces,
 * exactly as `ManaSymbol` documents: "2", "G", "W/U", "2/W", "C/B", "W/P", "W/U/P", "S", "X".
 * This is deliberately independent of the mana library: it only says whether a string is a
 * symbol the rules define, not what it costs.
 */

const COLOR_LETTERS = ['W', 'U', 'B', 'R', 'G'] as const;

/** The ten hybrid pairs in the order CR 107.4 prints them. {U/W} is not a symbol. */
const HYBRID_PAIRS: ReadonlySet<string> = new Set([
  'W/U',
  'W/B',
  'U/B',
  'U/R',
  'B/R',
  'B/G',
  'R/G',
  'R/W',
  'G/W',
  'G/U',
]);

function isColorLetter(s: string): boolean {
  return (COLOR_LETTERS as readonly string[]).includes(s);
}

export function isValidManaSymbol(symbol: string): boolean {
  // Numerical symbols {0}, {1}, ... (CR 107.4b, 107.4d). No leading zeros.
  if (/^(0|[1-9][0-9]*)$/.test(symbol)) return true;
  // {W} {U} {B} {R} {G} {C}, the variable symbol {X}, the snow symbol {S}.
  if (isColorLetter(symbol) || symbol === 'C' || symbol === 'X' || symbol === 'S') return true;
  const parts = symbol.split('/');
  if (parts.length === 2) {
    const [a, b] = parts as [string, string];
    if (HYBRID_PAIRS.has(symbol)) return true;
    // Monocolored hybrid {2/W} and colorless hybrid {C/W} (CR 107.4e).
    if ((a === '2' || a === 'C') && isColorLetter(b)) return true;
    // Phyrexian {W/P} (CR 107.4f).
    if (isColorLetter(a) && b === 'P') return true;
    return false;
  }
  if (parts.length === 3) {
    // Hybrid Phyrexian {W/U/P} (CR 107.4f).
    return parts[2] === 'P' && HYBRID_PAIRS.has(`${parts[0]}/${parts[1]}`);
  }
  return false;
}
