/**
 * "If a creature would die, instead exile it and create a token" (D-133, CR 614.1a, 700.4): the replacement effects of
 * permanents on the battlefield that change where a creature goes when it would be put into a graveyard from the battlefield.
 * `moveObject` (zones.ts) asks `dieReplacementFor` for every such move, so destruction, lethal damage, zero toughness, a
 * sacrifice and the legend rule are all covered, and the creature is exiled and never dies.
 *
 * A replacement is read from the battlefield as the event begins (CR 614.12). Several creatures dying together (a "destroy all"
 * effect, a state-based action, CR 704.3) are moved one after the other by the engine, so the caller names the permanents with
 * such a replacement before the first one moves (`replacementSources`) and `dieReplacementFor` takes the abilities from
 * the permanent as it was if it has left in the meantime: they die together, so they replace each other's deaths.
 *
 * When several replacements apply to one creature the owner of the creature chooses (CR 616.1): the engine applies the one
 * of the oldest permanent and asks nothing (`docs/ROADMAP.md`).
 */
import type { Replacement } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import type { GameObject, GameState } from '../state/types';
import { controllerOf } from './control';
import { derive } from './derive';
import { matchesFilter } from './select';

type WouldDie = Extract<Replacement, { kind: 'wouldDie' }>;

/** The `wouldDie` replacements a permanent has now (after "loses all abilities" and the like, CR 613.1f). */
function wouldDieOf(
  state: GameState,
  id: ObjectId,
): { object: GameObject; list: WouldDie[] } | null {
  const live = state.objects[id];
  const abilities = live === undefined ? state.lki[id]?.abilities : derive(state, live).abilities;
  const object = live ?? state.lki[id]?.object;
  if (abilities === undefined || object === undefined) return null;
  const list = abilities.flatMap((a) =>
    a.kind === 'replacement' && a.replacement.kind === 'wouldDie' ? [a.replacement] : [],
  );
  return list.length === 0 ? null : { object, list };
}

/** The permanents on the battlefield with a replacement of a death, oldest first (CR 613.7: by timestamp). */
export function replacementSources(state: GameState): ObjectId[] {
  return state.battlefield
    .filter((id) => wouldDieOf(state, id) !== null)
    .sort((a, b) => (state.objects[a]?.timestamp ?? 0) - (state.objects[b]?.timestamp ?? 0));
}

/** What a death is replaced with: who creates the tokens, and which. */
export interface DieReplacement {
  readonly controller: SeatId;
  readonly alsoCreate: WouldDie['alsoCreate'];
}

/**
 * The replacement that applies to `creature`, a creature on the battlefield that is about to be put into a graveyard, or null.
 * `sources` are the permanents to ask (`replacementSources`); left out, the battlefield as it is.
 */
export function dieReplacementFor(
  state: GameState,
  creature: GameObject,
  sources: readonly ObjectId[] = replacementSources(state),
): DieReplacement | null {
  for (const id of sources) {
    const found = wouldDieOf(state, id);
    if (found === null) continue;
    for (const r of found.list) {
      // "An opponent controls" and "you control" are relative to the controller of the permanent with the ability.
      const matches = matchesFilter(
        state,
        creature,
        { ...r.what, zone: 'battlefield' },
        { controller: controllerOf(state, found.object), source: id },
      );
      if (matches)
        return { controller: controllerOf(state, found.object), alsoCreate: r.alsoCreate };
    }
  }
  return null;
}
