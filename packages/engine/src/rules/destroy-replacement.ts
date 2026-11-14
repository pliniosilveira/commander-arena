/**
 * The replacement effects of the destruction of a permanent (CR 614.1a, 616.1; D-417, D-418): a regeneration shield (CR 701.19a, `rules/regenerate.ts`) and
 * the Umbra armor of each Aura attached to the permanent (CR 702.89a: "If enchanted permanent would be destroyed, instead remove all damage marked on it and
 * destroy this Aura"). Both replace the same event, the destruction, and either one leaves nothing for the other to replace: the permanent is not destroyed
 * any more, so the effect applied first is the only one used up. When two or more apply, the player who controls the permanent chooses which (CR 616.1,
 * "the affected object's controller ... chooses one to apply"): the question is the replacement question of damage and tokens (`chooseOption`, purpose
 * `'replacement'`, D-191, D-221) with the `destroy` variant, so no new kind of decision exists. With one effect nothing is asked (CR 616.1 needs two or more).
 *
 * Callers: the effect `destroy` (the instruction asks and runs again from the same state with the answer, `OrderFlow`, as the damage and token questions
 * do) and the state-based actions for lethal damage and deathtouch (CR 704.5g, 704.5h: the check defers the permanent, asks when nothing else was performed and is
 * made again after the answer, `answerDestruction`). An indestructible permanent is not destroyed at all (CR 702.12b, 701.8), so neither is asked of it. A destruction
 * that "can't be regenerated" (CR 701.19c) is replaced by Umbra armor all the same (it is not a regeneration).
 *
 * Umbra armor removes all damage marked on the permanent (and the note that deathtouch damage was dealt to it), does not tap it and does not take it out of
 * combat, and then destroys the Aura: an indestructible Aura is not destroyed, one with a regeneration shield regenerates instead, any other goes to its owner's
 * graveyard (CR 704.5m needs no help: the permanent stays, the Aura leaves). The default order, the answer of an agent that must give one: the regeneration
 * shield first (it lasts only this turn and costs no Aura), then the Auras, the oldest first.
 */
import type { ObjectId } from '../ids';
import type { ChooseOptionDecision, DestroyReplacementChoice } from '../state/decisions';
import type { GameEvent } from '../state/events';
import { patchObject } from '../state/ops';
import type { GameObject, GameState } from '../state/types';
import { controllerOf } from './control';
import type { OrderFlow } from './damage-order';
import { derive } from './derive';
import { replacementSources } from './die-replacement';
import { attachmentsOf } from './modified';
import { hasRegenerationShield, regenerateInstead } from './regenerate';
import { sourceInfo } from './source-info';
import { moveObject } from './zones';

/** One effect that can replace the destruction: the key is the answer to the question. */
interface DestroyEffect {
  readonly key: string;
  readonly kind: 'regenerate' | 'umbra';
  /** The Aura of an Umbra armor. */
  readonly aura?: GameObject;
  readonly auraName?: string;
}

const REGENERATE_KEY = 'regenerate';
const umbraKey = (aura: ObjectId): string => `umbra:${aura}`;

const hasIndestructible = (state: GameState, obj: GameObject): boolean =>
  derive(state, obj).abilities.some(
    (a) => a.kind === 'keyword' && a.keyword.kind === 'indestructible',
  );

/** The Auras attached to `id` whose abilities (as they are now, CR 613.1f) include Umbra armor, oldest first. */
function umbraAuras(state: GameState, id: ObjectId): readonly { aura: GameObject; name: string }[] {
  const found: { aura: GameObject; name: string }[] = [];
  for (const attached of attachmentsOf(state, id)) {
    const d = derive(state, attached);
    if (
      d.subtypes.includes('Aura') &&
      d.abilities.some((a) => a.kind === 'replacement' && a.replacement.kind === 'umbraArmor')
    ) {
      found.push({ aura: attached, name: d.name });
    }
  }
  return found;
}

/** The effects that can replace the destruction of `id` now, in the default order. */
function effectsOf(
  state: GameState,
  id: ObjectId,
  cantBeRegenerated: boolean,
): readonly DestroyEffect[] {
  const effects: DestroyEffect[] = [];
  // CR 701.19c: a destruction that can't be regenerated is not replaced by a regeneration shield, which stays.
  if (!cantBeRegenerated && hasRegenerationShield(state, id)) {
    effects.push({ key: REGENERATE_KEY, kind: 'regenerate' });
  }
  for (const { aura, name } of umbraAuras(state, id)) {
    effects.push({ key: umbraKey(aura.id), kind: 'umbra', aura, auraName: name });
  }
  return effects;
}

/** The Aura of an Umbra armor is destroyed (CR 702.89a): not if it is indestructible, regenerated if it has a shield, else put into its owner's graveyard. */
function destroyAura(
  state: GameState,
  aura: GameObject,
): {
  readonly state: GameState;
  readonly events: GameEvent[];
  readonly destroyed?: readonly ObjectId[];
} {
  if (aura.zone !== 'battlefield' || hasIndestructible(state, aura)) return { state, events: [] };
  const regenerated = regenerateInstead(state, aura.id);
  if (regenerated !== null) return regenerated;
  const moved = moveObject(state, {
    object: aura.id,
    to: 'graveyard',
    replacers: replacementSources(state),
  });
  return moved.kind === 'done'
    ? { state: moved.state, events: [...moved.events], destroyed: [aura.id] }
    : { state, events: [] };
}

