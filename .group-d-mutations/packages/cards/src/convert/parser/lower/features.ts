/**
 * The gate between what the grammar understands and what the engine runs (D-068). A lowering
 * names the engine features it uses as `FeatureRef`s; any of them that SUPPORTED_FEATURES does
 * not list makes the ability "recognised, not runnable" and names what is missing, instead of
 * being reported as text nobody understood.
 */
import { type FeatureRef, isFeatureSupported } from '@commander-arena/engine';

export type { FeatureRef };

/** True when the engine declares the feature in SUPPORTED_FEATURES. */
export function isRunnable(ref: FeatureRef): boolean {
  return isFeatureSupported(ref);
}

/** The features of `refs` the engine does not run, in order, without repeats. */
export function missingFeatures(refs: readonly FeatureRef[]): FeatureRef[] {
  const missing: FeatureRef[] = [];
  for (const ref of refs) if (!isRunnable(ref) && !missing.includes(ref)) missing.push(ref);
  return missing;
}
