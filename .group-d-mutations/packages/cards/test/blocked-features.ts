// Shared by the parser "needs" tests (parser-p*-needs.test.ts): they replace the engine's support
// check by one that lacks chosen features, to prove that a lowering names the feature it needs
// (D-068). This module must not import the engine: it runs inside the engine's `vi.mock` factory.
import type * as Engine from '@commander-arena/engine';

/** The feature refs the engine is pretended not to list while a test runs. */
export const BLOCKED = new Set<string>();

/** The engine module with `isFeatureSupported` answering false for every ref in `BLOCKED`. */
export function blockFeatures(real: typeof Engine): typeof Engine {
  return {
    ...real,
    isFeatureSupported: (ref: string) =>
      !BLOCKED.has(ref) &&
      real.isFeatureSupported(ref as Parameters<typeof real.isFeatureSupported>[0]),
  };
}
