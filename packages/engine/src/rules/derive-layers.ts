/**
 * The layers of CR 613 that continuous effects from resolved spells and abilities
 * (`GameState.continuousEffects`) take part in, as `derive` applies them to one object. Each
 * function is one layer; `derive.ts` calls them in the order of CR 613.1 and passes what the
 * static abilities of permanents (`derive-statics.ts`) add in the same layer.
 *
 *   layer 4 (CR 613.1d)  types and subtypes        `applyTypeLayer`
 *   layer 5 (CR 613.1e)  colors                    `applyColorLayer`
 *   layer 6 (CR 613.1f)  abilities                 `applyAbilityLayer`
 *   layer 7b (CR 613.4b) set power and toughness   `applyPtLayers`
 *   layer 7c (CR 613.4c) counters and +N/+N        `applyPtLayers`
 *
 * Within a layer the effects apply in timestamp order (CR 613.7): the list is kept in the order
 * the effects were created (CR 613.7b) and a permanent's own static abilities carry the timestamp
 * of their permanent (CR 613.7a), so layer 6 merges the two by number. Dependencies (CR 613.8) are
 * not modelled: no supported effect depends on another, and `docs/ROADMAP.md` lists the gap. Layers
 * 1 (copy effects), 2 (control) and 3 (text) have no effect to apply here (layer 1 is `copiable.ts`, layer 2 `control.ts`, 7a
 * is `derive-count.ts`), and neither has layer 7d (switching).
 *
 * `derive` recomputes every object from its base characteristics each time (CR 613.1, 613.5), so an
 * effect that ends simply stops being in the list and nothing needs undoing.
 */
import type { Ability } from '../ast/types';
import { type CardType, type Color, isNonCreatureSubtype, type Subtype } from '../characteristics';
import { CREATURE_TYPES } from '../data/creature-types';
import type { ContinuousChange, ContinuousEffect } from '../state/types';
import { expansionOf } from './derive-keywords';
import { effectsOn } from './effects-on';

export { effectsOn };

/** The change kinds of one layer, narrowed so a layer function only sees its own. */
type ChangeOf<K extends ContinuousChange['kind']> = Extract<ContinuousChange, { kind: K }>;
type EffectOf<K extends ContinuousChange['kind']> = ContinuousEffect & { change: ChangeOf<K> };

const NO_COLORS: readonly Color[] = [];

function ofKind<K extends ContinuousChange['kind']>(
  effects: readonly ContinuousEffect[],
  kind: K,
): EffectOf<K>[] {
  return effects.filter((e): e is EffectOf<K> => e.change.kind === kind);
}

// ---- Layer 4 (CR 613.1d)

export interface TypeLine {
  readonly types: readonly CardType[];
  readonly subtypes: readonly Subtype[];
}

/**
 * Layer 4 (CR 613.1d): "becomes a [type]" effects, in timestamp order.
 * - New card types replace the old ones, except that an instant or sorcery stays one (CR 205.1a).
 * - New subtypes replace the creature types and keep the others (CR 205.1a, 205.3d).
 * - A card type that is gone takes its correlated subtypes with it (CR 205.1a): without creature or
 *   kindred, no creature type stays.
 * - An `additive` effect ("becomes an artifact creature", "in addition to its other types", CR
 *   205.1b) replaces nothing: it adds its card types and subtypes to everything the object has. A
 *   Vehicle that is crewed is the case (CR 702.122a); it keeps the Vehicle subtype and its artifact
 *   type, and is a creature until the effect ends.
 */
