/** The tokens the cards of a deck can create, for the token section of the deck screen. */
import { tokenSearchQuery } from '@commander-arena/cards';
import { TOKEN_PRESETS, type TokenDefinition } from '@commander-arena/engine';
import type { ImportedEntry } from '../../import/types';
import { tokenChoiceKey } from '../board/token-choices';

export interface DeckToken {
  /** What identifies the token for art choices (`tokenChoiceKey`). */
  readonly key: string;
  readonly definition: TokenDefinition;
  /** Names of the cards of the deck that make it, in deck order. */
  readonly cards: readonly string[];
}

/** Every token definition an ability tree names: a predefined token or a custom one, found wherever an effect creates it. */
export function tokensIn(node: unknown, out: TokenDefinition[] = []): TokenDefinition[] {
  if (Array.isArray(node)) {
    for (const item of node) tokensIn(item, out);
  } else if (typeof node === 'object' && node !== null) {
    const record = node as Record<string, unknown>;
    if (record.kind === 'createToken') {
      const spec = record.token as { kind?: string; preset?: string; definition?: unknown } | null;
      if (spec?.kind === 'preset' && spec.preset !== undefined) {
        const preset = TOKEN_PRESETS[spec.preset as keyof typeof TOKEN_PRESETS];
        if (preset !== undefined) out.push(preset);
      }
    }
    if (record.kind === 'custom' && typeof record.definition === 'object') {
      out.push(record.definition as TokenDefinition);
    }
    for (const value of Object.values(record)) tokensIn(value, out);
  }
  return out;
}

/** The distinct tokens of a deck with the cards that make them, sorted by name. Tokens that are copies of a card have no token card and are left out. */
export function deckTokens(entries: readonly ImportedEntry[]): readonly DeckToken[] {
  const found = new Map<string, { definition: TokenDefinition; cards: string[] }>();
  for (const { card } of entries) {
    for (const definition of tokensIn(card.definition.faces)) {
      const key = tokenChoiceKey(definition);
      if (key === null || tokenSearchQuery(definition) === null) continue;
      const known = found.get(key) ?? { definition, cards: [] };
      if (!known.cards.includes(card.stored.name)) known.cards.push(card.stored.name);
      found.set(key, known);
    }
  }
  return [...found.entries()]
    .map(([key, { definition, cards }]) => ({ key, definition, cards }))
    .sort((a, b) => {
      const an = a.definition.name.toLowerCase();
      const bn = b.definition.name.toLowerCase();
      return an < bn ? -1 : an > bn ? 1 : a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    });
}
