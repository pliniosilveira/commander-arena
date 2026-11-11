import { wrap } from 'comlink';
import type { GameClient } from './protocol';

/** The real thing: a module Worker running the engine and the AI. */
export function createWorkerClient(): GameClient {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  return wrap<GameClient>(worker);
}
