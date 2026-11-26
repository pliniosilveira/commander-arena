/**
 * "It becomes an Aura with \"enchant creature put onto the battlefield with this enchantment.\"" (CR 303.4, 702.5a, 613.1d, 613.1f, 205.3h, 611.2a; the `becomeAura` effect, Necromancy):
 * two continuous effects of the permanent, which last for as long as it stays on the battlefield (the permanent that leaves and returns is a new object, CR 400.7, so effects that name
 * the object are over with it): its Aura subtype, added in layer 4 to the types it has (an Aura is an enchantment, CR 303.4), and the enchant ability it is given, in layer 6. Nothing in the
 * engine reads the printed enchant ability of a permanent: what the Aura may be attached to, and what state-based actions check (CR 704.5m, `rules/attach.ts`), come from the subtypes and
 * abilities it has now, so once this has resolved an `attach` of the permanent to what that enchant ability allows works, and an Aura that is attached to nothing goes to the graveyard.
 */
import type { Effect } from '../ast/types';
import { allocateTimestamp } from '../state/ops';
import type { ChosenTarget, ContinuousEffect, GameState } from '../state/types';
import { resolveObjects, type SelectContext } from './select';
import { done, type StepOutcome } from './step-outcome';

type BecomeAura = Extract<Effect, { kind: 'becomeAura' }>;

export function runBecomeAura(
  state: GameState,
  effect: BecomeAura,
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
): StepOutcome {
  // CR 611.2c: the permanent is fixed as the effect begins; one that is not on the battlefield any more is skipped (CR 608.2b).
  const affected = resolveObjects(state, effect.objects, ctx, targets).filter(
    (id) => state.objects[id]?.zone === 'battlefield',
  );
  if (affected.length === 0) return done(state);
  const [typeStamp, first] = allocateTimestamp(state);
  const [abilityStamp, second] = allocateTimestamp(first);
  const subtype: ContinuousEffect = {
    id: `ce${typeStamp}`,
    timestamp: typeStamp,
    objects: affected,
    until: 'permanent',
    change: { kind: 'setTypes', subtypes: ['Aura'], additive: true },
  };
  const ability: ContinuousEffect = {
    id: `ce${abilityStamp}`,
    timestamp: abilityStamp,
    objects: affected,
    until: 'permanent',
    change: { kind: 'grantKeyword', keyword: effect.enchant },
  };
  return done({ ...second, continuousEffects: [...second.continuousEffects, subtype, ability] });
}