/** Applies one effect to the destruction of `id`: the permanent is not destroyed. */
function applyEffect(
  state: GameState,
  id: ObjectId,
  effect: DestroyEffect,
): {
  readonly state: GameState;
  readonly events: GameEvent[];
  readonly destroyed?: readonly ObjectId[];
} {
  if (effect.kind === 'regenerate') {
    return regenerateInstead(state, id) ?? { state, events: [] };
  }
  const aura = effect.aura;
  if (aura === undefined) return { state, events: [] };
  // CR 702.89a: remove all damage marked on it (and the memory that deathtouch damage was dealt, CR 704.5h), then destroy the Aura.
  const cleared = patchObject(state, id, { damage: 0, damagedByDeathtouch: false });
  const used: GameEvent = { kind: 'umbraArmorUsed', object: id, aura: aura.id };
  const gone = destroyAura(cleared, aura);
  return {
    state: gone.state,
    events: [used, ...gone.events],
    ...(gone.destroyed === undefined ? {} : { destroyed: gone.destroyed }),
  };
}

/** What settling a destruction gives: nothing replaces it, or it was replaced (the state and events after the effect applied). */
export type Destruction =
  | { readonly kind: 'destroyed' }
  | {
      readonly kind: 'replaced';
      readonly state: GameState;
      readonly events: GameEvent[];
      /** Other permanents actually destroyed by the replacement (Umbra armor), counted by the original effect. */
      readonly destroyed?: readonly ObjectId[];
    };

/** The decision of the question, before the engine gives it its id. */
export type DestroyDecision = Omit<ChooseOptionDecision, 'id' | 'replacement'> & {
  readonly replacement: Extract<
    NonNullable<ChooseOptionDecision['replacement']>,
    { destroy: object }
  >;
};

/** A question the controller of the permanent must answer before its destruction can be settled. Nothing was changed. */
export interface DestroyAsked {
  readonly kind: 'asked';
  readonly decision: DestroyDecision;
}

const textOf = (effect: DestroyEffect): string =>
  effect.kind === 'regenerate'
    ? 'Regenerate it instead: remove all damage from it, tap it and remove it from combat'
    : `Remove all damage from it and destroy ${effect.auraName ?? 'the Aura'} instead (Umbra armor)`;

function question(
  state: GameState,
  obj: GameObject,
  effects: readonly DestroyEffect[],
  during: 'resolution' | 'sba',
): DestroyDecision {
  const info = sourceInfo(state, obj.id);
  const choices: DestroyReplacementChoice[] = effects.map((effect) => ({
    option: effect.key,
    kind: effect.kind,
    text: textOf(effect),
    ...(effect.aura === undefined
      ? {}
      : { object: effect.aura.id, objectName: effect.auraName ?? '' }),
    outcome: { aura: effect.auraName ?? null, tapped: effect.kind === 'regenerate' },
  }));
  return {
    kind: 'chooseOption',
    // CR 616.1: the affected object's controller chooses.
    seat: controllerOf(state, obj),
    purpose: 'replacement',
    options: effects.map((e) => e.key),
    source: obj.id,
    sourceName: info?.name ?? '',
    sourceOracleText: info?.oracleText ?? '',
    replacement: {
      destroy: { object: obj.id, objectName: info?.name ?? '', during },
      choices,
    },
  };
}

/**
 * Settles the destruction of `id`, a permanent on the battlefield that is not indestructible (the caller leaves those out): `destroyed` when no effect
 * replaces it; `replaced` with the state after the effect the controller chose (the only one, or the answer of `flow`, or the first in the default order
 * when `flow` does not ask); `asked` when two or more apply and `flow` has no answer left (nothing is changed, the caller runs again with the answer).
 */
export function settleDestruction(
  state: GameState,
  id: ObjectId,
  cantBeRegenerated: boolean,
  flow: OrderFlow,
  during: 'resolution' | 'sba',
): Destruction | DestroyAsked {
  const obj = state.objects[id];
  if (obj?.zone !== 'battlefield') return { kind: 'replaced', state, events: [] };
  const effects = effectsOf(state, id, cantBeRegenerated);
  const [first] = effects;
  if (first === undefined) return { kind: 'destroyed' };
  let pick = first;
  if (effects.length > 1 && flow.ask) {
    const answer = flow.answers[flow.used];
    if (answer === undefined) {
      return { kind: 'asked', decision: question(state, obj, effects, during) };
    }
    flow.used += 1;
    // The answer was checked against the options when it was given; the state is the same now, so it is one of them.
    pick = effects.find((e) => e.key === answer) ?? first;
  }
  const applied = applyEffect(state, id, pick);
  return { kind: 'replaced', ...applied };
}

/**
 * The answer to the question of the state-based actions (`during` 'sba'): the effect of key `option` replaces the destruction of `id` now. Null when the
 * permanent has left or the key is no longer one of the effects (the caller checked it against the decision).
 */
export function answerDestruction(
  state: GameState,
  id: ObjectId,
  option: string,
): { readonly state: GameState; readonly events: GameEvent[] } | null {
  const obj = state.objects[id];
  if (obj?.zone !== 'battlefield') return null;
  const effect = effectsOf(state, id, false).find((e) => e.key === option);
  return effect === undefined ? null : applyEffect(state, id, effect);
}
