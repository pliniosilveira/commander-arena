/**
 * "It loses \"enchant creature card in a graveyard\" and gains \"enchant creature put onto the battlefield with this Aura.\"" (CR 702.5a Enchant, 613.1f, 611.2a, 303.4c; the
 * `replaceEnchant` effect, Animate Dead): a continuous effect of layer 6 that lasts for as long as the Aura stays on the battlefield (the permanent that leaves and returns is a new
 * object, CR 400.7, so the effect, which names the object, is over with it). Nothing in the engine reads the printed enchant ability of a permanent: what the Aura may be attached to and what
 * state-based actions check (CR 704.5m, `rules/attach.ts`) come from the abilities it has now, so as soon as this has resolved a card in a graveyard is no longer a legal object for it.
 */
import type { Effect } from '../ast/types';
import { allocateTimestamp } from '../state/ops';
import type { ChosenTarget, ContinuousEffect, GameState } from '../state/types';
import { resolveObjects, type SelectContext } from './select';
import { done, type StepOutcome } from './step-outcome';

type ReplaceEnchant = Extract<Effect, { kind: 'replaceEnchant' }>;

export function runReplaceEnchant(
  state: GameState,
  effect: ReplaceEnchant,
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
): StepOutcome {
  // CR 611.2c: the permanent is fixed as the effect begins; one that is not on the battlefield any more is skipped (CR 608.2b).
  const affected = resolveObjects(state, effect.objects, ctx, targets).filter(
    (id) => state.objects[id]?.zone === 'battlefield',
  );
  if (affected.length === 0) return done(state);
  const [timestamp, stamped] = allocateTimestamp(state);
  const created: ContinuousEffect = {
    id: `ce${timestamp}`,
    timestamp,
    objects: affected,
    until: 'permanent',
    change: { kind: 'replaceEnchant', loses: effect.loses, gains: effect.gains },
  };
  return done({ ...stamped, continuousEffects: [...stamped.continuousEffects, created] });
}
