/**
 * "Activated abilities of sources with the chosen name can't be activated." (the static `cantActivateChosenName`, CR 602.5, 605.1a, 607.2d): the names the permanents on the battlefield
 * that have that static ability chose as they entered. A permanent that lost all its abilities (CR 613.1f) locks nothing. The scan is kept for as long as the objects, the battlefield, the
 * card definitions and the continuous effects are the same, as `lost-abilities.ts` keeps its own.
 */
import type { GameObject, GameState } from '../state/types';
import { copiableValues } from './copiable';
import { derive } from './derive';
import { isFaceDown } from './face-down';
import { hasLostAbilities } from './lost-abilities';

interface Cached {
  readonly battlefield: GameState['battlefield'];
  readonly definitions: GameState['definitions'];
  readonly effects: GameState['continuousEffects'];
  readonly names: ReadonlySet<string>;
}

const NONE: ReadonlySet<string> = new Set();
const cache = new WeakMap<object, Cached>();

function scan(state: GameState): ReadonlySet<string> {
  let names: Set<string> | null = null;
  for (const id of state.battlefield) {
    const obj = state.objects[id];
    const chosen = obj?.chosen?.cardName;
    if (obj === undefined || chosen === undefined || hasLostAbilities(state, id)) continue;
    const locks = copiableValues(state, obj).abilities.some(
      (a) => a.kind === 'static' && a.static.kind === 'cantActivateChosenName',
    );
    if (!locks) continue;
    names ??= new Set();
    names.add(chosen);
  }
  return names ?? NONE;
}

/** The card names no activated ability of an object with that name can be activated for. */
export function lockedNames(state: GameState): ReadonlySet<string> {
  const hit = cache.get(state.objects);
  if (
    hit !== undefined &&
    hit.battlefield === state.battlefield &&
    hit.definitions === state.definitions &&
    hit.effects === state.continuousEffects
  ) {
    return hit.names;
  }
  const names = scan(state);
  cache.set(state.objects, {
    battlefield: state.battlefield,
    definitions: state.definitions,
    effects: state.continuousEffects,
    names,
  });
  return names;
}

/**
 * Whether no activated ability of `obj` can be activated because its name is one a permanent chose (CR 602.5, 607.2d): a mana ability and a loyalty ability included, from any zone. A
 * face-down permanent has no name, so it is never locked (CR 708.2).
 */
export function activationLockedByName(state: GameState, obj: GameObject): boolean {
  const names = lockedNames(state);
  if (names.size === 0) return false;
  if (isFaceDown(obj)) return false;
  return names.has(derive(state, obj).name);
}
