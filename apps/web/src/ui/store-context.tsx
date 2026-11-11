import type { ObjectId } from '@commander-arena/engine';
import { createContext, type ReactNode, useContext, useSyncExternalStore } from 'react';
import { useStore } from 'zustand';
import type { LookedCard } from '../game/looked-cards';
import type { DefinedPtNote } from '../game/protocol';
import type { AppActions, AppState, AppStore } from '../store';

const StoreContext = createContext<AppStore | null>(null);

export function StoreProvider({ store, children }: { store: AppStore; children: ReactNode }) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

function useAppStore(): AppStore {
  const store = useContext(StoreContext);
  if (store === null) throw new Error('StoreProvider is missing');
  return store;
}

/** Select a slice of the page state. Keep selectors cheap and return stable references. */
export function useApp<T>(selector: (state: AppState & AppActions) => T): T {
  return useStore(useAppStore(), selector);
}

/** The store itself, for an event handler that must read the latest state after an action. */
export function useStoreApi(): AppStore {
  return useAppStore();
}

/** The store's actions (stable references), for event handlers. */
export function useActions(): AppActions {
  return useAppStore().getState();
}

/**
 * The note of a card whose face prints `*` for power or toughness (D-109), from the latest snapshot:
 * which of the two is `*` and what defines it. Undefined for any other card, and outside a
 * `StoreProvider`, so a card face can be drawn anywhere.
 */
export function useDefinedPt(id: ObjectId): DefinedPtNote | undefined {
  const store = useContext(StoreContext);
  const read = (state: AppState | undefined): DefinedPtNote | undefined =>
    state?.snapshot?.definedPt?.[id];
  return useSyncExternalStore(
    (notify) => store?.subscribe(notify) ?? (() => undefined),
    () => read(store?.getState()),
    () => read(store?.getInitialState()),
  );
}

/**
 * The words of the play-rule static abilities of a visible permanent (D-125), from the latest snapshot:
 * "You may play an additional land on each of your turns." and the like. Undefined for a permanent with
 * none, and outside a `StoreProvider`.
 */
export function useStaticNotes(id: ObjectId): readonly string[] | undefined {
  const store = useContext(StoreContext);
  const read = (state: AppState | undefined): readonly string[] | undefined =>
    state?.snapshot?.staticNotes?.[id];
  return useSyncExternalStore(
    (notify) => store?.subscribe(notify) ?? (() => undefined),
    () => read(store?.getState()),
    () => read(store?.getInitialState()),
  );
}

/**
 * The cards the human looked at for their own "look at the top N cards" question that cannot be taken (D-139), from the
 * latest snapshot; empty outside that question and outside a `StoreProvider`.
 */
export function useLookedCards(): readonly LookedCard[] {
  const store = useContext(StoreContext);
  const read = (state: AppState | undefined): readonly LookedCard[] =>
    state?.snapshot?.lookedCards ?? NO_LOOKED;
  return useSyncExternalStore(
    (notify) => store?.subscribe(notify) ?? (() => undefined),
    () => read(store?.getState()),
    () => read(store?.getInitialState()),
  );
}

const NO_LOOKED: readonly LookedCard[] = [];
