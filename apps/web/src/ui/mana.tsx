/**
 * Mana symbols drawn in original style (circles with a letter or number). Not Wizards' mana-font
 * glyphs: bundling those is an open licensing decision (docs/ROADMAP.md).
 */

const COLOR_CLASS: Readonly<Record<string, string>> = {
  W: 'mana-w',
  U: 'mana-u',
  B: 'mana-b',
  R: 'mana-r',
  G: 'mana-g',
  C: 'mana-c',
  S: 'mana-s',
  X: 'mana-x',
};

function symbolClass(symbol: string): string {
  if (symbol.includes('/')) return 'mana-hybrid';
  return COLOR_CLASS[symbol] ?? 'mana-generic';
}

export function ManaSymbol({ symbol }: { symbol: string }) {
  return (
    <span className={`mana ${symbolClass(symbol)}`} role="img" aria-label={`${symbol} mana`}>
      {symbol.replace('/', '')}
    </span>
  );
}

export function ManaCost({ cost }: { cost: readonly string[] | null }) {
  if (cost === null || cost.length === 0) return null;
  return (
    <span className="mana-cost">
      {cost.map((symbol, i) => (
        // Symbols can repeat ({R}{R}), so the position is the only stable key.
        // biome-ignore lint/suspicious/noArrayIndexKey: positional list of symbols
        <ManaSymbol key={i} symbol={symbol} />
      ))}
    </span>
  );
}
