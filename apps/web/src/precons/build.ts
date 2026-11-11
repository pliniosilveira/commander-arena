/**
 * From a precon snapshot to a deck the engine can play, through the pipeline of an imported deck
 * (D-137): the decklist is parsed, the names are resolved against the snapshot's own cards instead
 * of Scryfall, every card is converted with its support status (parser, fixtures), the deck is
 * validated and then checked by the one shared rule for starting a game (`checkPlayable`). A precon
 * that is not valid and fully supported is never startable: the answer is the reason, not a deck.
 */
import type { PreconSnapshot, ScryfallClient } from '@commander-arena/cards';
import type { DeckConfig } from '@commander-arena/engine';
import { checkPlayable } from '../import/deck';
import type { DeckStoreApi, ImportService, SavedDeck } from '../import/types';
import { commanderNameOf, savedDeckChoiceId, savedDeckIdOf } from './choices';
import { layeredClient } from './layered-client';
import { snapshotClient } from './snapshot-client';
import { infoOf, type PreconInfo } from './snapshots';

export type PreconDeck =
  | {
      readonly ok: true;
      readonly info: PreconInfo;
      readonly deck: DeckConfig;
    }
  | { readonly ok: false; readonly info: PreconInfo | null; readonly reason: string };

/** Makes the import service of the app, resolving names through the given client. */
export type ServiceFor = (client: ScryfallClient) => ImportService;

export async function buildPreconDeck(
  snapshot: PreconSnapshot,
  serviceFor: ServiceFor,
): Promise<PreconDeck> {
  const info = infoOf(snapshot);
  try {
    const report = await serviceFor(snapshotClient(snapshot.cards)).run({
      text: snapshot.decklist,
      deckName: snapshot.name,
    });
    const check = checkPlayable(report);
    if (!check.ok) {
      return {
        ok: false,
        info,
        reason: `"${snapshot.name}" cannot be played: ${check.reason}.`,
      };
    }
    return { ok: true, info, deck: check.deck };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, info, reason: `"${snapshot.name}" could not be prepared: ${message}` };
  }
}

export interface Precons {
  /** The precons that ship with the app, sorted by id. Empty until a snapshot exists. */
  readonly list: readonly PreconInfo[];
  /**
   * The playable deck of a deck pick, or the reason it is not. The pick is a precon id (the
   * player's edited list when there is one, else the shipped one) or `saved:<deck id>` of a saved
   * deck (D-215); an unknown id or a deck that is not valid and fully supported is refused.
   */
  prepare(id: string): Promise<PreconDeck>;
  /**
   * The import service that edits a precon: its own cards answer from the snapshot, anything else
   * from Scryfall (D-215). Without a deck library it reads the snapshot only.
   */
  editorService(id: string): ImportService;
}

/** What the page adds to the shipped precons: where the player's decks live and the Scryfall client (D-215). */
export interface DeckLibrary {
  readonly decks: DeckStoreApi;
  readonly client: ScryfallClient;
}

/** Why a saved deck or an edited precon is not startable, in the words of `buildPreconDeck`. */
async function buildFromText(
  info: PreconInfo,
  text: string,
  service: ImportService,
): Promise<PreconDeck> {
  try {
    const report = await service.run({ text, deckName: info.name });
    const check = checkPlayable(report);
    if (!check.ok) {
      return { ok: false, info, reason: `"${info.name}" cannot be played: ${check.reason}.` };
    }
    return { ok: true, info, deck: check.deck };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, info, reason: `"${info.name}" could not be prepared: ${message}` };
  }
}

export function createPrecons(
  snapshots: readonly PreconSnapshot[],
  serviceFor: ServiceFor,
  library?: DeckLibrary,
): Precons {
  const prepared = new Map<string, Promise<PreconDeck>>();
  const editor = (snapshot: PreconSnapshot): ImportService =>
    serviceFor(
      library === undefined
        ? snapshotClient(snapshot.cards)
        : layeredClient(snapshotClient(snapshot.cards), library.client),
    );

  async function prepareSaved(deckId: string): Promise<PreconDeck> {
    if (library === undefined) {
      return { ok: false, info: null, reason: 'Saved decks are not available here.' };
    }
    const deck = (await library.decks.list()).find((candidate) => candidate.id === deckId);
    if (deck === undefined) {
      return { ok: false, info: null, reason: 'That saved deck no longer exists.' };
    }
    const info: PreconInfo = {
      id: savedDeckChoiceId(deck.id),
      name: deck.name,
      blurb: 'Saved in this browser.',
      commander: commanderNameOf(deck.text),
      decklist: deck.text,
    };
    return buildFromText(info, deck.text, serviceFor(library.client));
  }

  async function prepareEdited(snapshot: PreconSnapshot, override: SavedDeck): Promise<PreconDeck> {
    const key = `${snapshot.id}\n${override.text}`;
    const known = prepared.get(key);
    if (known !== undefined) return known;
    const info: PreconInfo = {
      ...infoOf(snapshot),
      commander: commanderNameOf(override.text) || infoOf(snapshot).commander,
      decklist: override.text,
    };
    const result = buildFromText(info, override.text, editor(snapshot));
    prepared.set(key, result);
    // A refusal can be a lost connection: do not keep it, the next try asks again.
    void result.then((deck) => {
      if (!deck.ok) prepared.delete(key);
    });
    return result;
  }

  return {
    list: snapshots.map(infoOf),
    async prepare(id) {
      const deckId = savedDeckIdOf(id);
      if (deckId !== null) return prepareSaved(deckId);
      const snapshot = snapshots.find((candidate) => candidate.id === id);
      if (snapshot === undefined) {
        return { ok: false, info: null, reason: `There is no precon "${id}".` };
      }
      const override =
        library === undefined
          ? undefined
          : (await library.decks.overrides()).find((deck) => deck.preconId === id);
      if (override !== undefined) return prepareEdited(snapshot, override);
      let result = prepared.get(id);
      if (result === undefined) {
        result = buildPreconDeck(snapshot, serviceFor);
        prepared.set(id, result);
      }
      return result;
    },
    editorService(id) {
      const snapshot = snapshots.find((candidate) => candidate.id === id);
      return snapshot === undefined ? serviceFor(snapshotClient([])) : editor(snapshot);
    },
  };
}