export function applyTypeLayer(
  base: TypeLine,
  effects: readonly ContinuousEffect[],
  changeling = false,
): TypeLine {
  let { types, subtypes } = base;
  // CR 702.73a, 613.3: Changeling is a characteristic-defining ability, applied first in its layer: the
  // object is every creature type. A subtype list holds creature types only for a creature or a kindred
  // object (CR 205.3d), so it adds them to nothing else.
  if (changeling && (types.includes('creature') || types.includes('kindred'))) {
    subtypes = [...new Set([...subtypes, ...CREATURE_TYPES])];
  }
  for (const e of ofKind(effects, 'setTypes')) {
    if (e.change.remove !== undefined) {
      // CR 205.1a (D-229): a card type is removed; the subtypes of that type go unless another type the object has still allows them.
      const gone = e.change.remove;
      types = types.filter((t) => !gone.includes(t));
      if (!types.includes('creature') && !types.includes('kindred')) {
        subtypes = subtypes.filter(isNonCreatureSubtype);
      }
      continue;
    }
    if (e.change.additive === true) {
      if (e.change.types !== undefined) types = [...new Set([...types, ...e.change.types])];
      if (e.change.subtypes !== undefined) {
        subtypes = [...new Set([...subtypes, ...e.change.subtypes])];
      }
      continue;
    }
    if (e.change.types !== undefined) {
      const kept = types.filter((t) => t === 'instant' || t === 'sorcery');
      types = [...new Set([...kept, ...e.change.types])];
    }
    if (e.change.subtypes !== undefined) {
      subtypes = [...new Set([...subtypes.filter(isNonCreatureSubtype), ...e.change.subtypes])];
    }
    if (!types.includes('creature') && !types.includes('kindred')) {
      subtypes = subtypes.filter(isNonCreatureSubtype);
    }
  }
  return types === base.types && subtypes === base.subtypes ? base : { types, subtypes };
}

// ---- Layer 5 (CR 613.1e)

/**
 * Layer 5: "becomes [color]" effects replace the colors (CR 105.3); the last one wins. Devoid (CR 702.114a)
 * is a characteristic-defining ability, applied first in its layer (CR 613.3): the object is colorless
 * before any effect gives it a color.
 */
export function applyColorLayer(
  base: readonly Color[],
  effects: readonly ContinuousEffect[],
  devoid = false,
): readonly Color[] {
  let colors: readonly Color[] = devoid ? NO_COLORS : base;
  for (const e of ofKind(effects, 'setColors')) colors = [...new Set(e.change.colors)];
  return colors;
}

// ---- Layer 6 (CR 613.1f)

/**
 * An ability granted by a static ability of a permanent (a keyword, D-099: a mana ability), with the
 * timestamp of that permanent.
 */
export interface StaticGrant {
  /** The ability given, or null for "loses all abilities" (D-145): it removes what the object has at that timestamp. */
  readonly ability: Ability | null;
  readonly timestamp: number;
}

/**
 * Whether the list already has what a grant would add: the same keyword (only keywords without
 * parameters are granted, so the kind identifies them; protection is the exception, D-376, below),
 * or a mana ability written the same way (a land given "{T}: Add one mana of any color" twice has it
 * once, which changes nothing in play).
 */
function hasAbility(list: readonly Ability[], grant: Ability): boolean {
  if (grant.kind === 'keyword') {
    // CR 702.16g, 702.16m (D-376): protection from different qualities are separate abilities ("protection from red" and "protection from artifacts"
    // are two), and only the same quality twice is redundant: a protection is the same as another when it names the same thing.
    if (grant.keyword.kind === 'protection') {
      const written = JSON.stringify(grant.keyword);
      return list.some((a) => a.kind === 'keyword' && JSON.stringify(a.keyword) === written);
    }
    return list.some((a) => a.kind === 'keyword' && a.keyword.kind === grant.keyword.kind);
  }
  // D-151: an activated or a triggered ability is given by each source that grants it (two sources, two instances).
  if (grant.kind !== 'mana') return false;
  const written = JSON.stringify(grant);
  return list.some((a) => a.kind === 'mana' && JSON.stringify(a) === written);
}

/** The keywords whose instances each count (CR 702.83b: exalted, CR 702.108b: prowess) and so are not added once only. */
const INSTANCE_KEYWORDS: readonly (string | null)[] = ['exalted', 'prowess'];

function keywordKindOf(ability: Ability): string | null {
  return ability.kind === 'keyword' ? ability.keyword.kind : null;
}

