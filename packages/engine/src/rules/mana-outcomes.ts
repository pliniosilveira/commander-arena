/**
 * What a mana ability can make (CR 106, 605.3b): each outcome is a list of mana the player may pick
 * as the ability resolves. A fixed ability has one, a choice of color one per color, a combination
 * ("Add {R}{R}, {R}{W}, or {W}{W}") one per combination, and a "could produce" ability (CR 106.7, D-099)
 * one per type of mana that the permanents it looks at could produce.
 *
 * CR 106.7: "The type of mana a permanent could produce at any time includes any type of mana that an
 * ability of that permanent would produce if the ability were to resolve at that time ... Ignore
 * whether any costs of the ability could or could not be paid." So the tapped state, summoning
 * sickness, a mana cost, a life cost and a restriction on activating (`activateOnlyIf`) of the
 * abilities it looks at do not matter, only what they would make. An ability that looks at other
 * permanents' "could produce" is itself looked at in turn (the example of CR 106.7: an Exotic Orchard
 * that faces a Forest and another Orchard makes {G}, and so does the other Orchard), so the types are
 * the least fixed point of that relation: the types only abilities that name a type make, and what
 * flows from them through "could produce" abilities. Two Orchards with nothing else make nothing.
 * Replacement effects of mana (CR 106.7 "in any possible order") change no mana in this engine.
 */
import type { ManaAbility, ManaProduction } from '../ast/types';
import { COLORS } from '../characteristics';
import type { ObjectId } from '../ids';
import type { ManaColor, ManaRestriction, ManaRider } from '../mana/types';
import type { GameObject, GameState } from '../state/types';
import { commanderIdentity } from './commander-identity';
import { evaluateCondition } from './conditions';
import { controllerOf } from './control';
import { derive } from './derive';
import { matchesFilter } from './select';

/** The mana types in the order a player is shown them: the five colors, then colorless (CR 106.1b). */
const TYPE_ORDER: readonly ManaColor[] = ['W', 'U', 'B', 'R', 'G', 'C'];

const inTypeOrder = (types: Iterable<ManaColor>): ManaColor[] => {
  const set = new Set(types);
  return TYPE_ORDER.filter((t) => set.has(t));
};

/** A combination in the order of `TYPE_ORDER`, so that two that differ only in order are equal. */
export function canonicalCombination(mana: readonly ManaColor[]): ManaColor[] {
  return [...mana].sort((a, b) => TYPE_ORDER.indexOf(a) - TYPE_ORDER.indexOf(b));
}

/** Whether two lists of mana are the same mana in any order (CR 106.4: the pool does not order it). */
export function sameCombination(a: readonly ManaColor[], b: readonly ManaColor[]): boolean {
  return (
    a.length === b.length && canonicalCombination(a).join('') === canonicalCombination(b).join('')
  );
}

/**
 * What "Spend this mana only to cast an Angel spell" makes of the mana the ability adds (CR 106.6, D-149): a restriction the payment
 * planner and the pool read; null when the ability has none.
 */
export function spendRestrictionOf(ability: ManaAbility): ManaRestriction | null {
  const only = ability.spendOnly;
  if (only === undefined) return null;
  return {
    kind: 'spellMatch',
    ...(only.types === undefined ? {} : { types: [...only.types] }),
    ...(only.subtypes === undefined ? {} : { subtypes: [...only.subtypes] }),
    ...(only.alsoAbilities === true ? { alsoAbilities: true as const } : {}),
  };
}

/** What the mana the ability adds does when it is spent (D-151: "If that mana is spent on a Dragon creature spell, it gains haste"); null when nothing. */
export function spentRiderOf(ability: ManaAbility, source: ObjectId): ManaRider | null {
  const rider = ability.spentRider;
  if (rider === undefined) return null;
  const grants = rider.grants;
  const byCommander = typeof grants === 'object' && 'scryCommanderCasts' in grants;
  const scry = grants === 'haste' || byCommander ? null : (grants as { scry: number }).scry;
  return {
    kind: grants === 'haste' ? 'haste' : 'scry',
    ...(byCommander ? { countCommanderCasts: true as const, source } : {}),
    ...(scry === null ? {} : { count: scry, source }),
    ...(rider.spells.commander === true ? { commander: true as const } : {}),
    ...(rider.spells.sharesTypeWithCommander === true
      ? { sharesTypeWithCommander: true as const }
      : {}),
    ...(rider.spells.types === undefined ? {} : { types: [...rider.spells.types] }),
    ...(rider.spells.subtypes === undefined ? {} : { subtypes: [...rider.spells.subtypes] }),
  };
}

