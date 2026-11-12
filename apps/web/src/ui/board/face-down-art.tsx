/**
 * The picture of a face-down permanent (D-968, CR 701.40a, 708.2): the image of Scryfall's "Manifest" token, the 2/2 creature card Wizards printed to stand for a face-down
 * manifested card. It is the same for every face-down permanent, whatever the card behind it, so it tells nobody anything. The page fetches it from Scryfall at run time like
 * every card image (`art.tsx`); nothing of the image is kept in the repository, and the address of the image file (which carries a timestamp that changes) is never written down:
 * the lookup is the card's page by set code and collector number, whose answer lists the image files (`image_uris`).
 *
 * THE LOOKUP: `GET https://api.scryfall.com/cards/tfrf/4`, set code `tfrf` (Fate Reforged Tokens) and collector number `4`. VERIFIED on 2026-11-12, from a GitHub runner (the cloud
 * session that built this cannot reach Scryfall): HTTP 200, id e9f896d4-34b4-407d-be7e-bf7a69aaf811, oracle id f4f184ef-f456-47d8-9012-095629a5ea4d, name "Manifest", layout
 * "token", type line "Creature", 2/2. If Scryfall ever moves the card, these two constants are the only thing to change.
 *
 * When the image cannot be had (offline, blocked, an unknown answer) nothing is drawn here and the board keeps the drawn face-down card (a card back with "2/2 creature"), so the
 * game works offline. A failed lookup is remembered for the session, so a missing connection is asked about once.
 */
import { type CSSProperties, useEffect, useState } from 'react';
import type { ArtVersion } from './art';

/** The set code of Fate Reforged Tokens on Scryfall. */
export const MANIFEST_TOKEN_SET = 'tfrf';
/** The collector number of the Manifest token in that set, as printed on the card. */
export const MANIFEST_TOKEN_NUMBER = '4';
/** The documented lookup of one card by set code and collector number. */
export const MANIFEST_TOKEN_LOOKUP = `https://api.scryfall.com/cards/${MANIFEST_TOKEN_SET}/${MANIFEST_TOKEN_NUMBER}`;

/** The image files of the token, by the versions the page asks for. */
export type ManifestArt = Readonly<Partial<Record<ArtVersion, string>>>;

const VERSIONS: readonly ArtVersion[] = ['art_crop', 'normal', 'small'];

/** The `image_uris` of a Scryfall card answer, or null when it has none the page uses. Pure, so the shape is tested without a network. */
export function parseManifestArt(answer: unknown): ManifestArt | null {
  if (typeof answer !== 'object' || answer === null) return null;
  const uris = (answer as { image_uris?: unknown }).image_uris;
  if (typeof uris !== 'object' || uris === null) return null;
  const art: Partial<Record<ArtVersion, string>> = {};
  for (const version of VERSIONS) {
    const url = (uris as Record<string, unknown>)[version];
    // Only an https address on Scryfall's own image host is used as a picture.
    if (typeof url === 'string' && /^https:\/\/cards\.scryfall\.io\//.test(url)) art[version] = url;
  }
  return Object.keys(art).length === 0 ? null : art;
}

let lookup: Promise<ManifestArt | null> | null = null;

/** Asks Scryfall once per session for the token's image files; null when it can't be had. */
export function manifestTokenArt(fetcher: typeof fetch = fetch): Promise<ManifestArt | null> {
  lookup ??= (async () => {
    try {
      const response = await fetcher(MANIFEST_TOKEN_LOOKUP, {
        headers: { Accept: 'application/json' },
      });
      return response.ok ? parseManifestArt(await response.json()) : null;
    } catch {
      return null;
    }
  })();
  return lookup;
}

/** Forgets the lookup (tests). */
export function resetManifestTokenArt(): void {
  lookup = null;
}

/** The image address for a version, or null while it loads and when it can't be had. */
export function useManifestArt(version: ArtVersion): string | null {
  const [art, setArt] = useState<ManifestArt | null>(null);
  useEffect(() => {
    let alive = true;
    void manifestTokenArt().then((found) => {
      if (alive) setArt(found);
    });
    return () => {
      alive = false;
    };
  }, []);
  return art?.[version] ?? null;
}

interface FaceDownArtProps {
  readonly version: ArtVersion;
  readonly className: string;
  readonly style?: CSSProperties;
}

/** The token's picture, invisible until it has loaded and gone if it can't; nothing at all (the drawn card stays) when the lookup found no image. */
export function FaceDownArt({ version, className, style }: FaceDownArtProps) {
  const url = useManifestArt(version);
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>('loading');
  if (url === null || state === 'failed') return null;
  return (
    <img
      className={`${className}${state === 'loaded' ? ' is-loaded' : ''}`}
      style={style}
      src={url}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      draggable={false}
      data-manifest-art={version}
      onLoad={() => setState('loaded')}
      onError={() => setState('failed')}
    />
  );
}