/**
 * Layer 6 (CR 613.1f, 613.7): starting from the abilities the object has printed (with the
 * expansions of its keywords), the keyword grants of static abilities and of continuous effects
 * and the "loses all abilities" effects apply in timestamp order. "Loses all abilities" removes
 * what the object has at that timestamp, granted abilities included; an ability granted later
 * still applies (CR 613.7). A keyword or mana ability the object already has is not added twice.
 * A static ability grants a keyword or, D-099, a mana ability ("Lands you control have ...").
 */
export function applyAbilityLayer(
  printed: readonly Ability[],
  grants: readonly StaticGrant[],
  effects: readonly ContinuousEffect[],
): readonly Ability[] {
  type Step = { readonly timestamp: number; readonly grant: Ability | null };
  const steps: Step[] = grants.map((g) => ({ timestamp: g.timestamp, grant: g.ability }));
  for (const e of effects) {
    if (e.change.kind === 'grantKeyword') {
      steps.push({
        timestamp: e.timestamp,
        grant: { kind: 'keyword', keyword: e.change.keyword },
      });
    } else if (e.change.kind === 'grantAbility') {
      steps.push({ timestamp: e.timestamp, grant: e.change.ability });
    } else if (e.change.kind === 'loseAllAbilities') {
      steps.push({ timestamp: e.timestamp, grant: null });
    }
  }
  if (steps.length === 0) return printed;
  // `sort` is stable, so grants with one timestamp (one permanent) keep their written order.
  steps.sort((a, b) => a.timestamp - b.timestamp);
  let abilities = printed;
  for (const step of steps) {
    if (step.grant === null) abilities = [];
    else if (INSTANCE_KEYWORDS.includes(keywordKindOf(step.grant))) {
      // CR 702.83b, 702.108b (D-149): every instance of exalted or prowess is its own triggered ability, so each grant adds one,
      // whatever the object already has, and the triggered ability the keyword stands for with it.
      abilities = [...abilities, step.grant, ...expansionOf(step.grant)];
    } else if (!hasAbility(abilities, step.grant)) abilities = [...abilities, step.grant];
  }
  return abilities;
}

// ---- Layer 7 (CR 613.4)

/**
 * The base power and toughness of a creature (CR 208.4b, 613.4b): what its printed or characteristic-defining values are after the effects that set
 * them (layer 7b, the last by timestamp wins), before any counter or "+N/+N" effect (layer 7c). "A creature with power greater than its base power"
 * compares the power `applyPtLayers` gives with this.
 */
export function basePtOf(
  base: { readonly power: number | null; readonly toughness: number | null },
  effects: readonly ContinuousEffect[],
): { readonly power: number | null; readonly toughness: number | null } {
  let power = base.power;
  let toughness = base.toughness;
  for (const e of ofKind(effects, 'setPt')) {
    power = e.change.power;
    toughness = e.change.toughness;
  }
  return { power, toughness };
}

/**
 * Layers 7b and 7c (CR 613.4b, 613.4c). Effects that set power and toughness apply first, in
 * timestamp order, and the last one wins; they apply even to an object with no power and toughness
 * yet (CR 208.3a). Then everything that modifies them is added: counters (CR 122.1b),
 * `modifyPt` effects and the static "+N/+N" of permanents (`staticPower`, `staticToughness`).
 * Addition commutes, so the timestamp order inside layer 7c does not change the sum. An object
 * with no power or toughness after layer 7b has none (CR 208.3).
 */
export function applyPtLayers(
  base: { readonly power: number | null; readonly toughness: number | null },
  effects: readonly ContinuousEffect[],
  counterBonus: number,
  staticPower: number,
  staticToughness: number,
): { readonly power: number | null; readonly toughness: number | null } {
  const { power, toughness } = basePtOf(base, effects);
  if (power === null || toughness === null) return { power, toughness };
  let addPower = counterBonus + staticPower;
  let addToughness = counterBonus + staticToughness;
  for (const e of ofKind(effects, 'modifyPt')) {
    addPower += e.change.power;
    addToughness += e.change.toughness;
  }
  return { power: power + addPower, toughness: toughness + addToughness };
}
