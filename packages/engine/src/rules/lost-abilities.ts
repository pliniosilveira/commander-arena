/**
 * Which permanents have lost all their abilities (CR 613.1f): by a continuous effect of a resolved spell or ability, or (D-145:
 * "Enchanted creature loses all abilities", the `loseAllAbilities` static) by the Aura or Equipment attached to them. The rest of
 * `derive` (the static abilities and the characteristic-defining abilities a permanent has) treats both alike. The scan of
 * attachments reads the printed abilities of the permanents that are attached to something (no `derive`: `derive` depends on this
 * file) and is kept for as long as the objects, the battlefield and the card definitions are the same.
 */
import type { StaticSubject } from '../ast/types';
import type { ObjectId } from '../ids';
import type { ContinuousEffect, GameObject, GameState } from '../state/types';
import { copiableValues } from './copiable';
import type { FilterSubject } from './filter-match';
import { landTypeSetIds } from './land-types';
import { subjectAffects } from './static-subject';

interface Cached {
  readonly battlefield: GameState['battlefield'];
  readonly definitions: GameState['definitions'];
  readonly effects: GameState['continuousEffects'];
  readonly lost: ReadonlySet<ObjectId>;
}

const NONE: ReadonlySet<ObjectId> = new Set();
const cache = new WeakMap<object, Cached>();

interface GroupLoss {
  readonly subject: Extract<StaticSubject, { kind: 'filter' }>;
}

/** What a group's `loseAllAbilities` reads of a permanent: its types, colors and counters as the copiable values give them (layer 1), which no layer 6 effect changes (CR 613.8). */
function viewOfPrinted(state: GameState, obj: GameObject): FilterSubject {
  const c = copiableValues(state, obj).characteristics;
  return { types: c.types, supertypes: c.supertypes, subtypes: c.subtypes, colors: c.colors };
}

/**
 * CR 613.1f, 613.7 ("Non-Horror creatures with slime counters on them lose all abilities", Sludge Monster): the permanents a static `loseAllAbilities` with a group subject makes lose
 * their abilities, from the printed abilities of the permanents on the battlefield, oldest permanent first. A permanent that already lost its abilities to an older one applies none (its own
 * static ability is among what it lost). The types and colors read are the copiable values (a layer 4 or 5 effect is not seen: a known limit).
 */
function groupLosses(state: GameState, lost: Set<ObjectId> | null): Set<ObjectId> | null {
  const sources: { object: GameObject; loss: GroupLoss }[] = [];
  for (const id of state.battlefield) {
    const object = state.objects[id];
    if (object === undefined || (object.card === null && object.token === null)) continue;
    for (const a of copiableValues(state, object).abilities) {
      if (
        a.kind === 'static' &&
        a.static.kind === 'loseAllAbilities' &&
        a.static.subject.kind === 'filter'
      ) {
        sources.push({ object, loss: { subject: a.static.subject } });
      }
    }
  }
  if (sources.length === 0) return lost;
  sources.sort((a, b) => a.object.timestamp - b.object.timestamp);
  for (const { object, loss } of sources) {
    if (lost?.has(object.id) === true) continue;
    for (const id of state.battlefield) {
      const target = state.objects[id];
      if (target === undefined || lost?.has(id) === true) continue;
      if (!subjectAffects(state, object, loss.subject, target, viewOfPrinted(state, target))) {
        continue;
      }
      lost ??= new Set();
      lost.add(id);
    }
  }
  return lost;
}

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
  return groupLosses(state, lost) ?? NONE;
}

/** The permanents that a static `loseAllAbilities` of what is attached to them makes lose their abilities. */
export function staticallyLostAbilities(state: GameState): ReadonlySet<ObjectId> {
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
 * printed static abilities go too).
 */
export function hasLostAbilities(state: GameState, id: ObjectId): boolean {
  return (
    effectLostAbilities(state.continuousEffects).has(id) ||
    staticallyLostAbilities(state).has(id) ||
    landLostRulesText(state, id)
  );
}

/**
 * CR 305.7 (D-474): a land whose basic land types an effect set loses all abilities generated from its rules text, its static abilities among them. The abilities
 * other effects give it stay (layer 6 comes after), which `derive` keeps by not removing them.
 */
function landLostRulesText(state: GameState, id: ObjectId): boolean {
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
function effectLostAbilities(effects: readonly ContinuousEffect[]): ReadonlySet<ObjectId> {
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
