/**
 * A `ScryfallClient` that asks one source first and another for what the first does not hold
 * (D-215). An edited precon is read this way: the cards the precon shipped with answer from its
 * snapshot, so a list that adds nothing new still works offline, and only a card the player added
 * is looked up on Scryfall, like in any imported deck.
 */
import {
  meldResultNames,
  normalizeNameKey,
  type RelatedCard,
  type ResolveResult,
  type ScryfallClient,
} from '@commander-arena/cards';

export function layeredClient(first: ScryfallClient, then: ScryfallClient): ScryfallClient {
  return {
    async resolveNames(names): Promise<ResolveResult> {
      const primary = await first.resolveNames(names);
      const rest =
        primary.notFound.length === 0 && primary.fuzzy.length === 0
          ? undefined
          : await then.resolveNames([...primary.notFound]);
      const found = new Map(primary.found);
      for (const [key, card] of rest?.found ?? []) found.set(key, card);
      // D-280: the melded face of every meld card, from the first source when it holds it, else asked of the second like any card that is missing.
      const related = new Map<string, RelatedCard>();
      for (const source of [rest, primary]) {
        for (const [key, entry] of source?.related ?? []) {
          if (entry.kind === 'card' || !related.has(key)) related.set(key, entry);
        }
      }
      const lacking = meldResultNames(found.values()).filter(
        (name) => related.get(normalizeNameKey(name))?.kind !== 'card',
      );
      if (lacking.length > 0) {
        const second = await then.resolveNames(lacking);
        for (const name of lacking) {
          const key = normalizeNameKey(name);
          const card = second.found.get(key);
          if (card !== undefined) related.set(key, { kind: 'card', card });
          else if (!related.has(key) || related.get(key)?.kind !== 'card') {
            related.set(key, {
              kind: 'missing',
              message:
                second.failures.find((f) => normalizeNameKey(f.requested) === key)?.message ??
                'no card of that name was found',
            });
          }
        }
      }
      if (rest === undefined && lacking.length === 0) {
        return related.size === 0 ? primary : { ...primary, related };
      }
      return {
        found,
        notFound: rest?.notFound ?? [],
        fuzzy: [...primary.fuzzy, ...(rest?.fuzzy ?? [])],
        failures: [...primary.failures, ...(rest?.failures ?? [])],
        ...(related.size === 0 ? {} : { related }),
      };
    },
  };
}
