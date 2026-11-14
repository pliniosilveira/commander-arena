/**
 * Counting inside `derive` (D-115): the amount of a static ability ("Equipped creature gets +1/+1 for
 * each artifact you control", CR 611.3a: it follows the board) and of a characteristic-defining ability
 * ("~'s power and toughness are each equal to the number of cards in your hand", CR 604.3, 613.4a).
 *
 * The count is over the objects in the filter's zone (the battlefield unless it says otherwise) that
 * match it, read through `typeViewOf` (derive-view.ts): their types, subtypes, colors, controller, tapped
 * status and zone after layers 1, 4 and 5, and nothing of layer 7. That is the whole dependency rule here
 * (CR 613.8a: an effect depends on another when applying the other would change what it applies to or
 * what it does): an amount that counts creatures is a layer 7 effect and the effects that decide what is
 * a creature are in layer 4, which is applied first, so no count reads a result of layer 7 of any object,
 * its own included, and counting cannot loop. A count that read power or toughness would (a creature
 * counting creatures with power 3 or more while it sets its own power), and `validateCard` refuses a
 * filter with `power` or `toughness` here.
 *
 * It must not import `derive`: `derive` depends on this file.
 */
import type { Ability, DefinedPtAmount, ObjectFilter, StaticPtAmount } from '../ast/types';
import type { Color } from '../characteristics';
import { manaValue } from '../mana';
import { definitionOf, getSeat, objectsInZone } from '../state/ops';
import type { GameObject, GameState } from '../state/types';
import { chosenOf } from './chosen';
import { controllerOf } from './control';
import { typeViewOf } from './derive-view';
import { matchesFilterWith } from './filter-match';
import { hasLostAbilities } from './lost-abilities';

/**
 * How many objects in the filter's zone match it, for an ability whose source is `source`: "you" is
 * the controller of the source (the owner for a card outside the battlefield and the stack, CR 108.4,
 * 109.5) and "other" leaves out the source.
 */
export function countForSource(state: GameState, filter: ObjectFilter, source: GameObject): number {
  let byFilter = counts.get(state);
  if (byFilter === undefined) {
    byFilter = new WeakMap();
    counts.set(state, byFilter);
  }
  let bySource = byFilter.get(filter);
  if (bySource === undefined) {
    bySource = new WeakMap();
    byFilter.set(filter, bySource);
  }
  let count = bySource.get(source);
  if (count === undefined) {
    count = countFresh(state, filter, source);
    bySource.set(source, count);
  }
  return count;
}

/**
 * The same amount is read for every permanent a static ability is worked out for (and by every ability that counts the same thing), so
 * the count is kept for the triple (state, filter, source) by the identity of all three: a new state, or a filter or source object that is
 * not the same one, asks again, and a state is never changed in place.
 */
const counts = new WeakMap<GameState, WeakMap<ObjectFilter, WeakMap<GameObject, number>>>();

function countFresh(state: GameState, filter: ObjectFilter, source: GameObject): number {
  const zone = filter.zone ?? (filter.stackKind ? 'stack' : 'battlefield');
  const chosen = chosenOf(state, source.id);
  const ctx = {
    controller: controllerOf(state, source),
    source: source.id,
    ...(chosen === undefined ? {} : { sourceChosen: chosen }),
    // D-422: the Auras attached to a permanent, and the permanent an Aura is attached to, as layers 1, 4 and 5 leave them.
    describeOther: (other: GameObject) => typeViewOf(state, other),
  };
  let total = 0;
  for (const id of objectsInZone(state, zone)) {
    const obj = state.objects[id];
    if (
      obj !== undefined &&
      matchesFilterWith(state, obj, () => typeViewOf(state, obj), filter, ctx)
    ) {
      total += 1;
    }
  }
  return total;
}

/**
 * CR 105.2 (D-179): "the number of colors among permanents you control": how many of the five colors the objects the filter matches have between
 * them, each once; colorless is no color. Read through `typeViewOf` like a count, so it follows layers 1, 4 and 5 and nothing of layer 7.
 */
