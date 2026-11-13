/**
 * Derived characteristics (SPEC 4.2 "Derived characteristics", CR 613). Current power,
 * toughness, types, colors and abilities are never stored on an object. They are computed here
 * from base characteristics plus whatever modifies them, layer by layer (CR 613.1):
 *
 *   layer 1         the copiable values: the card's face or the token's characteristics, or what a
 *                   copy effect gave the object instead (`copiable.ts`, CR 613.2a, 707.2)
 *   layer 4, 5      "becomes a Frog", "becomes an artifact creature" (a crewed Vehicle), "becomes blue":
 *                   continuous effects (`derive-layers.ts`)
 *   layer 6         keyword expansions (`derive-keywords.ts`: Cycling, Equip, Prowess, Ward, Crew), then
 *                   keywords and mana abilities granted by static abilities of permanents
 *                   (`derive-statics.ts`, D-099) and keywords granted by effects, and "loses all
 *                   abilities", in timestamp order (CR 613.7)
 *   layer 7a        characteristic-defining power and toughness ("~'s power and toughness are each
 *                   equal to the number of cards in your hand", CR 604.3, 613.4a), in every zone
 *                   (`derive-count.ts`, D-115)
 *   layer 7b, 7c    "base power and toughness 1/1", then counters (CR 122.1b), "+N/+N" effects and
 *                   static abilities, whose counted amounts follow the board (CR 611.3a)
 *
 * Changeling and Devoid (CR 702.73a, 702.114a) are characteristic-defining abilities: layers 4 and 5 apply them
 * first (CR 613.3) from the printed abilities, in every zone (D-110); `derive-view.ts` holds layers 1, 4 and 5,
 * which counting reads without `derive` (D-115).
 *
 * What the static abilities of permanents match is read after layers 4 and 5, which come first.
 * Layer 1 (copy effects, CR 613.2a) is the base: `copiableValues` (rules/copiable.ts) gives the
 * printed values or what a `copy` effect replaced them with. Layer 2 (control, CR 613.1b) is not
 * a characteristic: `controllerOf` (rules/control.ts) derives who controls a permanent, before everything here and
 * without `derive`. Layer 3 (text) and 7d have nothing to apply yet, and neither does the dependency system (CR 613.8); see
 * docs/ROADMAP.md. Callers already go through this one
 * function, so adding them changes nothing outside the rules folder.
 */
import type { Ability, Restriction } from '../ast/types';
import type { CardType, Color, PtValue, Subtype, Supertype } from '../characteristics';
import type { ObjectId } from '../ids';
import type { ContinuousEffect, GameObject, GameState } from '../state/types';
import { copiableValues } from './copiable';
import { alternativeAbilitiesOf } from './derive-alt';
import { characteristicPtOf } from './derive-count';
import { expandKeywords, keywordKindsOf } from './derive-keywords';
import { applyAbilityLayer, applyPtLayers, basePtOf, effectsOn } from './derive-layers';
import { type BlockLimit, type StaticSet, staticEffectsOn } from './derive-statics';
import { manaCostOf, typeLayersOf } from './derive-view';
import { keywordCounterAbilities } from './keyword-counters';
import { hasLostAbilities } from './lost-abilities';
import { manaValueOfCost } from './mana-value';
import { isRingBearerOf } from './ring-bearer';

/** The characteristics and abilities `derive` computes, without the object's attachments. */
interface DerivedBase {
  readonly name: string;
  readonly manaCost: readonly string[] | null;
  readonly supertypes: readonly Supertype[];
  readonly types: readonly CardType[];
  readonly subtypes: readonly Subtype[];
  readonly colors: readonly Color[];
  readonly power: number | null;
  readonly toughness: number | null;
  readonly loyalty: number | null;
  readonly abilities: readonly Ability[];
}

export interface Derived extends DerivedBase {
  /**
   * What the object can't do or must do as the rules read it (D-094, CR 613.11): from its own and
   * other permanents' static abilities and from `restrict` effects. Read where the rule acts.
   */
  readonly restrictions: readonly Restriction[];
  /** The creatures this one can't be blocked by, from static abilities (CR 509.1b, D-139). Read where blockers are declared. */
  readonly blockLimits: readonly BlockLimit[];
  /**
   * The base power and toughness (CR 208.4b, D-1261): the values after characteristic-defining abilities and the effects that set them (layer 7b), ignoring counters and
   * the effects that only modify them (layer 7c). Null for an object with no power or toughness.
   */
  readonly basePower: number | null;
  readonly baseToughness: number | null;
  /** Auras and Equipment on the battlefield attached to this permanent (CR 301.5a, 303.4b). */
  readonly attachments: readonly ObjectId[];
  /** The permanent this Aura or Equipment is attached to, while that is still on the battlefield. */
  readonly attachedTo: ObjectId | null;
}

