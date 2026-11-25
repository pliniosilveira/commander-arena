/**
 * Which permanents have lost all their abilities (CR 613.1f): everything `lost-abilities-core.ts` finds (a continuous effect of a resolved spell or ability, the Aura or Equipment attached
 * to them with the `loseAllAbilities` static, a land whose land types were set) and a group that a `loseAllAbilities` static ability with a filter subject names ("Non-Horror creatures
 * with slime counters on them lose all abilities", Sludge Monster). The group is read through `static-subject.ts`, which reaches `control.ts`; `static-control.ts` (read by `control.ts`)
 * therefore reads the core and not this file.
 */
import type { StaticSubject } from '../ast/types';
import type { ObjectId } from '../ids';
import type { GameObject, GameState } from '../state/types';
import { copiableValues } from './copiable';
import type { FilterSubject } from './filter-match';
import {
  attachedLostAbilities,
  effectLostAbilities,
  landLostRulesText,
} from './lost-abilities-core';
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

/** The permanents that a static `loseAllAbilities` of what is attached to them, or of a group, makes lose their abilities. */
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
  const attached = attachedLostAbilities(state);
  const lost = groupLosses(state, attached.size === 0 ? null : new Set(attached)) ?? attached;
  cache.set(state.objects, {
    battlefield: state.battlefield,
    definitions: state.definitions,
    effects: state.continuousEffects,
    lost: lost.size === 0 ? NONE : lost,
  });
  return lost;
}

/**
 * Whether a continuous effect, a group, or the static ability of an Aura or Equipment attached to it (D-145) makes `id` lose all abilities (its
 * printed static abilities go too).
 */
export function hasLostAbilities(state: GameState, id: ObjectId): boolean {
  return (
    effectLostAbilities(state.continuousEffects).has(id) ||
    staticallyLostAbilities(state).has(id) ||
    landLostRulesText(state, id)
  );
}
