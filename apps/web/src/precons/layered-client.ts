/**
 * A `ScryfallClient` that asks one source first and another for what the first does not hold
 * (D-215). An edited precon is read this way: the cards the precon shipped with answer from its
 * snapshot, so a list that adds nothing new still works offline, and only a card the player added
 * is looked up on Scryfall, like in any imported deck.
 */
import type { ResolveResult, ScryfallClient } from '@commander-arena/cards';

export function layeredClient(first: ScryfallClient, then: ScryfallClient): ScryfallClient {
  return {
    async resolveNames(names): Promise<ResolveResult> {
      const primary = await first.resolveNames(names);
      if (primary.notFound.length === 0 && primary.fuzzy.length === 0) return primary;
      const rest = await then.resolveNames([...primary.notFound]);
      const found = new Map(primary.found);
      for (const [key, card] of rest.found) found.set(key, card);
      return {
        found,
        notFound: rest.notFound,
        fuzzy: [...primary.fuzzy, ...rest.fuzzy],
        failures: [...primary.failures, ...rest.failures],
      };
    },
  };
}
