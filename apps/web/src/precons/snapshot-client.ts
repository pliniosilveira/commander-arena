/**
 * A `ScryfallClient` that answers from the stored cards of a precon snapshot instead of from
 * Scryfall (SPEC 6.2, 15 M9). The import service takes it where it takes the real client, so a
 * precon goes through exactly the pipeline of an imported deck, with no network.
 *
 * Names match as `resolveNames` of the cards package matches the cards Scryfall returns: a full
 * name first, then a face name; the front face of the requested name is tried last. Nothing is
 * ever fuzzy: a name the snapshot does not hold is not found.
 */
import {
  fromSnapshotCard,
  frontFaceName,
  meldResultNames,
  normalizeNameKey,
  type RelatedCard,
  type ResolveResult,
  type ScryfallClient,
  type SnapshotCard,
  type StoredCard,
} from '@commander-arena/cards';

/** The card for a normalized name key: by full name first, then by the name of a face. */
export function indexByName(cards: readonly StoredCard[]): (key: string) => StoredCard | undefined {
  const full = new Map<string, StoredCard>();
  const faces = new Map<string, StoredCard>();
  for (const card of cards) {
    const fullKey = normalizeNameKey(card.name);
    if (!full.has(fullKey)) full.set(fullKey, card);
    for (const face of card.faces) {
      const faceKey = normalizeNameKey(face.name);
      if (!faces.has(faceKey)) faces.set(faceKey, card);
    }
  }
  return (key) => full.get(key) ?? faces.get(key);
}

export function snapshotClient(cards: readonly SnapshotCard[]): ScryfallClient {
  const lookup = indexByName(cards.map(fromSnapshotCard));
  return {
    async resolveNames(names): Promise<ResolveResult> {
      const found = new Map<string, StoredCard>();
      const notFound: string[] = [];
      for (const requested of names) {
        const key = normalizeNameKey(requested);
        if (key === '' || found.has(key)) continue;
        const card = lookup(key) ?? lookup(normalizeNameKey(frontFaceName(requested)));
        if (card) found.set(key, card);
        else notFound.push(requested);
      }
      // D-994: the melded face of a meld card the snapshot holds (`pnpm precon:snapshot` stores it with the pair): from the snapshot only, never the network.
      const related = new Map<string, RelatedCard>();
      for (const name of meldResultNames(found.values())) {
        const card = lookup(normalizeNameKey(name));
        related.set(
          normalizeNameKey(name),
          card === undefined
            ? { kind: 'missing', message: 'the precon snapshot does not hold it' }
            : { kind: 'card', card },
        );
      }
      return {
        found,
        notFound,
        fuzzy: [],
        failures: [],
        ...(related.size === 0 ? {} : { related }),
      };
    },
  };
}
