/**
 * Layer 4 (CR 613.1d) from the static abilities of permanents (D-139): "Other creatures you control are Juggernauts in addition to
 * their other creature types" (`setTypes` with named subtypes or card types for a subject) and "This creature has the creature types of
 * the last creature card exiled with it" (`takeFromLinkedExile`). `derive-view.ts` applies the effects returned here with the permanent's
 * timestamp, in order with the continuous effects of resolved spells (CR 613.7).
 *
 * What a subject matches is read from the object after layer 1 and the continuous effects of resolved spells, before the effects of this
 * file (the `view` the caller passes): no effect of these kinds depends on another (CR 613.8; a lord of Goblins that makes a Goblin out
 * of a creature does not make the next lord's subject match: each reads the same view). It must not import `derive`, `derive-view`
 * or `derive-count`: `derive-view` depends on this file. The scan is made once per game state, as `derive-statics.ts` does.
 */

import type { Condition, ObjectFilter, StaticSubject } from '../ast/types';
import type { CardType, Color } from '../characteristics';
import { isNonCreatureSubtype, type Subtype } from '../characteristics';
import type { ObjectId } from '../ids';
import type { ContinuousEffect, GameObject, GameState } from '../state/types';
import { plainConditionHolds } from './condition-reads';
import { controllerOf } from './control';
import { copiableValues } from './copiable';
import { type FilterSubject, matchesFilterWith } from './filter-match';
import { hasLostAbilities } from './lost-abilities';
import { subjectAffects } from './static-subject';

interface NamedTypes {
  readonly kind: 'named';
  readonly subtypes: readonly Subtype[];
  readonly types: readonly CardType[];
  /** "In addition to its other types" (CR 205.1b); false replaces the card types and the creature types (D-145, CR 205.1a). */
  readonly additive: boolean;
}
interface NamedColors {
  readonly kind: 'colors';
  readonly colors: readonly Color[];
}
interface LostTypes {
  readonly kind: 'lose';
  readonly types: readonly CardType[];
}
interface LinkedTypes {
  readonly kind: 'linked';
  readonly from: ObjectFilter;
  readonly also: readonly Subtype[];
}

interface TypeSource {
  readonly object: GameObject;
  readonly subject: StaticSubject;
  readonly what: NamedTypes | NamedColors | LinkedTypes | LostTypes;
  /** "As long as ..." (D-151, Celebration): a condition that reads no characteristic, read each time the effects are looked at (CR 611.3a). */
  readonly condition?: Condition;
}

interface Index {
  readonly battlefield: readonly ObjectId[];
  readonly definitions: GameState['definitions'];
  readonly effects: GameState['continuousEffects'];
  readonly sources: readonly TypeSource[];
}

const NONE: readonly ContinuousEffect[] = [];
const cache = new WeakMap<object, Index>();

