/**
 * The decks a player can pick from, in one list (D-215): the precons that ship with the app, with
 * the ones the player edited marked, and the decks the player saved. Pure: the menu, the import
 * screen's "Play this deck" and the decks page build their lists from it.
 *
 * A saved deck is picked by the id `saved:<deck id>`; a precon by its own id. `Precons.prepare`
 * understands both.
 */
import { canonicalDeck, parseDecklist } from '@commander-arena/cards';
import type { SavedDeck } from '../import/types';
import type { PreconInfo } from './snapshots';

const SAVED_PREFIX = 'saved:';

export const savedDeckChoiceId = (deckId: string): string => `${SAVED_PREFIX}${deckId}`;

/** The saved deck's own id when a pick names one; null for a precon id. */
export function savedDeckIdOf(choiceId: string): string | null {
  return choiceId.startsWith(SAVED_PREFIX) ? choiceId.slice(SAVED_PREFIX.length) : null;
}

export interface DeckChoice {
  /** A precon id, or `saved:<deck id>`. */
  readonly id: string;
  readonly name: string;
  readonly blurb: string;
  /** The commander as the list writes it; empty when the list marks none. */
  readonly commander: string;
  readonly kind: 'precon' | 'saved';
  /** A precon the player edited: the list in use is theirs, not the one that shipped. */
  readonly edited: boolean;
}

/** The first name of the Commander section of a decklist, as written; empty when there is none. */
export function commanderNameOf(text: string): string {
  return canonicalDeck(parseDecklist(text)).commander[0]?.name ?? '';
}

/** The blurb without its trailing "Commander: X." sentence; the card lists the commander itself. */
export const blurbOf = (blurb: string): string => blurb.replace(/\s*Commander: [^.]*\.$/, '');

export function deckChoices(
  precons: readonly PreconInfo[],
  overrides: readonly SavedDeck[],
  saved: readonly SavedDeck[],
): readonly DeckChoice[] {
  const override = new Map<string, SavedDeck>();
  for (const deck of overrides) if (deck.preconId !== undefined) override.set(deck.preconId, deck);
  const fromPrecons = precons.map((precon): DeckChoice => {
    const mine = override.get(precon.id);
    const commander = mine === undefined ? '' : commanderNameOf(mine.text);
    return {
      id: precon.id,
      name: precon.name,
      blurb: blurbOf(precon.blurb),
      commander: commander === '' ? precon.commander : commander,
      kind: 'precon',
      edited: mine !== undefined,
    };
  });
  const fromSaved = saved.map(
    (deck): DeckChoice => ({
      id: savedDeckChoiceId(deck.id),
      name: deck.name,
      blurb: 'Saved in this browser.',
      commander: commanderNameOf(deck.text),
      kind: 'saved',
      edited: false,
    }),
  );
  return [...fromPrecons, ...fromSaved];
}
