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
import { CREATURE_TYPES } from '../data/creature-types';
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
interface AllCreatureTypes {
  readonly kind: 'allCreatureTypes';
  readonly scope: 'youControl' | 'youOwn';
}

interface ChosenCreatureType {
  readonly kind: 'chosenCreatureType';
  readonly alsoCardsAndSpells: boolean;
}

interface TypeSource {
  readonly object: GameObject;
  readonly subject: StaticSubject;
  readonly what:
    | NamedTypes
    | NamedColors
    | LinkedTypes
    | LostTypes
    | AllCreatureTypes
    | ChosenCreatureType;
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
      if (s.kind === 'allCreatureTypes') {
        sources.push({
          object,
          subject: { kind: 'filter', filter: { types: ['creature'] } },
          what: s,
          ...condition,
        });
      } else if (s.kind === 'giveChosenCreatureType') {
        // CR 613.1d, 607.2d: "Slivers you control ... are the chosen type": the permanents `what` names, and with `alsoCardsAndSpells` the creature spells and cards outside the battlefield.
        sources.push({
          object,
          subject: { kind: 'filter', filter: s.what },
          what: { kind: 'chosenCreatureType', alsoCardsAndSpells: s.alsoCardsAndSpells === true },
          ...condition,
        });
      } else if (s.kind === 'setTypes' && s.chosenType === undefined) {
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
/** Every card the permanent exiled with its linked ability that is still in exile and that the filter describes (CR 607.2a), in the order they were exiled. */
export function linkedCardsOf(
  state: GameState,
  source: GameObject,
  from: ObjectFilter,
): GameObject[] {
  const out: GameObject[] = [];
  for (const id of source.linkedExile ?? []) {
    const card = state.objects[id];
    if (card?.zone !== 'exile') continue;
    const c = copiableValues(state, card).characteristics;
    const view: FilterSubject = {
      types: c.types,
      supertypes: c.supertypes,
      subtypes: c.subtypes,
      colors: c.colors,
    };
    if (
      matchesFilterWith(
        state,
        card,
        () => view,
        { ...from, zone: 'exile' },
        { controller: controllerOf(state, source), source: source.id },
      )
    ) {
      out.push(card);
    }
  }
  return out;
}

export function linkedCardOf(
  state: GameState,
  source: GameObject,
  from: ObjectFilter,
): GameObject | null {
  // "Last" is by timestamp (CR 607.2a, 712.21b): the two cards of an exiled melded permanent are listed in the order they were put in, but the player who exiled it
  // chose which has the later timestamp. The sort is stable, so cards with the same timestamp keep the order they were remembered in.
  const ids = [...(source.linkedExile ?? [])]
    .map((id, index) => ({ id, index, stamp: state.objects[id]?.timestamp ?? 0 }))
    .sort((a, b) => a.stamp - b.stamp || a.index - b.index)
    .map((entry) => entry.id);
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

/**
 * The card on top of the library of the controller of `source` when `card` describes it (issue 144, CR 401.5, 613.1f: "As long as the top card of your library is a Goblin card"),
 * read by what is printed on it (it is in a library: no layer but a copy effect changes it there). Null when the library is empty or the top card does not match.
 */
export function topCardOf(
  state: GameState,
  source: GameObject,
  card: ObjectFilter,
): GameObject | null {
  const owner = controllerOf(state, source);
  const topId = state.seats[owner]?.library[0];
  const top = topId === undefined ? undefined : state.objects[topId];
  if (top === undefined) return null;
  const c = copiableValues(state, top).characteristics;
  const view: FilterSubject = {
    types: c.types,
    supertypes: c.supertypes,
    subtypes: c.subtypes,
    colors: c.colors,
  };
  // The filter describes the card (a "Goblin card"); where it is and whose it is are the library's.
  const matches = matchesFilterWith(
    state,
    top,
    () => view,
    { ...card, zone: 'library' },
    { controller: owner, source: source.id },
  );
  return matches ? top : null;
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
  const { sources } = indexOf(state);
  if (sources.length === 0) return NONE;
  const out: ContinuousEffect[] = [];
  for (const [i, src] of sources.entries()) {
    if (src.what.kind === 'allCreatureTypes') {
      if (!view.types.includes('creature')) continue;
      const you = controllerOf(state, src.object);
      const applies =
        src.what.scope === 'youControl'
          ? (target.zone === 'battlefield' ||
              (target.zone === 'stack' && target.stack?.kind === 'spell')) &&
            controllerOf(state, target) === you
          : target.zone !== 'battlefield' && target.card !== null && target.owner === you;
      if (!applies) continue;
    } else if (src.what.kind === 'chosenCreatureType') {
      // CR 607.2d: what the permanent chose as it entered; it chose none: nothing to give.
      if (src.object.chosen?.creatureType === undefined) continue;
      const you = controllerOf(state, src.object);
      const onBattlefield =
        target.zone === 'battlefield' &&
        subjectAffects(state, src.object, src.subject, target, view);
      // CR 205.3m, 702.73a: the creature spells its controller controls and the creature cards it owns outside the battlefield, in every zone (as Changeling works).
      const elsewhere =
        src.what.alsoCardsAndSpells &&
        view.types.includes('creature') &&
        ((target.zone === 'stack' &&
          target.stack?.kind === 'spell' &&
          controllerOf(state, target) === you) ||
          (target.zone !== 'battlefield' && target.card !== null && target.owner === you));
      if (!onBattlefield && !elsewhere) continue;
    } else if (
      target.zone !== 'battlefield' ||
      !subjectAffects(state, src.object, src.subject, target, view)
    )
      continue;
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
    if (src.what.kind === 'allCreatureTypes') {
      out.push({ ...base, change: { kind: 'setTypes', subtypes: CREATURE_TYPES, additive: true } });
      continue;
    }
    if (src.what.kind === 'chosenCreatureType') {
      const chosen = src.object.chosen?.creatureType;
      if (chosen === undefined) continue;
      out.push({ ...base, change: { kind: 'setTypes', subtypes: [chosen], additive: true } });
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