/** Whether the production is chosen as a combination of mana (a filter land, "any combination of colors"): the activation names the mana (D-099, D-151). */
export function isCombinationProduction(production: ManaProduction): boolean {
  return production.kind === 'combination' || production.kind === 'anyCombination';
}

/** Every way to choose `count` mana of the five colors, each as a combination in `TYPE_ORDER` (D-151). */
function colorMultisets(count: number): ManaColor[][] {
  const colors = COLORS as readonly ManaColor[];
  const out: ManaColor[][] = [];
  const build = (from: number, picked: ManaColor[]): void => {
    if (picked.length === count) {
      out.push([...picked]);
      return;
    }
    for (let i = from; i < colors.length; i += 1) {
      picked.push(colors[i] as ManaColor);
      build(i, picked);
      picked.pop();
    }
  };
  build(0, []);
  return out.map((o) => canonicalCombination(o));
}

/** The outcomes of every production that does not look at other permanents. */
function plainOutcomes(
  state: GameState,
  obj: GameObject,
  p: Exclude<ManaProduction, { kind: 'couldProduce' }>,
): ManaColor[][] {
  const seat = controllerOf(state, obj);
  switch (p.kind) {
    case 'chosenColor': {
      // D-149: "Add one mana of the chosen color": the color its permanent chose as it entered (CR 614.12, 607.2d); none chosen, none made.
      const color = obj.chosen?.color;
      return color === undefined ? [[]] : [[color]];
    }
    case 'fixed':
      return [[...p.mana]];
    case 'anyCombination':
      // D-151: "two mana in any combination of colors": every multiset of `count` of the five colors.
      return colorMultisets(p.count);
    case 'anyColor':
      // D-145: "two mana of any one color": `count` mana of the one color chosen.
      return COLORS.map((c) => Array.from({ length: p.count ?? 1 }, () => c));
    case 'oneOf':
      return [...new Set(p.colors)].map((c) => [c]);
    case 'combination': {
      const seen = new Set<string>();
      const out: ManaColor[][] = [];
      for (const option of p.options) {
        const canonical = canonicalCombination(option);
        const key = canonical.join('');
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(canonical);
      }
      return out;
    }
    case 'commanderIdentity': {
      const identity = commanderIdentity(state, seat);
      return identity.length === 0 ? [[]] : identity.map((c) => [c]);
    }
    default: {
      const unreachable: never = p;
      return unreachable;
    }
  }
}

type CouldProduce = Extract<ManaProduction, { kind: 'couldProduce' }>;

interface Entry {
  readonly abilities: readonly {
    readonly looksAt: readonly ObjectId[];
    readonly anyType: boolean;
  }[];
  readonly types: Set<ManaColor>;
}

/**
 * What the ability makes now (D-145): with `instead`, "If you control a creature with power 4 or greater, add two mana of any one color
 * instead" makes the other production while the condition holds (CR 608.2c), read for the permanent's controller with the permanent
 * as "this". The ability that is returned has that production and no `instead`.
 */
export function effectiveManaAbility(
  state: GameState,
  obj: GameObject,
  ability: ManaAbility,
): ManaAbility {
  const instead = ability.instead;
  if (instead === undefined) return ability;
  const { instead: _used, ...plain } = ability;
  const holds = evaluateCondition(state, instead.condition, {
    controller: controllerOf(state, obj),
    source: obj.id,
  });
  return holds ? { ...plain, production: instead.production } : plain;
}

function manaAbilities(state: GameState, obj: GameObject): ManaAbility[] {
  return derive(state, obj).abilities.flatMap((a) =>
    a.kind === 'mana' ? [effectiveManaAbility(state, obj, a)] : [],
  );
}

/** The permanents on the battlefield that a "could produce" ability of `source` looks at. */
function looksAt(state: GameState, source: GameObject, p: CouldProduce): ObjectId[] {
  const filter = { ...p.lands, zone: 'battlefield' as const };
  const ctx = { controller: controllerOf(state, source), source: source.id };
  return state.battlefield.filter((id) => {
    const obj = state.objects[id];
    return obj !== undefined && matchesFilter(state, obj, filter, ctx);
  });
}

