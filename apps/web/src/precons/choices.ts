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
  /** Art of the commander card, when known. */
  readonly commanderImage?: string;
  /** The deck's colors: the commander's color identity; absent when unknown. */
  readonly colors?: readonly string[];
  /** The precon's set and release year, when recorded. */
  readonly set?: string;
  readonly year?: number;
  readonly kind: 'precon' | 'saved';
  /** A precon the player edited: the list in use is theirs, not the one that shipped. */
  readonly edited: boolean;
  /** False for a precon the player switched off: not offered in the pickers, never random. */
  readonly enabled?: boolean;
}

/** The first name of the Commander section of a decklist, as written; empty when there is none. */
export function commanderNameOf(text: string): string {
  return canonicalDeck(parseDecklist(text)).commander[0]?.name ?? '';
}

/** The blurb without its trailing "Commander: X." sentence; the card lists the commander itself. */
export const blurbOf = (blurb: string): string => blurb.replace(/\s*Commander: [^.]*\.$/, '');

/** Art and colors of a commander card, looked up by name for the decks that keep only text. */
export interface CommanderLook {
  readonly image?: string | undefined;
  readonly colors: readonly string[];
}

export function deckChoices(
  precons: readonly PreconInfo[],
  overrides: readonly SavedDeck[],
  saved: readonly SavedDeck[],
  looks: ReadonlyMap<string, CommanderLook> = new Map(),
  disabled: ReadonlySet<string> = new Set(),
): readonly DeckChoice[] {
  const override = new Map<string, SavedDeck>();
  for (const deck of overrides) if (deck.preconId !== undefined) override.set(deck.preconId, deck);
  const fromPrecons = precons.map((precon): DeckChoice => {
    const mine = override.get(precon.id);
    const commander = mine === undefined ? '' : commanderNameOf(mine.text);
    // The shipped art only fits the shipped commander.
    const same = commander === '' || commander === precon.commander;
    const image = same ? precon.commanderImage : undefined;
    const colors = same ? precon.colors : undefined;
    return {
      id: precon.id,
      name: precon.name,
      blurb: blurbOf(precon.blurb),
      commander: commander === '' ? precon.commander : commander,
      ...(image === undefined ? {} : { commanderImage: image }),
      ...(colors === undefined ? {} : { colors }),
      ...(precon.set === undefined ? {} : { set: precon.set }),
      ...(precon.year === undefined ? {} : { year: precon.year }),
      kind: 'precon',
      edited: mine !== undefined,
      enabled: !disabled.has(precon.id),
    };
  });
  const fromSaved = saved.map((deck): DeckChoice => {
    const commander = commanderNameOf(deck.text);
    const look = looks.get(commander);
    return {
      id: savedDeckChoiceId(deck.id),
      name: deck.name,
      blurb: 'Saved in this browser.',
      commander,
      ...(look?.image === undefined ? {} : { commanderImage: look.image }),
      ...(look === undefined ? {} : { colors: look.colors }),
      kind: 'saved',
      edited: false,
    };
  });
  return [...fromPrecons, ...fromSaved];
}
