import { wrap } from 'comlink';
import { workerNameFor } from './play-out-pool';
import type { GameClient } from './protocol';

/**
 * The real thing: a module Worker running the engine and the AI. `playOutWorkers` (`?workers=` of the page)
 * sets how many workers it starts to play out the AI's plannings; absent, the device decides.
 */
export function createWorkerClient(playOutWorkers: number | null = null): GameClient {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), {
    type: 'module',
    name: workerNameFor(playOutWorkers),
  });
  return wrap<GameClient>(worker);
}
