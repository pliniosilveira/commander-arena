/**
 * The printings of one token, for the token picker of the deck screen: every paper token card that matches the token's search
 * (`tokenSearchQuery`), newest first, narrowed to the ones whose rules text says what the token says. Nothing is stored here.
 */
import { createRequestQueue, tokenSearchQuery } from '@commander-arena/cards';
import type { TokenDefinition } from '@commander-arena/engine';
import { useEffect, useState } from 'react';
import { plainText } from '../board/token-art';
import { type CardPrint, type PrintsState, parseCardPrints } from './card-prints';

export function tokenPrintsUrl(token: TokenDefinition): string | null {
  const query = tokenSearchQuery(token, 'prints');
  return query === null
    ? null
    : `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&order=released&dir=desc`;
}

/** The printings of a search answer: when some cards say the token's rules text, only those (two tokens of one name can differ). */
export function parseTokenPrints(answer: unknown, oracleText: string): readonly CardPrint[] {
  const data = (answer as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  const wanted = plainText(oracleText);
  const same = data.filter(
    (card) =>
      typeof card === 'object' &&
      card !== null &&
      plainText((card as { oracle_text?: unknown }).oracle_text) === wanted,
  );
  return parseCardPrints({ data: same.length > 0 ? same : data });
}

const queue = createRequestQueue({
  fetch: (url, init) => fetch(url, init),
  now: () => performance.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  maxErrorRetries: 0,
});
const cache = new Map<string, Promise<readonly CardPrint[]>>();

function loadTokenPrints(token: TokenDefinition): Promise<readonly CardPrint[]> {
  const url = tokenPrintsUrl(token);
  if (url === null) return Promise.resolve([]);
  const key = `${url}\n${token.oracleText}`;
  let result = cache.get(key);
  if (result === undefined) {
    result = queue
      .request({ url })
      .then((r) =>
        r.kind === 'response' && r.ok ? parseTokenPrints(r.json, token.oracleText) : [],
      )
      .catch(() => []);
    cache.set(key, result);
  }
  return result;
}

/** The printings of a token, `loading` while asked for; an unreachable Scryfall is `ready` with none. */
export function useTokenPrints(token: TokenDefinition, key: string): PrintsState {
  const [found, setFound] = useState<{ key: string; prints: readonly CardPrint[] } | null>(null);
  useEffect(() => {
    let alive = true;
    void loadTokenPrints(token).then((prints) => {
      if (alive) setFound({ key, prints });
    });
    return () => {
      alive = false;
    };
  }, [token, key]);
  return found?.key === key ? { status: 'ready', prints: found.prints } : { status: 'loading' };
}
