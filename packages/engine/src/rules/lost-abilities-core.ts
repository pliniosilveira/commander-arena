/**
 * Which permanents have lost all their abilities (CR 613.1f): by a continuous effect of a resolved spell or ability, or (D-145:
 * "Enchanted creature loses all abilities", the `loseAllAbilities` static) by the Aura or Equipment attached to them. The rest of
 * `derive` (the static abilities and the characteristic-defining abilities a permanent has) treats both alike. A group that loses all abilities is in
 * `lost-abilities.ts`, which adds it to what is here. The scan of
 * attachments reads the printed abilities of the permanents that are attached to something (no `derive`: `derive` depends on this
 * file) and is kept for as long as the objects, the battlefield and the card definitions are the same.
 */
import type { ObjectId } from '../ids';
import type { ContinuousEffect, GameState } from '../state/types';
import { copiableValues } from './copiable';
import { landTypeSetIds } from './land-types';

interface Cached {
  readonly battlefield: GameState['battlefield'];
  readonly definitions: GameState['definitions'];
  readonly effects: GameState['continuousEffects'];
  readonly lost: ReadonlySet<ObjectId>;
}

const NONE: ReadonlySet<ObjectId> = new Set();
const cache = new WeakMap<object, Cached>();

function scan(state: GameState): ReadonlySet<ObjectId> {
  let lost: Set<ObjectId> | null = null;
  for (const id of state.battlefield) {
    const obj = state.objects[id];
    if (obj === undefined || obj.attachedTo === null) continue;
    const host = state.objects[obj.attachedTo];
    if (host?.zone !== 'battlefield') continue;
    const loses = copiableValues(state, obj).abilities.some(
      (a) => a.kind === 'static' && a.static.kind === 'loseAllAbilities',
    );
    if (!loses) continue;
    lost ??= new Set();
    lost.add(host.id);
  }
  return lost ?? NONE;
}

/** The permanents that a static `loseAllAbilities` of what is attached to them makes lose their abilities. */
export function attachedLostAbilities(state: GameState): ReadonlySet<ObjectId> {
  const hit = cache.get(state.objects);
  if (
    hit !== undefined &&
    hit.battlefield === state.battlefield &&
    hit.definitions === state.definitions &&
    hit.effects === state.continuousEffects
  ) {
    return hit.lost;
  }
  const lost = scan(state);
  cache.set(state.objects, {
    battlefield: state.battlefield,
    definitions: state.definitions,
    effects: state.continuousEffects,
    lost,
  });
  return lost;
}

/**
 * Whether a continuous effect, or the static ability of an Aura or Equipment attached to it (D-145), makes `id` lose all abilities (its
 * printed static abilities go too). Not the group effects of `lost-abilities.ts` (Sludge Monster), which read the filter of the group and so need
 * `rules/static-subject.ts`; `static-control.ts` reads this one because that file comes before `control.ts` (no import cycle).
 */
export function hasLostAbilitiesBase(state: GameState, id: ObjectId): boolean {
  return (
    effectLostAbilities(state.continuousEffects).has(id) ||
    attachedLostAbilities(state).has(id) ||
    landLostRulesText(state, id)
  );
}

/**
 * CR 305.7 (D-474): a land whose basic land types an effect set loses all abilities generated from its rules text, its static abilities among them. The abilities
 * other effects give it stay (layer 6 comes after), which `derive` keeps by not removing them.
 */
export function landLostRulesText(state: GameState, id: ObjectId): boolean {
  if (!landSetBy(state.continuousEffects).has(id)) return false;
  const obj = state.objects[id];
  return obj !== undefined && copiableValues(state, obj).characteristics.types.includes('land');
}

const landSetByEffects = new WeakMap<readonly ContinuousEffect[], ReadonlySet<ObjectId>>();

/** The objects a continuous effect of the list sets to basic land types, made once for each list. */
function landSetBy(effects: readonly ContinuousEffect[]): ReadonlySet<ObjectId> {
  let ids = landSetByEffects.get(effects);
  if (ids === undefined) {
    ids = landTypeSetIds(effects);
    landSetByEffects.set(effects, ids);
  }
  return ids;
}

const lostByEffects = new WeakMap<readonly ContinuousEffect[], ReadonlySet<ObjectId>>();

/** The objects a `loseAllAbilities` continuous effect of the list names, made once for each list (the list is not changed in place). */
export function effectLostAbilities(effects: readonly ContinuousEffect[]): ReadonlySet<ObjectId> {
  let lost = lostByEffects.get(effects);
  if (lost === undefined) {
    const ids = new Set<ObjectId>();
    for (const e of effects) {
      if (e.change.kind === 'loseAllAbilities') for (const id of e.objects) ids.add(id);
    }
    lost = ids;
    lostByEffects.set(effects, lost);
  }
  return lost;
}
