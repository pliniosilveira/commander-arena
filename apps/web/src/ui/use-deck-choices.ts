/**
 * The decks of this browser as pickable choices (D-215): the shipped precons at once, then the
 * edited precons and saved decks once the deck store has answered. Without an import provider
 * (the unit tests of the menu) only the precons are listed.
 */
import { normalizeNameKey } from '@commander-arena/cards';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SavedDeck } from '../import/types';
import type { CommanderLook } from '../precons';
import {
  commanderNameOf,
  type DeckChoice,
  deckChoices,
  loadDisabledPrecons,
  saveDisabledPrecons,
} from '../precons';
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

  const choices = useMemo(
    () => deckChoices(precons.list, stored.overrides, stored.saved, looks, disabled),
    [precons.list, stored, looks, disabled],
  );
  return { choices, refresh, setPreconEnabled };
}
