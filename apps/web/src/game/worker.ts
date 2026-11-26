/**
 * The game Worker (SPEC 4.1, D-016): hosts the engine and the AI off the main thread and exposes
 * `GameClient` through Comlink. It owns the only copy of the real `GameState`. It also owns the pool of
 * workers that play out the AI's plannings in parallel (`play-out-pool.ts`, issue 653), started when the AI
 * first plans.
 */
import { expose } from 'comlink';
import { GameHost } from './host';
import { overrideFromName, type PoolWorker, poolSizeFor, WorkerPlayOutPool } from './play-out-pool';
import type { GameClient } from './protocol';

const size = poolSizeFor(navigator.hardwareConcurrency, overrideFromName(self.name));
const playOuts =
  size === 0
    ? undefined
    : new WorkerPlayOutPool({
        size,
        spawn: () =>
          new Worker(new URL('./play-out.worker.ts', import.meta.url), {
            type: 'module',
          }) as unknown as PoolWorker,
      });

const host: GameClient = new GameHost({
  clock: () => performance.now(),
  ...(playOuts === undefined ? {} : { playOuts }),
});
expose(host);
