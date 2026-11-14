export type ArtVersion = 'art_crop' | 'normal' | 'small';
export type CardArt = Readonly<Partial<Record<ArtVersion, string>>>;

/** Accept only HTTPS image files hosted by Scryfall. */
export function parseCardArt(answer: unknown): CardArt | null {
  if (typeof answer !== 'object' || answer === null) return null;
  const uris = (answer as { image_uris?: unknown }).image_uris;
  if (typeof uris !== 'object' || uris === null) return null;
  const art: Partial<Record<ArtVersion, string>> = {};
  for (const version of ['art_crop', 'normal', 'small'] as const) {
    const url = (uris as Record<string, unknown>)[version];
    if (typeof url === 'string' && /^https:\/\/cards\.scryfall\.io\//.test(url)) art[version] = url;
  }
  return Object.keys(art).length === 0 ? null : art;
}
