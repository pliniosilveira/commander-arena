/**
 * Triggered mana abilities (CR 605.1b, 605.4, D-139): "Whenever you tap a permanent for {C}, add an additional {C}." Such an ability does
 * not go on the stack: it resolves as soon as the mana ability that triggered it has (CR 605.4a), and its mana goes to the same pool. This
 * engine finds them where a mana ability is activated (`mana-engine.ts`, by hand) and where the payment planner reads what a source makes
 * (`mana-sources.ts`): the extra mana is counted with the mana the source makes, so a plan never taps more than it must.
 *
 * "Tap a permanent for mana" is activating a mana ability with {T} in its cost (CR 106.12). The permanent that is tapped must match the
 * trigger's filter, belong to the controller of the triggered ability (`by` is "you"), and, when the trigger names a type of mana, the
 * mana ability must have produced that type. Several abilities each add their own mana.
 */
import type { ManaAbility, Trigger } from '../ast/types';
import type { ManaColor } from '../mana/types';
import type { GameObject, GameState } from '../state/types';
import { controllerOf } from './control';
import { derive } from './derive';
import { matchesFilter } from './select';

type ManaTrigger = Extract<Trigger, { kind: 'tappedForMana' }>;

interface Source {
  readonly object: GameObject;
  readonly trigger: ManaTrigger;
  readonly mana: readonly ManaColor[];
}

interface Index {
  readonly battlefield: GameState['battlefield'];
  readonly definitions: GameState['definitions'];
  readonly effects: GameState['continuousEffects'];
  readonly sources: readonly Source[];
}

const cache = new WeakMap<object, Index>();

function scan(state: GameState): Index {
  const sources: Source[] = [];
  for (const id of state.battlefield) {
    const object = state.objects[id];
    if (object === undefined) continue;
    for (const a of derive(state, object).abilities) {
      if (
        a.kind === 'triggered' &&
        a.trigger.kind === 'tappedForMana' &&
        a.effect.kind === 'addMana' &&
        a.effect.mana.kind === 'fixed'
      ) {
        sources.push({ object, trigger: a.trigger, mana: a.effect.mana.mana });
      }
    }
  }
  return {
    battlefield: state.battlefield,
    definitions: state.definitions,
    effects: state.continuousEffects,
    sources,
  };
}

function sourcesOf(state: GameState): readonly Source[] {
  const hit = cache.get(state.objects);
  if (
    hit !== undefined &&
    hit.battlefield === state.battlefield &&
    hit.definitions === state.definitions &&
    hit.effects === state.continuousEffects
  ) {
    return hit.sources;
  }
  const fresh = scan(state);
  cache.set(state.objects, fresh);
  return fresh.sources;
}

/**
 * The mana the triggered mana abilities add when `tapped` is tapped for `produced` by `ability`: nothing for an ability without {T} in its
 * cost or one that makes no mana. In the order of the abilities on the battlefield.
 */
export function additionalManaFor(
  state: GameState,
  tapped: GameObject,
  ability: ManaAbility,
  produced: readonly ManaColor[],
): ManaColor[] {
  if (produced.length === 0 || !ability.cost.some((c) => c.kind === 'tap')) return [];
  const sources = sourcesOf(state);
  if (sources.length === 0) return [];
  const extra: ManaColor[] = [];
  for (const src of sources) {
    if (controllerOf(state, src.object) !== controllerOf(state, tapped)) continue;
    if (src.trigger.mana !== undefined && !produced.includes(src.trigger.mana)) continue;
    const filter = { ...src.trigger.what, zone: 'battlefield' as const };
    if (
      !matchesFilter(state, tapped, filter, {
        controller: controllerOf(state, src.object),
        source: src.object.id,
      })
    ) {
      continue;
    }
    extra.push(...src.mana);
  }
  return extra;
}
