/**
 * The pictures stored with the cards of the decks on the table. A precon's snapshot and an imported deck both keep, for every face of
 * every card, the links of its picture on Scryfall's image host (`StoredFace.imageUris`, from the card's own data). Drawing a card from
 * them asks nothing of Scryfall's API: the name lookup (`art.tsx`, `/cards/named?...&format=image`) is rate limited, and a burst of
 * them (a hand drawn again at every mulligan, a long board) left pictures blank for the rest of the game.
 *
 * Kept by seat and card name for the one game on the table, as the printings of `deck-printings.ts` are, and replaced when the next
 * game starts. A card the decks do not store (a card made by an effect, a token) is not here and is drawn by name as before.
 */
import { frontFaceName, type StoredCard } from '@commander-arena/cards';
import type { ArtVersion } from './image-uris';

/** One face: its pictures, each the link on Scryfall's image host or null. */
interface FaceLinks {
  readonly normal: string | null;
  readonly artCrop: string | null;
}

/** Seat id, then the card's front face name in lower case: one entry per face, in the card's order. */
const known = new Map<number, Map<string, readonly FaceLinks[]>>();
const keyOf = (name: string): string => frontFaceName(name).toLowerCase();

/** Only an https link on Scryfall's image host is ever drawn (as `parseCardArt` does for a lookup). */
const safe = (url: string | null | undefined): string | null =>
  typeof url === 'string' && /^https:\/\/cards\.scryfall\.io\//u.test(url) ? url : null;

function linksOf(card: StoredCard): readonly FaceLinks[] {
  return card.faces.map((face) => ({
    normal: safe(face.imageUris?.normal),
    artCrop: safe(face.imageUris?.artCrop),
  }));
}

/**
 * The pictures of the game that starts now: `decks[seat]` are the stored cards of the deck that seat plays (the human is seat 0, the
 * opponents follow). It replaces what an earlier game left.
 */
export function setGameImages(decks: readonly (readonly StoredCard[])[]): void {
  known.clear();
  decks.forEach((cards, seat) => {
    const bySeat = new Map<string, readonly FaceLinks[]>();
    for (const card of cards) bySeat.set(keyOf(card.name), linksOf(card));
    known.set(seat, bySeat);
  });
}

/**
 * The stored link of the picture of the card `name` in the deck of seat `owner`: its back face when `back`, in the version asked for
 * (a small picture is the normal one). Null when the deck does not store the card, or the face has no such picture.
 */
export function storedImage(
  name: string,
  owner: number,
  back: boolean,
  version: ArtVersion,
): string | null {
  const face = known.get(owner)?.get(keyOf(name))?.[back ? 1 : 0];
  if (face === undefined) return null;
  return version === 'art_crop' ? face.artCrop : face.normal;
}
