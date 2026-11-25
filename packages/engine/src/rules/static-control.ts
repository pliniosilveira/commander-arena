/**
 * Static control effects (CR 613.1b, 611.3a, D-189): "The monarch controls enchanted creature." (Fealty to the Realm). The ability is a layer 2 control effect of the
 * permanent that has it, applied to the permanent it is attached to with the timestamp of the permanent with the ability (CR 613.7a: an Aura gets a new one as it is
 * attached, CR 613.7e; a new monarch gives it none). `controllerOf` (`control.ts`) reads the sources found here among the continuous effects of the same layer, in timestamp
 * order, and the monarch as it is when it is read. The scan reads the printed abilities of the permanents that are attached to something (no `derive`: `derive` needs the
 * controller first) and is kept for as long as the objects, the battlefield and the card definitions are the same, as `lost-abilities.ts` does.
 */
import type { ObjectId } from '../ids';
import type { GameState } from '../state/types';
import { copiableValues } from './copiable';
import { hasLostAbilitiesBase } from './lost-abilities-core';

/** One static control effect on a permanent: who controls it (the monarch) and when the effect began. */
export interface StaticControl {
  readonly by: 'monarch';
  readonly timestamp: number;
}

type Found = ReadonlyMap<ObjectId, readonly StaticControl[]>;

interface Cached {
  readonly battlefield: GameState['battlefield'];
  readonly definitions: GameState['definitions'];
  readonly effects: GameState['continuousEffects'];
  readonly found: Found;
}

const NONE: Found = new Map();
const cache = new WeakMap<object, Cached>();

function scan(state: GameState): Found {
  const found = new Map<ObjectId, StaticControl[]>();
  for (const id of state.battlefield) {
    const source = state.objects[id];
    if (source === undefined || source.attachedTo === null) continue;
    const host = state.objects[source.attachedTo];
    if (host?.zone !== 'battlefield') continue;
    // CR 613.1f: a permanent that lost all abilities has no static ability left to apply.
    if (hasLostAbilitiesBase(state, id)) continue;
    for (const a of copiableValues(state, source).abilities) {
      if (a.kind !== 'static' || a.static.kind !== 'controlAttached') continue;
      const list = found.get(host.id) ?? [];
      list.push({ by: a.static.by, timestamp: source.timestamp });
      found.set(host.id, list);
    }
  }
  if (found.size === 0) return NONE;
  for (const [id, list] of found) {
    if (list.length >= 2)
      found.set(
        id,
        [...list].sort((a, b) => a.timestamp - b.timestamp),
      );
  }
  return found;
}

/** The permanents that static control effects affect now, each with its effects in timestamp order (CR 613.7). Usually none. */
export function staticControls(state: GameState): Found {
  const hit = cache.get(state.objects);
  if (
    hit !== undefined &&
    hit.battlefield === state.battlefield &&
    hit.definitions === state.definitions &&
    hit.effects === state.continuousEffects
  ) {
    return hit.found;
  }
  const found = scan(state);
  cache.set(state.objects, {
    battlefield: state.battlefield,
    definitions: state.definitions,
    effects: state.continuousEffects,
    found,
  });
  return found;
}