/**
 * A printed number, null for an object with none. A printed "*" is defined by a characteristic-defining
 * ability, which layer 7a applies (`characteristicPtOf`, CR 604.3, 208.2a): until it does the star is 0, which is
 * what it stays for a creature that lost the ability (CR 613.1f; `validateCard` allows a star only with
 * the ability printed, so no other card has one).
 */
function ptNumber(value: PtValue | null): number | null {
  return value === '*' ? 0 : value;
}

/**
 * `derive` is a pure function of its two arguments, and neither is ever changed in place (every change of the game makes a new
 * state, `state/ops.ts`; an object that changes is a new object), while one state is asked about the same object many times: the
 * legal actions of a priority decision derive every permanent once for each ability, each mana source, each cost. The answer is
 * kept for the pair, by the identity of both: a new state, or the same object in another state, is a new key, so nothing can go
 * stale and the cache holds nothing the pair does not determine. The result is read-only (`Derived` is readonly all through) and
 * is shared by the callers.
 */
const derived = new WeakMap<GameState, WeakMap<GameObject, Derived>>();

export function derive(state: GameState, obj: GameObject): Derived {
  let perState = derived.get(state);
  if (perState === undefined) {
    perState = new WeakMap();
    derived.set(state, perState);
  }
  let hit = perState.get(obj);
  if (hit === undefined) {
    hit = deriveFresh(state, obj);
    perState.set(obj, hit);
  }
  return hit;
}

function deriveFresh(state: GameState, obj: GameObject): Derived {
  if (obj.card === null && obj.token === null && obj.copyOf === undefined) {
    // Abilities on the stack are not cards; they carry no characteristics here. A copy of a spell is a spell
    // with the values of the face it copies (CR 707.10, D-129), read by `copiableValues`.
    return finish(state, obj, {
      name: '',
      manaCost: null,
      supertypes: [],
      types: [],
      subtypes: [],
      colors: [],
      power: null,
      toughness: null,
      loyalty: null,
      abilities: [],
    });
  }
  // Layer 1 (CR 613.2a): the copiable values, which a copy effect replaces (rules/copiable.ts).
  const { characteristics: c, abilities } = copiableValues(state, obj);
  return finish(state, obj, {
    name: c.name,
    manaCost: manaCostOf(state, obj, c.manaCost),
    supertypes: c.supertypes,
    types: c.types,
    subtypes: c.subtypes,
    colors: c.colors,
    power: ptNumber(c.power),
    toughness: ptNumber(c.toughness),
    loyalty: c.loyalty,
    abilities,
  });
}

/** The continuous effects on `obj` with the base power and toughness its permanents' static abilities set (layer 7b), by timestamp. */
function withStaticSets(
  obj: GameObject,
  effects: readonly ContinuousEffect[],
  sets: readonly StaticSet[],
): readonly ContinuousEffect[] {
  if (sets.length === 0) return effects;
  const own: ContinuousEffect[] = sets.map((s, i) => ({
    id: `static:${obj.id}:setPt:${i}`,
    timestamp: s.timestamp,
    objects: [obj.id],
    until: 'permanent',
    change: { kind: 'setPt', power: s.power, toughness: s.toughness },
  }));
  return [...effects, ...own].sort((a, b) => a.timestamp - b.timestamp);
}

