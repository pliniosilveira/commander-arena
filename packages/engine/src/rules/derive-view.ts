/**
 * What an object is after layers 1, 4 and 5 and before anything else (CR 613.1): its copiable values
 * (`copiable.ts`), its types and subtypes (layer 4) and its colors (layer 5). `derive` starts from it,
 * and so does everything that must look at other objects while `derive` is working out one of them:
 * the amount of a static ability or of a characteristic-defining ability that counts ("+1/+1 for each
 * artifact you control", D-115) reads this and never `derive`, so counting cannot loop (CR 613.8: no
 * layer 7 effect depends on one that changes types, which come first; counting reads nothing of power
 * and toughness).
 *
 * The one rule layers 4 and 5 follow beyond the continuous effects of resolved spells: Changeling and
 * Devoid (CR 702.73a, 702.114a) are characteristic-defining abilities, applied first in their layers
 * (CR 613.3) from the printed abilities in every zone (D-110), and a permanent that chose a creature type
 * adds it in layer 4 (D-100).
 */
import type { Ability } from '../ast/types';
import type { CardType, Color, Subtype, Supertype } from '../characteristics';
import { definitionOf } from '../state/ops';
import type { ContinuousEffect, GameObject, GameState } from '../state/types';
import { copiableValues, isCopying } from './copiable';
import { groupTypeEffects } from './derive-group-types';
import { hasPrintedKeyword } from './derive-keywords';
import { applyColorLayer, applyTypeLayer, effectsOn } from './derive-layers';
import type { FilterSubject } from './filter-match';
import { backFaceManaCost } from './layouts';
import { manaValueOfCost } from './mana-value';

/**
 * Layer 4 (CR 613.1d) from the permanent's own static abilities: "~ is the chosen type in addition to its
 * other types" (D-100) is an additive `setTypes` effect with the permanent's timestamp (CR 613.7a), in
 * order with the continuous effects of resolved spells (a later "becomes a Frog" replaces the creature
 * types it added). It is read from the printed abilities, not from the ones left after layer 6: an effect
 * that has begun to apply in layer 4 goes on applying when "loses all abilities" comes after it in layer 6
 * (CR 613.1, 613.6). Only a permanent on the battlefield that has made the choice has it (CR 611.3b).
 */
function withStaticTypes(
  obj: GameObject,
  printed: readonly Ability[],
  effects: readonly ContinuousEffect[],
): readonly ContinuousEffect[] {
  const type = obj.chosen?.creatureType;
  if (type === undefined || obj.zone !== 'battlefield') return effects;
  const adds = printed.some(
    (a) => a.kind === 'static' && a.static.kind === 'setTypes' && a.static.chosenType === true,
  );
  if (!adds) return effects;
  const own: ContinuousEffect = {
    id: `static:${obj.id}:chosenType`,
    timestamp: obj.timestamp,
    objects: [obj.id],
    until: 'permanent',
    change: { kind: 'setTypes', subtypes: [type], additive: true },
  };
  return [...effects, own].sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Layers 4 and 5 with the static abilities of permanents (D-139): `applyTypeAndColorLayers`, then the layer 4 effects of the static
 * abilities that give types to what their subject names (`derive-group-types.ts`), applied in timestamp order with the rest. What
 * those subjects match is read from the first pass, so no static type effect depends on another (CR 613.8).
 */
export function typeLayersOf(
  state: GameState,
  obj: GameObject,
  base: TypeLayers & {
    readonly abilities: readonly Ability[];
    readonly supertypes: readonly Supertype[];
  },
  effects: readonly ContinuousEffect[],
): TypeLayers {
  const first = applyTypeAndColorLayers(obj, base, effects);
  const group = groupTypeEffects(state, obj, {
    types: first.types,
    supertypes: base.supertypes,
    subtypes: first.subtypes,
    colors: first.colors,
  });
  if (group.length === 0) return first;
  return applyTypeAndColorLayers(
    obj,
    base,
    [...effects, ...group].sort((a, b) => a.timestamp - b.timestamp),
  );
}

/** The type line and colors of an object after layers 4 and 5. */
export interface TypeLayers {
  readonly types: readonly CardType[];
  readonly subtypes: readonly Subtype[];
  readonly colors: readonly Color[];
}

/**
 * Layers 4 and 5 (CR 613.1d, 613.1e) applied to the copiable `base`, with `effects` the continuous
 * effects on the object. They come before the layers static abilities work in, because what those
 * affect is matched against their result (a lord of Frogs affects a creature that became a Frog).
 */
export function applyTypeAndColorLayers(
  obj: GameObject,
  base: TypeLayers & { readonly abilities: readonly Ability[] },
  effects: readonly ContinuousEffect[],
): TypeLayers {
  const changeling = hasPrintedKeyword(base.abilities, 'changeling');
  const devoid = hasPrintedKeyword(base.abilities, 'devoid');
  const line = applyTypeLayer(base, withStaticTypes(obj, base.abilities, effects), changeling);
  return {
    types: line.types,
    subtypes: line.subtypes,
    colors: applyColorLayer(base.colors, effects, devoid),
  };
}

/**
 * The mana cost an object has, which is the printed one except for the back face of a nonmodal
 * double-faced permanent: its mana value is calculated from the front face's cost (CR 712.8e,
 * 202.3b), unless it is a copy of that back face, whose mana value is 0.
 */
export function manaCostOf(
  state: GameState,
  obj: GameObject,
  printed: readonly string[] | null,
): readonly string[] | null {
  if (obj.card === null || obj.token !== null) return printed;
  const back = backFaceManaCost(definitionOf(state, obj.card), obj);
  return back !== null && !isCopying(state, obj) ? back.manaCost : printed;
}

/**
 * What a filter that names no power or toughness reads of `obj`: types, supertypes, subtypes, colors and
 * mana value after layers 1, 4 and 5. Power and toughness are left out on purpose (they fail closed),
 * because this is what counting reads while layer 7 is being worked out (D-115).
 */
export function typeViewOf(state: GameState, obj: GameObject): FilterSubject {
  let perState = views.get(state);
  if (perState === undefined) {
    perState = new WeakMap();
    views.set(state, perState);
  }
  let view = perState.get(obj);
  if (view === undefined) {
    view = typeViewFresh(state, obj);
    perState.set(obj, view);
  }
  return view;
}

/**
 * Counting reads the same object's view once for every counted amount and every permanent a static ability is worked out for: it is
 * kept for the pair (state, object) by the identity of both, like `derive` (rules/derive.ts), so a new state or a new object asks again.
 */
const views = new WeakMap<GameState, WeakMap<GameObject, FilterSubject>>();

function typeViewFresh(state: GameState, obj: GameObject): FilterSubject {
  if (obj.card === null && obj.token === null && obj.copyOf === undefined) {
    return { types: [], supertypes: [], subtypes: [], colors: [] };
  }
  const { characteristics: c, abilities } = copiableValues(state, obj);
  const layers = typeLayersOf(
    state,
    obj,
    { types: c.types, subtypes: c.subtypes, colors: c.colors, supertypes: c.supertypes, abilities },
    effectsOn(state, obj.id),
  );
  return {
    types: layers.types,
    supertypes: c.supertypes,
    subtypes: layers.subtypes,
    colors: layers.colors,
    // Read only by a filter that compares mana value.
    get manaValue() {
      return manaValueOfCost(manaCostOf(state, obj, c.manaCost), obj);
    },
  };
}
