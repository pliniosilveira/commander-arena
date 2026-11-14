/** Scenario drivers for games that start from createGame (decks, seeds, mulligans). */
import { createGame, type GameConfig } from '../rules/setup';
import { createDriver, type DriverOptions } from './driver';
import type { ScenarioGame } from './types';

/**
 * Starts a real game with createGame and wraps it in the driver. The game waits at the first
 * mulligan decision (CR 103.5). The events of createGame are in `g.events`.
 */
export function startGame(config: GameConfig, options: DriverOptions = {}): ScenarioGame {
  const created = createGame(config);
  return createDriver(created.state, { ...options, events: created.events });
}