export function colorsAmongForSource(
  state: GameState,
  filter: ObjectFilter,
  source: GameObject,
): number {
  const zone = filter.zone ?? 'battlefield';
  const chosen = chosenOf(state, source.id);
  const ctx = {
    controller: controllerOf(state, source),
    source: source.id,
    ...(chosen === undefined ? {} : { sourceChosen: chosen }),
  };
  const seen = new Set<Color>();
  for (const id of objectsInZone(state, zone)) {
    const obj = state.objects[id];
    if (obj === undefined) continue;
    const view = typeViewOf(state, obj);
    if (!matchesFilterWith(state, obj, () => view, filter, ctx)) continue;
    for (const color of view.colors) seen.add(color);
  }
  return seen.size;
}

/**
 * CR 903.3, 202.3 (D-145): "the greatest mana value among your commanders": the printed mana value of each of the seat's commander cards
 * (the front face of a double-faced card, CR 712.8a, 202.3b), the largest of them; 0 with no commander. It reads the card, not the
 * permanent: no layer can change it, which keeps layer 7 free of loops (CR 613.8).
 */
export function commandersManaValue(state: GameState, seat: GameObject['controller']): number {
  let best = 0;
  for (const card of getSeat(state, seat).commanders) {
    const cost = definitionOf(state, card).faces[0]?.manaCost ?? null;
    if (cost !== null) best = Math.max(best, manaValue(cost));
  }
  return best;
}

/** CR 903.8 (D-229): the times the commanders of `seat` were cast from the command zone this game, all of them added. */
export function commandersCastCount(state: GameState, seat: GameObject['controller']): number {
  let total = 0;
  for (const card of getSeat(state, seat).commanders) total += state.commanderCasts[card] ?? 0;
  return total;
}

/** The number a static ability's or a characteristic-defining ability's amount stands for right now. */
export function staticAmountOf(
  state: GameState,
  amount: StaticPtAmount | DefinedPtAmount,
  source: GameObject,
  /** D-187: the permanent the effect is being applied to, for "for each time it has attacked this turn". */
  recipient: GameObject = source,
): number {
  if (typeof amount === 'number') return amount;
  // CR 508.1 (D-187): the times the permanent was declared as an attacker this turn.
  if (amount.kind === 'timesAttacked') {
    return state.turnLog.attacked.filter((id) => id === recipient.id).length;
  }
  if (amount.kind === 'commanderManaValue')
    return commandersManaValue(state, controllerOf(state, source));
  if (amount.kind === 'commanderCasts')
    return commandersCastCount(state, controllerOf(state, source));
  if (amount.kind === 'colorsAmong') return colorsAmongForSource(state, amount.filter, source);
  if (amount.kind === 'times')
    return amount.factor * countForSource(state, amount.of.filter, source);
  // D-131: "the number of Zombies on the battlefield plus the number of Zombie cards in all graveyards".
  if (amount.kind === 'sum') {
    return amount.of.reduce((n, part) => n + countForSource(state, part.filter, source), 0);
  }
  return countForSource(state, amount.filter, source);
}

/** What the characteristic-defining abilities of an object set: a number for each of power and toughness it defines. */
export interface DefinedPt {
  readonly power: number | null;
  readonly toughness: number | null;
}

/**
 * Layer 7a (CR 613.4a): the power and toughness the object's own characteristic-defining ability sets, or
 * null when it has none that works. It reads the object's copiable abilities (`abilities`: the printed
 * ones, or those a copy effect gave it, CR 604.3a, 707.2) in every zone (CR 604.3: they function
 * everywhere), and the object has none left once it lost all abilities (CR 613.1f, 604.3a: it is an
 * ability like any other). The count is from the object's own point of view: "you" is its controller, or
 * its owner outside the battlefield and the stack.
 */
export function characteristicPtOf(
  state: GameState,
  obj: GameObject,
  abilities: readonly Ability[],
): DefinedPt | null {
  let power: number | null = null;
  let toughness: number | null = null;
  let found = false;
  for (const a of abilities) {
    if (a.kind !== 'static' || a.static.kind !== 'characteristicPt') continue;
    if (!found && hasLostAbilities(state, obj.id)) return null;
    found = true;
    if (a.static.power !== undefined) power = staticAmountOf(state, a.static.power, obj);
    if (a.static.toughness !== undefined) {
      toughness = staticAmountOf(state, a.static.toughness, obj);
    }
  }
  return found ? { power, toughness } : null;
}
