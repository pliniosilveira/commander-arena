/**
 * The "Opponent is thinking" status (SPEC 10, D-174). The page cannot see the AI decide: the Worker
 * answers once, after the player's action and the AI's whole run. What it can see is its own request
 * waiting (`hostCall` in the store). That request is the player's action or an automatic pass, which
 * the engine applies in milliseconds; what makes it last is the AI answering after it, so a request
 * that has lasted `THINKING_DELAY_MS` is the opponent thinking. A quicker one shows nothing, so a
 * fast move never flickers.
 */
import { useEffect, useState } from 'react';
import type { AppStore } from '../../store';
import { useStoreApi } from '../store-context';

/** How long a request to the Worker must have lasted before the status shows. */
export const THINKING_DELAY_MS = 400;

/** The timer the watcher uses; a test passes its own, the page uses `setTimeout`. */
export interface Timers {
  readonly set: (run: () => void, ms: number) => unknown;
  readonly clear: (handle: unknown) => void;
}

const BROWSER_TIMERS: Timers = {
  set: (run, ms) => setTimeout(run, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Tells `onChange` whether the opponent is thinking: true once a request to the Worker has been in
 * flight for `delayMs`, false the moment it ends or the game is over, and again from zero for the
 * next request. Reports the starting state at once. Returns the function that stops watching.
 */
export function watchThinking(
  store: AppStore,
  delayMs: number,
  onChange: (thinking: boolean) => void,
  timers: Timers = BROWSER_TIMERS,
): () => void {
  let call: number | null = null;
  let timer: unknown = null;
  let shown = false;
  const show = (on: boolean) => {
    if (on === shown) return;
    shown = on;
    onChange(on);
  };
  const sync = () => {
    const state = store.getState();
    const live = state.snapshot !== null && state.snapshot.view.result === null;
    const next = live ? state.hostCall : null;
    if (next === call) return;
    call = next;
    if (timer !== null) timers.clear(timer);
    timer = null;
    show(false);
    if (next !== null) {
      timer = timers.set(() => {
        timer = null;
        show(true);
      }, delayMs);
    }
  };
  onChange(false);
  sync();
  const unsubscribe = store.subscribe(sync);
  return () => {
    unsubscribe();
    if (timer !== null) timers.clear(timer);
  };
}

/** `watchThinking` for the page: true while the opponent has been deciding for a while. */
export function useOpponentThinking(delayMs: number = THINKING_DELAY_MS): boolean {
  const store = useStoreApi();
  const [thinking, setThinking] = useState(false);
  useEffect(() => watchThinking(store, delayMs, setThinking), [store, delayMs]);
  return thinking;
}