function scan(state: GameState): Index {
  const sources: TypeSource[] = [];
  for (const id of state.battlefield) {
    const object = state.objects[id];
    if (object === undefined || hasLostAbilities(state, id)) continue;
    for (const a of copiableValues(state, object).abilities) {
      if (a.kind !== 'static') continue;
      const s = a.static;
      const condition = a.condition === undefined ? {} : { condition: a.condition };
      if (s.kind === 'setTypes' && s.chosenType === undefined) {
        sources.push({
          object,
          subject: s.subject,
          what: {
            kind: 'named',
            subtypes: s.subtypes ?? [],
            types: s.types ?? [],
            additive: s.additive === true,
          },
          ...condition,
        });
      } else if (s.kind === 'loseTypes') {
        // CR 613.1d, 205.1a (D-229): "~ isn't a creature", layer 4, with a condition that reads no characteristic.
        sources.push({
          object,
          subject: s.subject,
          what: { kind: 'lose', types: s.types },
          ...condition,
        });
      } else if (s.kind === 'setColors') {
        // CR 613.1e (D-145): "Enchanted creature is a green Elk creature": layer 5, read with the types.
        sources.push({
          object,
          subject: s.subject,
          what: { kind: 'colors', colors: s.colors },
          ...condition,
        });
      } else if (s.kind === 'takeFromLinkedExile') {
        sources.push({
          object,
          subject: s.subject,
          what: { kind: 'linked', from: s.from, also: s.alsoSubtypes ?? [] },
        });
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

function indexOf(state: GameState): Index {
  const hit = cache.get(state.objects);
  if (
    hit !== undefined &&
    hit.battlefield === state.battlefield &&
    hit.definitions === state.definitions &&
    hit.effects === state.continuousEffects
  ) {
    return hit;
  }
  const fresh = scan(state);
  cache.set(state.objects, fresh);
  return fresh;
}

/**
 * CR 607.2a (D-139): the last card, in the order they were exiled, among the cards `source` exiled with a linked ability that are still in
 * exile and that the filter matches, read by what is printed on the card (it is in exile: no layer but a copy effect changes a card
 * there). Null when there is none.
 */
export function linkedCardOf(
  state: GameState,
  source: GameObject,
  from: ObjectFilter,
): GameObject | null {
  const ids = source.linkedExile ?? [];
  for (let i = ids.length - 1; i >= 0; i -= 1) {
    const card = state.objects[ids[i] as ObjectId];
    if (card?.zone !== 'exile') continue;
    const c = copiableValues(state, card).characteristics;
    const view: FilterSubject = {
      types: c.types,
      supertypes: c.supertypes,
      subtypes: c.subtypes,
      colors: c.colors,
    };
    // The filter describes the card (a "creature card"); where it is and whose it is are the link's.
    if (
      matchesFilterWith(
        state,
        card,
        () => view,
        { ...from, zone: 'exile' },
        {
          controller: controllerOf(state, source),
          source: source.id,
        },
      )
    ) {
      return card;
    }
  }
  return null;
}

/** The creature types printed on a card (CR 205.3m): its subtypes that are not those of another card type. */
function creatureTypesOf(state: GameState, card: GameObject): readonly Subtype[] {
  return copiableValues(state, card).characteristics.subtypes.filter(
    (t) => !isNonCreatureSubtype(t),
  );
}

/**
 * The layer 4 effects the static abilities of the battlefield have on `target`, whose characteristics after layer 1 and the effects of
 * resolved spells are `view`: one synthetic continuous effect each, with the timestamp of its permanent (CR 613.7a). Usually none.
 */
export function groupTypeEffects(
  state: GameState,
  target: GameObject,
  view: FilterSubject,
): readonly ContinuousEffect[] {
  if (target.zone !== 'battlefield') return NONE;
  const { sources } = indexOf(state);
  if (sources.length === 0) return NONE;
  const out: ContinuousEffect[] = [];
  for (const [i, src] of sources.entries()) {
    if (!subjectAffects(state, src.object, src.subject, target, view)) continue;
    if (
      src.condition !== undefined &&
      !plainConditionHolds(state, src.condition, controllerOf(state, src.object))
    ) {
      continue;
    }
    const base = {
      id: `static:${src.object.id}:types:${i}`,
      timestamp: src.object.timestamp,
      objects: [target.id],
      until: 'permanent' as const,
    };
    if (src.what.kind === 'named') {
      out.push({
        ...base,
        change: {
          kind: 'setTypes',
          ...(src.what.additive ? { additive: true as const } : {}),
          ...(src.what.subtypes.length === 0 ? {} : { subtypes: src.what.subtypes }),
          ...(src.what.types.length === 0 ? {} : { types: src.what.types }),
        },
      });
      continue;
    }
    if (src.what.kind === 'lose') {
      out.push({ ...base, change: { kind: 'setTypes', remove: src.what.types } });
      continue;
    }
    if (src.what.kind === 'colors') {
      out.push({ ...base, change: { kind: 'setColors', colors: src.what.colors } });
      continue;
    }
    const card = linkedCardOf(state, src.object, src.what.from);
    if (card === null) continue;
    // CR 205.1a: the creature types of the card replace the creature types the permanent has; "It's still a Shapeshifter".
    out.push({
      ...base,
      change: {
        kind: 'setTypes',
        subtypes: [...new Set([...creatureTypesOf(state, card), ...src.what.also])],
      },
    });
  }
  return out;
}
