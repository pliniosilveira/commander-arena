/**
 * The game Worker (SPEC 4.1, D-016): hosts the engine and the AI off the main thread and exposes
 * `GameClient` through Comlink. It owns the only copy of the real `GameState`.
 */
import { expose } from 'comlink';
import { GameHost } from './host';
import type { GameClient } from './protocol';

const host: GameClient = new GameHost({ clock: () => performance.now() });
expose(host);
