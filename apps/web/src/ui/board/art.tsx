/**
 * Card images from Scryfall (SPEC 6.2, 11). Cards are looked up by name through Scryfall's
 * documented image redirect
 * (`/cards/named?exact=<name>&format=image&version=<v>`). The browser caches the redirect target,
 * and a failed load (offline, blocked, unknown name, SYNTHETIC card) leaves the drawn frame as is.
 * Tokens use a cached exact search of their original definition instead (`token-art.ts`).
 */
import type { ObjectView, TokenDefinition } from '@commander-arena/engine';
import { type CSSProperties, useState } from 'react';
import { isSyntheticFace } from '../../game/synthetic-names';
import { useCommanderArt, useListedArt } from './commander-art';
import type { ArtVersion } from './image-uris';
import { useTokenArt } from './token-art';

export type { ArtVersion } from './image-uris';

const failed = new Set<string>();

/** The image URL for a card name, or null for cards that have no Scryfall image. */
export function imageUrl(
  name: string,
  isToken: boolean,
  version: ArtVersion,
  back = false,
): string | null {
  // Token names are ambiguous; only token-art's characteristic search may look them up. A face
  // of a multi-face SYNTHETIC card has no prefix, so the invented faces are listed too.
  if (isToken || name === '' || name.startsWith('SYNTHETIC') || isSyntheticFace(name)) return null;
  // Scryfall matches a double-faced card by its front face name only (D-048).
  const front = name.split(' // ')[0] ?? name;
  const face = back ? '&face=back' : '';
  return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(front)}&format=image&version=${version}${face}`;
}

/**
 * What to ask Scryfall for to draw an object: the card's front face name, and `back` when the
 * face up is the back of a transforming or modal double-faced card (it has its own art; the
 * request is `face=back`). A multi-face card asks by its first face's name whichever face is up,
 * because `ObjectView.name` is the face (or "A // B") and Scryfall finds a card by its front name
 * (D-048). Other cards ask by `name`.
 */
export function artOf(object: ObjectView): { readonly name: string; readonly back: boolean } {
  // D-277 (CR 701.42a, 712.4a): a melded permanent is drawn as the combined face, which is a card of its own that Scryfall finds by name: never one of the two front halves.
  if (object.meld !== undefined) return { name: object.name, back: false };
  const front = object.faces?.[0]?.name;
  if (front === undefined) return { name: object.name, back: false };
  const doubleFaced = object.layout === 'transform' || object.layout === 'modal_dfc';
  return { name: front, back: doubleFaced && object.face === 1 };
}

interface ArtProps {
  readonly name: string;
  readonly isToken: boolean;
  readonly version: ArtVersion;
  /** The back face of a double-faced card (`artOf`). */
  readonly back?: boolean;
  readonly className: string;
  readonly style?: CSSProperties;
  readonly tokenDefinition?: TokenDefinition;
  /** A commander is drawn with a special printing when Scryfall has one (issue 366). */
  readonly commander?: boolean;
  /** Load at once instead of when scrolled near (a battlefield tile: Safari never loads those it deems offscreen, issue 474). */
  readonly eager?: boolean;
}

/** An image that stays invisible until it has loaded and removes itself if it cannot. */
export function Art({
  name,
  isToken,
  version,
  back = false,
  className,
  style,
  tokenDefinition,
  commander = false,
  eager = false,
}: ArtProps) {
  const tokenUrl = useTokenArt(tokenDefinition, version);
  const special = useCommanderArt(commander && !isToken ? name : null, version);
  // The printing the deck's list names (a precon from Archidekt): the front face only, as the lookup answers it.
  const listed = useListedArt(
    !commander && !isToken && tokenDefinition === undefined && !back ? name : null,
    version,
  );
  if (listed.pending) return null;
  // Issue 32: a token that is a copy of a card has the card's mana cost (no real token has one) and no token card of its
  // own on Scryfall, so it is drawn with the art of the card it copies.
  const copiesACard = tokenDefinition !== undefined && tokenDefinition.manaCost !== null;
  const url =
    special !== null && !back
      ? special
      : copiesACard
        ? imageUrl(name, false, version, back)
        : tokenDefinition === undefined
          ? (listed.url ?? imageUrl(name, isToken, version, back))
          : tokenUrl;
  if (url === null) return null;
  return <LoadedArt key={url} url={url} className={className} style={style} eager={eager} />;
}

function LoadedArt({
  url,
  className,
  style,
  eager,
}: {
  readonly eager: boolean;
  readonly url: string;
  readonly className: string;
  readonly style?: CSSProperties | undefined;
}) {
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>(
    failed.has(url) ? 'failed' : 'loading',
  );
  if (state === 'failed') return null;
  return (
    <img
      className={`${className}${state === 'loaded' ? ' is-loaded' : ''}`}
      style={style}
      src={url}
      alt=""
      aria-hidden="true"
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      draggable={false}
      onLoad={() => setState('loaded')}
      onError={() => {
        failed.add(url);
        setState('failed');
      }}
    />
  );
}
