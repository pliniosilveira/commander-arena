/**
 * Mana cost parsing and mana value (CR 107.4 Mana Symbols, CR 202.3 Mana Cost and Color).
 * Symbols are written without braces: "2", "W", "W/U", "2/G", "W/P", "S", "X", "C".
 */
import type { Color } from '../characteristics';
import type { HybridOption, ManaColor, ManaCost } from './types';

const COLORS: readonly Color[] = ['W', 'U', 'B', 'R', 'G'];
const NUMBER = /^(0|[1-9][0-9]*)$/;

function isColor(s: string | undefined): s is Color {
  return s !== undefined && (COLORS as readonly string[]).includes(s);
}

function unknownSymbol(symbol: string, why?: string): Error {
  return new Error(`Unknown mana symbol "${symbol}"${why ? ` (${why})` : ''}`);
}

/** The pieces of one parsed symbol; a cost is the sum of its symbols. */
type ParsedSymbol =
  | { kind: 'generic'; n: number }
  | { kind: 'x' }
  | { kind: 'colored'; color: ManaColor }
  | { kind: 'snow' }
  | { kind: 'hybrid'; options: readonly HybridOption[] }
  | { kind: 'phyrexian'; color: Color };

function parseSymbol(symbol: string): ParsedSymbol {
  if (NUMBER.test(symbol)) return { kind: 'generic', n: Number(symbol) };
  if (symbol === 'X') return { kind: 'x' };
  if (symbol === 'S') return { kind: 'snow' }; // CR 107.4h (snow mana symbol)
  if (isColor(symbol) || symbol === 'C') return { kind: 'colored', color: symbol }; // CR 107.4a, 107.4c
  const parts = symbol.split('/');
  const [a, b, c] = parts;
  if (parts.length === 2 && a !== undefined && b !== undefined) {
    // Phyrexian mana, CR 107.4f
    if (b === 'P' && isColor(a)) return { kind: 'phyrexian', color: a };
    // Hybrid, CR 107.4e: two different colors, or colorless with a color (C/W)
    if (isColor(a) && isColor(b) && a !== b) {
      return { kind: 'hybrid', options: [{ color: a }, { color: b }] };
    }
    if (a === 'C' && isColor(b)) return { kind: 'hybrid', options: [{ color: 'C' }, { color: b }] };
    // Monocolored hybrid, CR 107.4e: {2/W} is one W or two generic
    if (a === '2' && isColor(b)) return { kind: 'hybrid', options: [{ generic: 2 }, { color: b }] };
  }
  if (parts.length === 3 && a !== undefined && b !== undefined && c === 'P') {
    throw unknownSymbol(
      symbol,
      'hybrid Phyrexian symbols (CR 107.4f) are not representable in ManaCost yet',
    );
  }
  throw unknownSymbol(symbol);
}

/** Parse a list of mana symbols (without braces) into a ManaCost. CR 107.4. */
export function parseManaCost(symbols: readonly string[]): ManaCost {
  let generic = 0;
  let x = 0;
  let snow = 0;
  const colored: Record<ManaColor, number> = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  const hybrid: (readonly HybridOption[])[] = [];
  const phyrexian: Color[] = [];
  for (const symbol of symbols) {
    const parsed = parseSymbol(symbol);
    switch (parsed.kind) {
      case 'generic':
        generic += parsed.n;
        break;
      case 'x':
        x += 1;
        break;
      case 'colored':
        colored[parsed.color] += 1;
        break;
      case 'snow':
        snow += 1;
        break;
      case 'hybrid':
        hybrid.push(parsed.options);
        break;
      case 'phyrexian':
        phyrexian.push(parsed.color);
        break;
    }
  }
  return { generic, x, colored, snow, hybrid, phyrexian };
}

/**
 * Mana value of a mana cost (CR 202.3): X counts as 0 off the stack (CR 202.3e), a hybrid symbol
 * counts its largest component (CR 202.3f) and each Phyrexian symbol counts 1 (CR 202.3g).
 */
export function manaValue(symbols: readonly string[]): number {
  const cost = parseManaCost(symbols);
  let total = cost.generic + cost.snow + cost.phyrexian.length;
  for (const n of Object.values(cost.colored)) total += n;
  for (const options of cost.hybrid) {
    total += Math.max(...options.map((o) => ('generic' in o ? o.generic : 1)));
  }
  return total;
}
