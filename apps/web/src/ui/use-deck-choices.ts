/**
 * The decks of this browser as pickable choices (D-215): the shipped precons at once, then the
 * edited precons and saved decks once the deck store has answered. Without an import provider
 * (the unit tests of the menu) only the precons are listed.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SavedDeck } from '../import/types';
import { type DeckChoice, deckChoices } from '../precons';
import { useOptionalImportEnv } from './import/import-context';
import { usePrecons } from './precons-context';

export interface DeckChoices {
  readonly choices: readonly DeckChoice[];
  /** Reads the deck store again (after a save, a delete or a reset). */
  refresh(): void;
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

  const choices = useMemo(
    () => deckChoices(precons.list, stored.overrides, stored.saved),
    [precons.list, stored],
  );
  return { choices, refresh };
}
