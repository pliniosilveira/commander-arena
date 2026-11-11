/**
 * The scenario DSL (SPEC 17.3 A12, D-012). A test-only entry point of the engine
 * (`@commander-arena/engine/testing`): it is not part of the public API of `src/index.ts`, so it
 * never reaches a production bundle, and only test code may import it (`pnpm lint`).
 */
export { createDriver, type DriverOptions } from './driver';
export { type ScenarioBuilder, scenario } from './scenario';
export { startGame } from './start';
export * from './types';
