/**
 * A test seam for the "Opponent is thinking" status (D-174): `?autostart=...&aidelay=<ms>` holds back
 * every answer of the Worker in which the AI acted for that many milliseconds, as a long AI decision
 * would. It wraps the client on the page's side, so the host and the engine are untouched. It exists
 * only when the URL names it, and only a start from `?autostart` reads it, so no player can reach it
 * by accident; the value is capped so a typo cannot freeze a game.
 */
import type { Action } from '@commander-arena/engine';
import { AI_SEAT, type GameClient, type Snapshot } from './protocol';

/** The longest delay the URL may ask for. */
export const MAX_AI_DELAY_MS = 10_000;

/** The delay `aidelay` asks for: a whole number of milliseconds from 1 up to the cap, else null. */
export function autostartAiDelay(params: URLSearchParams): number | null {
  const value = params.get('aidelay');
  if (value === null || !/^\d+$/.test(value)) return null;
  const ms = Number(value);
  return ms >= 1 ? Math.min(ms, MAX_AI_DELAY_MS) : null;
}

/** `client`, except that an `act` whose answer holds a step of the AI arrives `delayMs` late. */
export function withSlowOpponent(
  client: GameClient,
  delayMs: number,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): GameClient {
  return {
    newGame: (options) => client.newGame(options),
    undo: () => client.undo(),
    async act(action: Action): Promise<Snapshot> {
      const reply = await client.act(action);
      if (reply.steps.some((step) => step.seat === AI_SEAT)) await sleep(delayMs);
      return reply;
    },
  };
}
