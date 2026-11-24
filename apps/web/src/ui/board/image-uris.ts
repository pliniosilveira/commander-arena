export type ArtVersion = 'art_crop' | 'normal' | 'small';
export type CardArt = Readonly<Partial<Record<ArtVersion, string>>>;

/** Accept only HTTPS image files hosted by Scryfall. */
export function parseCardArt(answer: unknown): CardArt | null {
  if (typeof answer !== 'object' || answer === null) return null;
  const card = answer as { image_uris?: unknown; card_faces?: unknown };
  // A double-faced card has no image of its own: its faces have, and the front one is the card's picture.
  const front = Array.isArray(card.card_faces)
    ? (card.card_faces[0] as { image_uris?: unknown } | undefined)?.image_uris
    : undefined;
  const uris = card.image_uris ?? front;
  if (typeof uris !== 'object' || uris === null) return null;
  const art: Partial<Record<ArtVersion, string>> = {};
  for (const version of ['art_crop', 'normal', 'small'] as const) {
    const url = (uris as Record<string, unknown>)[version];
    if (typeof url === 'string' && /^https:\/\/cards\.scryfall\.io\//.test(url)) art[version] = url;
  }
  return Object.keys(art).length === 0 ? null : art;
}
