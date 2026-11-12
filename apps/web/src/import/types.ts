/**
 * The contract between the import service (`src/import/`, no React) and the import screens
 * (`src/ui/import/`). Plain data only. M4: SPEC 6, 7.1.
 */
import type {
  DeckValidation,
  ImportedCard,
  ParsedDecklist,
  StoredCard,
  SupportReport,
} from '@commander-arena/cards';

export type ImportPhase = 'parsing' | 'resolving' | 'converting' | 'validating' | 'done';

export interface ImportProgress {
  readonly phase: ImportPhase;
  readonly done: number;
  readonly total: number;
}

/** A resolved card with how many copies the list has. */
export interface ImportedEntry {
  readonly card: ImportedCard;
  readonly count: number;
  readonly section: 'commander' | 'main';
}

/** A name Scryfall did not match exactly; the player must confirm the closest card. */
export interface FuzzyPending {
  readonly requested: string;
  readonly candidate: StoredCard;
  readonly count: number;
}

export interface NameProblem {
  readonly name: string;
  readonly count: number;
  readonly line: number;
  /** `not-found`, or the failure message when Scryfall could not be reached for this name. */
  readonly reason: string;
}

/** Support numbers for the coverage report (SPEC 7.3 style, per deck). */
export interface Coverage {
  readonly distinctCards: number;
  readonly supportedDistinct: number;
  /** Counting every copy, basic lands included. */
  readonly copies: number;
  readonly supportedCopies: number;
  /** supportedCopies / copies in percent, rounded to one decimal; 0 for an empty deck. */
  readonly percentCopies: number;
  /** The same over distinct nonbasic-land cards, which is the number that says something. */
  readonly percentNonbasic: number;
  readonly unsupported: readonly ImportedEntry[];
}

export interface ImportReport {
  readonly deckName: string;
  readonly parse: ParsedDecklist;
  /** Resolved cards of the commander and main sections (sideboard and maybeboard are not played). */
  readonly entries: readonly ImportedEntry[];
  readonly notFound: readonly NameProblem[];
  readonly fuzzy: readonly FuzzyPending[];
  /** Names of sideboard, maybeboard and companion lines, shown for information. */
  readonly ignored: readonly {
    readonly name: string;
    readonly section: string;
    readonly count: number;
  }[];
  /** Eligible commanders among the list, when the list did not mark one. Empty otherwise. */
  readonly commanderChoices: readonly StoredCard[];
  /** The commanders in use: marked in the list, or chosen by the player. May be empty. */
  readonly commanders: readonly ImportedCard[];
  /** Null until there is at least one commander. */
  readonly validation: DeckValidation | null;
  readonly coverage: Coverage;
  /** True when every name resolved, a commander is set and validation has no errors. */
  readonly playable: boolean;
  /**
   * D-280: the melded faces of the meld cards of the list that the import fetched with it (cards of their own, not in the list): a deck-support issue carries the one of
   * every unsupported meld card, so the work does not need the owner to extract it. Absent when no meld card was looked up.
   */
  readonly meldFaces?: readonly StoredCard[];
}

export interface ImportInput {
  readonly text: string;
  readonly deckName: string;
  /** Commander chosen by the player when the list does not mark one (exact card names). */
  readonly commanderNames?: readonly string[];
  /** Requested names whose fuzzy candidate the player accepted. */
  readonly acceptedFuzzy?: readonly string[];
  readonly onProgress?: (progress: ImportProgress) => void;
}

export interface SavedDeck {
  readonly id: string;
  readonly name: string;
  /** The pasted decklist text, so a saved deck is re-imported (and re-resolved) on demand. */
  readonly text: string;
  readonly savedAt: string;
  /**
   * Set on the record of a precon the player edited (D-215): the id of that precon. Such a record
   * is a local override of the built-in deck; it is never listed with the saved decks.
   */
  readonly preconId?: string;
}

export interface DeckStoreApi {
  /** The decks the player saved, newest first. Edited precons are not among them. */
  list(): Promise<readonly SavedDeck[]>;
  save(deck: { readonly name: string; readonly text: string }): Promise<SavedDeck>;
  remove(id: string): Promise<void>;
  /** The player's edited versions of precons (D-215), one per precon, each with its `preconId`. */
  overrides(): Promise<readonly SavedDeck[]>;
  /** Stores the player's edited list of a precon, replacing an earlier one. The built-in list is never touched. */
  saveOverride(preconId: string, name: string, text: string): Promise<SavedDeck>;
  /** Forgets the edited list of a precon: the built-in deck is the one in use again ("Reset to default"). */
  removeOverride(preconId: string): Promise<void>;
}

export interface ImportService {
  run(input: ImportInput): Promise<ImportReport>;
}

/** Everything the import screens need, created once in `main.tsx` and provided by context. */
export interface ImportEnvironment {
  readonly service: ImportService;
  readonly decks: DeckStoreApi;
}

export type { SupportReport };
