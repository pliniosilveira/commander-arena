/**
 * The decks of this browser as pickable choices (D-215): the shipped precons at once, then the
 * edited precons and saved decks once the deck store has answered. Without an import provider
 * (the unit tests of the menu) only the precons are listed.
 */
import { frontFaceName, normalizeNameKey } from '@commander-arena/cards';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SavedDeck } from '../import/types';
import type { CommanderLook } from '../precons';
import {
  commanderNameOf,
  type DeckChoice,
  deckChoices,
  loadDisabledPrecons,
  saveDisabledPrecons,
  savedDeckChoiceId,
} from '../precons';
import { commanderPrintingOf } from './board/deck-printings';
import { type ListedKey, listedKey, useListedImages } from './import/card-prints';
import { useOptionalImportEnv } from './import/import-context';
import { usePrecons } from './precons-context';

export interface DeckChoices {
  readonly choices: readonly DeckChoice[];
  /** Reads the deck store again (after a save, a delete or a reset). */
  refresh(): void;
  /** Switches a built-in precon on or off for the pickers and the Random buttons. */
  setPreconEnabled(id: string, enabled: boolean): void;
}

export function useDeckChoices(): DeckChoices {
  const env = useOptionalImportEnv();
  const precons = usePrecons();
  const [stored, setStored] = useState<{
    readonly overrides: readonly SavedDeck[];
    readonly saved: readonly SavedDeck[];
  }>({ overrides: [], saved: [] });
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((n) => n + 1), []);

  // `tick` re-reads the store on `refresh`; the lint rule cannot see that it is a trigger.
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick is the refresh trigger
  useEffect(() => {
    if (env === null) return;
    let live = true;
    void Promise.all([env.decks.overrides(), env.decks.list()]).then(
      ([overrides, saved]) => {
        if (live) setStored({ overrides, saved });
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [env, tick]);

  // The art and colors of the commanders of saved decks, which keep only text: read through the
  // card cache by name once the list is known. A name that cannot be had just shows no art.
  const [looks, setLooks] = useState<ReadonlyMap<string, CommanderLook>>(new Map());
  useEffect(() => {
    const client = env?.client;
    if (client === undefined) return;
    const names = [...new Set(stored.saved.map((d) => commanderNameOf(d.text)))].filter(
      (n) => n !== '',
    );
    if (names.length === 0) return;
    let live = true;
    void client.resolveNames(names).then(
      (result) => {
        if (!live) return;
        const next = new Map<string, CommanderLook>();
        for (const name of names) {
          const card = result.found.get(normalizeNameKey(name));
          if (card === undefined) continue;
          const image = card.faces[0]?.imageUris?.artCrop ?? undefined;
          next.set(name, { image, colors: card.colorIdentity });
        }
        setLooks(next);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [env, stored.saved]);

  const [disabled, setDisabled] = useState<ReadonlySet<string>>(() => loadDisabledPrecons());
  const setPreconEnabled = useCallback((id: string, enabled: boolean) => {
    setDisabled((current) => {
      const next = new Set(current);
      if (enabled) next.delete(id);
      else next.add(id);
      saveDisabledPrecons(next);
      return next;
    });
  }, []);

  const base = useMemo(
    () => deckChoices(precons.list, stored.overrides, stored.saved, looks, disabled),
    [precons.list, stored, looks, disabled],
  );

  // The cells of the deck lists draw the commander in the printing the deck's list names (as the deck screen and the board do),
  // not in the default picture stored with the card. Asked for from Scryfall in one request per 75 decks; the default stays until
  // it answers, and when it cannot. Not without an import provider (the unit tests of the menu): they never reach the network.
  const commanders = useMemo(() => {
    const texts = new Map<string, string>();
    for (const precon of precons.list) {
      const mine = stored.overrides.find((deck) => deck.preconId === precon.id);
      texts.set(precon.id, mine?.text ?? precon.decklist);
    }
    for (const deck of stored.saved) texts.set(savedDeckChoiceId(deck.id), deck.text);
    const found = new Map<string, { name: string; key: ListedKey }>();
    for (const [id, text] of texts) {
      const listed = commanderPrintingOf(text);
      if (listed !== null) found.set(id, { name: listed.name, key: listed.printing });
    }
    return found;
  }, [precons.list, stored]);
  const images = useListedImages(
    env === null ? [] : [...commanders.values()].map((commander) => commander.key),
  );
  const choices = useMemo(
    () =>
      base.map((choice) => {
        const commander = commanders.get(choice.id);
        const image = commander === undefined ? undefined : images.get(listedKey(commander.key));
        const art = image?.artCrop;
        // A list that names the printing of another card must not draw that card.
        if (
          commander === undefined ||
          art === null ||
          art === undefined ||
          frontFaceName(image?.name ?? '').toLowerCase() !==
            frontFaceName(commander.name).toLowerCase()
        ) {
          return choice;
        }
        return { ...choice, commanderImage: art };
      }),
    [base, commanders, images],
  );
  return { choices, refresh, setPreconEnabled };
}
