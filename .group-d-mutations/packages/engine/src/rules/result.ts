import type { GameEvent } from '../state/events';
import type { GameState } from '../state/types';

export type Result =
  | { readonly ok: true; readonly state: GameState; readonly events: GameEvent[] }
  | { readonly ok: false; readonly error: string };

export function ok(state: GameState, events: GameEvent[] = []): Result {
  return { ok: true, state, events };
}

export function fail(error: string): Result {
  return { ok: false, error };
}