function finish(state: GameState, obj: GameObject, base: DerivedBase): Derived {
  // CR 701.54c (D-196): "Your Ring-bearer is legendary", an ability of the Ring (an emblem): a supertype added in layer 4, which no
  // creature's loss of abilities removes.
  const input: DerivedBase =
    obj.ringBearer !== undefined &&
    !base.supertypes.includes('legendary') &&
    isRingBearerOf(state, obj, obj.ringBearer)
      ? { ...base, supertypes: [...base.supertypes, 'legendary'] }
      : base;
  const effects = effectsOn(state, obj.id);
  // Layers 4 and 5 (CR 613.1d, 613.1e). They come first because what static abilities affect is
  // matched against their result (a lord of Frogs affects a creature that became a Frog).
  // Changeling and Devoid (CR 702.73a, 702.114a) are characteristic-defining abilities that work in every
  // zone, so `derive` reads them from the printed (copiable) abilities of an object wherever it is.
  const line = typeLayersOf(state, obj, input, effects);
  const colors = line.colors;
  // CR 208.3: a noncreature permanent has no power or toughness, even with some printed on its card.
  const creature = obj.zone !== 'battlefield' || line.types.includes('creature');
  const counters = (obj.counters['+1/+1'] ?? 0) - (obj.counters['-1/-1'] ?? 0);
  // Layer 7a (CR 613.4a, 604.3): a characteristic-defining ability sets what it defines, wherever the
  // object is. Counting reads the types as layer 4 leaves them, never a power or toughness.
  const defined = characteristicPtOf(state, obj, input.abilities);
  const ptBase = !creature
    ? { power: null, toughness: null }
    : defined === null
      ? input
      : {
          power: defined.power ?? input.power,
          toughness: defined.toughness ?? input.toughness,
        };
  // Layer 7b of static abilities (D-139): "base power and toughness 5/3" is a `setPt` with its permanent's timestamp, in order with the
  // ones resolved spells made (CR 613.7).
  const ptWith = (power: number, toughness: number, sets: readonly StaticSet[] = []) =>
    applyPtLayers(ptBase, withStaticSets(obj, effects, sets), counters, power, toughness);
  // Layer 6 (CR 613.1f) starts from the printed abilities and the expansions of their keywords,
  // which are appended, so every ability keeps the index it had (triggers and activations refer
  // to indexes). Grants and "loses all abilities" follow in timestamp order.
  // The abilities of an evoked permanent (D-121) are appended too, and "loses all abilities" removes them.
  const printed = expandKeywords(input.abilities);
  const own = alternativeAbilitiesOf(state, obj);
  // CR 122.1b (D-1260): the keywords of the object's keyword counters, after everything it has printed.
  const start = keywordCounterAbilities(
    obj.counters,
    own.length === 0 ? printed : [...printed, ...own],
  );
  const fx = staticEffectsOn(state, obj, {
    ...input,
    types: line.types,
    subtypes: line.subtypes,
    colors,
    // Read only by a static ability that compares mana value: not worked out for every `derive`.
    get manaValue() {
      return manaValueOfCost(input.manaCost, obj);
    },
    // D-149: read only by a static ability whose subject names a keyword, with the grants it depends on.
    keywordsWith: (grants) => keywordKindsOf(applyAbilityLayer(start, grants, effects)),
    ptWith,
  });
  const abilities = applyAbilityLayer(start, fx.grants, effects);
  // CR 208.4b (D-1261): the base power and toughness are what layer 7b leaves, before any counter or "+N/+N" effect of layer 7c.
  const baseValues = basePtOf(ptBase, withStaticSets(obj, effects, fx.sets));
  const typed: Derived = {
    ...input,
    basePower: baseValues.power,
    baseToughness: baseValues.toughness,
    types: line.types,
    subtypes: line.subtypes,
    colors,
    abilities,
    restrictions: restrictionsOf(state, obj, input.abilities, fx.restrictions, effects),
    blockLimits: fx.blockLimits,
    attachments: fx.attachments,
    attachedTo: fx.attachedTo,
  };
  // Layers 7b and 7c (CR 613.4b, 613.4c).
  const pt = ptWith(fx.power, fx.toughness, fx.sets);
  if (pt.power === typed.power && pt.toughness === typed.toughness) return typed;
  return { ...typed, power: pt.power, toughness: pt.toughness };
}

/**
 * CR 613.11: the restrictions are applied after every layer, so what an object lost in layer 6 does
 * not matter to a `restrict` effect; a static ability's restriction is gone with the ability (its
 * permanent's `hasLostAbilities`, read where the index is built). A spell on the stack has no
 * permanent to index, so the `this` restrictions of its own abilities are read here (CR 113.6g:
 * "can't be countered" functions on the stack).
 */
function restrictionsOf(
  state: GameState,
  obj: GameObject,
  printed: readonly Ability[],
  fromStatics: readonly Restriction[],
  effects: readonly ContinuousEffect[],
): readonly Restriction[] {
  let own = fromStatics;
  if (
    obj.zone === 'stack' &&
    (obj.card !== null || obj.copyOf !== undefined) &&
    !hasLostAbilities(state, obj.id)
  ) {
    for (const a of printed) {
      if (
        a.kind === 'static' &&
        a.static.kind === 'restriction' &&
        a.static.subject.kind === 'this'
      ) {
        if (!own.includes(a.static.restriction)) own = [...own, a.static.restriction];
      }
    }
  }
  let out = own;
  for (const e of effects) {
    if (e.change.kind === 'restrict' && !out.includes(e.change.restriction)) {
      out = [...out, e.change.restriction];
    }
  }
  return out;
}

/** The rules text of an object: the face up, or the token's own, or what a copy effect copied. */
export function oracleTextOf(state: GameState, obj: GameObject): string {
  return copiableValues(state, obj).characteristics.oracleText;
}