/**
 * The types of mana each permanent on the battlefield could produce (CR 106.7), as described in the
 * header: the least fixed point over the "could produce" abilities. Only permanents that have such an
 * ability, or are looked at by one, are worth the work, so the map is built from every permanent but
 * the caller asks only when some ability needs it.
 */
function computeTypes(state: GameState): ReadonlyMap<ObjectId, ReadonlySet<ManaColor>> {
  const entries = new Map<ObjectId, Entry>();
  for (const id of state.battlefield) {
    const obj = state.objects[id];
    if (obj === undefined) continue;
    const types = new Set<ManaColor>();
    const abilities: { looksAt: readonly ObjectId[]; anyType: boolean }[] = [];
    for (const a of manaAbilities(state, obj)) {
      if (a.production.kind === 'couldProduce') {
        abilities.push({
          looksAt: looksAt(state, obj, a.production),
          anyType: a.production.anyType === true,
        });
      } else {
        for (const outcome of plainOutcomes(state, obj, a.production)) {
          for (const m of outcome) types.add(m);
        }
      }
    }
    entries.set(id, { abilities, types });
  }
  // Each round adds to the sets and nothing is removed, so it ends after at most six types times
  // the number of permanents that look at others.
  let changed = true;
  while (changed) {
    changed = false;
    for (const entry of entries.values()) {
      for (const ability of entry.abilities) {
        for (const id of ability.looksAt) {
          for (const t of entries.get(id)?.types ?? []) {
            if ((t === 'C' && !ability.anyType) || entry.types.has(t)) continue;
            entry.types.add(t);
            changed = true;
          }
        }
      }
    }
  }
  return new Map([...entries].map(([id, e]) => [id, e.types]));
}

interface Cached {
  readonly battlefield: GameState['battlefield'];
  readonly definitions: GameState['definitions'];
  readonly effects: GameState['continuousEffects'];
  readonly types: ReadonlyMap<ObjectId, ReadonlySet<ManaColor>>;
}

const cache = new WeakMap<object, Cached>();

/**
 * Like `computeTypes`, kept for as long as the objects, the battlefield, the card definitions and the
 * continuous effects are the same (it holds nothing else of `state`), because a priority decision asks
 * for it once per "could produce" ability.
 */
export function couldProduceTypes(state: GameState): ReadonlyMap<ObjectId, ReadonlySet<ManaColor>> {
  const hit = cache.get(state.objects);
  if (
    hit !== undefined &&
    hit.battlefield === state.battlefield &&
    hit.definitions === state.definitions &&
    hit.effects === state.continuousEffects
  ) {
    return hit.types;
  }
  const types = computeTypes(state);
  cache.set(state.objects, {
    battlefield: state.battlefield,
    definitions: state.definitions,
    effects: state.continuousEffects,
    types,
  });
  return types;
}

/**
 * One mana of any type (or color) that the permanents `p.lands` names could produce when this ability
 * of `source` resolves (CR 106.7): one outcome per type, in the order W, U, B, R, G, C. "Any color"
 * leaves colorless out (CR 106.1a, 106.1b). No outcome when no such type exists: the ability makes
 * no mana.
 */
function couldProduceOutcomes(
  state: GameState,
  source: GameObject,
  p: CouldProduce,
): ManaColor[][] {
  const types = couldProduceTypes(state);
  const found = new Set<ManaColor>();
  for (const id of looksAt(state, source, p)) {
    for (const t of types.get(id) ?? []) found.add(t);
  }
  if (p.anyType !== true) found.delete('C');
  return inTypeOrder(found).map((t) => [t]);
}

/**
 * Each possible outcome of a mana ability of `obj`: a list of mana. The color or combination the
 * player picks is one of them. An empty list of outcomes means the ability makes nothing now; an
 * outcome with no mana (the commander's identity with no commander, CR 903.4f) makes none either.
 */
export function productionOutcomes(
  state: GameState,
  obj: GameObject,
  ability: ManaAbility,
): ManaColor[][] {
  const p = effectiveManaAbility(state, obj, ability).production;
  if (p.kind === 'couldProduce') return couldProduceOutcomes(state, obj, p);
  return plainOutcomes(state, obj, p);
}
