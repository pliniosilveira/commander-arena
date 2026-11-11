/**
 * Card images from Scryfall (SPEC 6.2, 11). Cards are looked up by name through Scryfall's
 * documented image redirect
 * (`/cards/named?exact=<name>&format=image&version=<v>`). The browser caches the redirect target,
 * and a failed load (offline, blocked, unknown name, SYNTHETIC card) leaves the drawn frame as is.
 */
import type { ObjectView } from '@commander-arena/engine';
import { type CSSProperties, useState } from 'react';
import { isSyntheticFace } from '../../game/synthetic-names';

export type ArtVersion = 'art_crop' | 'normal' | 'small';

const failed = new Set<string>();

/** The image URL for a card name, or null for cards that have no Scryfall image. */
export function imageUrl(
  name: string,
  isToken: boolean,
  version: ArtVersion,
  back = false,
): string | null {
  // SYNTHETIC test cards and tokens are not real cards; there is nothing to look up. A face of a
  // multi-face SYNTHETIC card is named without the prefix, so the invented faces are listed too.
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
}

/** An image that stays invisible until it has loaded and removes itself if it cannot. */
export function Art({ name, isToken, version, back = false, className, style }: ArtProps) {
  const url = imageUrl(name, isToken, version, back);
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>(
    url !== null && failed.has(url) ? 'failed' : 'loading',
  );
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
      onLoad={() => setState('loaded')}
      onError={() => {
        failed.add(url);
        setState('failed');
      }}
    />
  );
}
