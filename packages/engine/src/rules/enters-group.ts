/**
 * "Each other Angel you control enters with an additional +1/+1 counter on it for each Angel you already control." (D-149, CR 614.1c,
 * 614.12, 122.6): a replacement effect of a permanent on the battlefield (`othersEnterWithCounters`) for every permanent that enters the
 * battlefield, a card put there from any zone, a token, or a copy of a spell that becomes a token. The effect is read from the permanents on
 * the battlefield as the new one enters (CR 614.12: looking at the game without it), so a permanent never affects its own entering, and
 * two that enter at the same time do not see each other. `what` is read for the controller of the permanent with the ability ("you control",
 * "other" leaves that permanent out), against the characteristics the entering permanent has as it would be on the battlefield; a count is
 * made without the entering permanent, which is not there yet ("for each Angel you already control").
 */
import type { Replacement } from '../ast/types';
import type { GameObject, GameState } from '../state/types';
import { controllerOf } from './control';
import { copiableValues } from './copiable';
import { derive } from './derive';
import { manaSpentOf } from './mana-spent';
import { countMatching, matchesFilter } from './select';

type OthersEnter = Extract<Replacement, { kind: 'othersEnterWithCounters' }>;

/** The counters of every kind that the replacement effects of the battlefield add to `entering`, as it enters. */
export function groupEntryCounters(state: GameState, entering: GameObject): Record<string, number> {
  const added: Record<string, number> = {};
  const sources = [...state.battlefield].sort(
    (a, b) => (state.objects[a]?.timestamp ?? 0) - (state.objects[b]?.timestamp ?? 0),
  );
  for (const id of sources) {
    const permanent = state.objects[id];
    if (permanent === undefined) continue;
    for (const ability of derive(state, permanent).abilities) {
      if (
        ability.kind !== 'replacement' ||
        ability.replacement.kind !== 'othersEnterWithCounters'
      ) {
        continue;
      }
      const r: OthersEnter = ability.replacement;
      const ctx = { controller: controllerOf(state, permanent), source: id };
      if (!matchesFilter(state, entering, { ...r.what, zone: 'battlefield' }, ctx)) continue;
      // D-183: "for each mana from an artifact source spent to cast it": the spell the entering permanent came from.
      const count =
        typeof r.count === 'number'
          ? r.count
          : r.count.kind === 'manaSpent'
            ? manaSpentOf(entering, r.count.fromType)
            : countMatching(state, r.count.filter, ctx);
      if (count > 0) added[r.counter] = (added[r.counter] ?? 0) + count;
    }
  }
  return added;
}

/**
 * CR 614.1c, 614.12 (D-179): whether a replacement effect of a permanent on the battlefield ("Lands you control enter untapped",
 * `groupEntersUntapped`) makes `entering` enter untapped. Read as the counters above are: from the permanents on the battlefield as the new one
 * enters, so the permanent never affects its own entering, against the permanent as it would be there, for the controller of the permanent with
 * the ability.
 */
export function groupEntersUntapped(state: GameState, entering: GameObject): boolean {
  for (const id of state.battlefield) {
    const permanent = state.objects[id];
    if (permanent === undefined || !mayHaveReplacement(state, permanent)) continue;
    for (const ability of derive(state, permanent).abilities) {
      if (ability.kind !== 'replacement' || ability.replacement.kind !== 'groupEntersUntapped') {
        continue;
      }
      const ctx = { controller: controllerOf(state, permanent), source: id };
      if (
        matchesFilter(state, entering, { ...ability.replacement.what, zone: 'battlefield' }, ctx)
      ) {
        return true;
      }
    }
  }
  return false;
}

/** False only when the permanent certainly has no `groupEntersUntapped` ability in any layer (its copiable abilities hold none). */
function mayHaveReplacement(state: GameState, obj: GameObject): boolean {
  if (obj.card === null && obj.token === null && obj.copyOf === undefined) return false;
  return copiableValues(state, obj).abilities.some(
    (a) => a.kind === 'replacement' && a.replacement.kind === 'groupEntersUntapped',
  );
}

/** `base` with the counters of `more` added to it. */
export function addCounterMaps(
  base: Readonly<Record<string, number>>,
  more: Readonly<Record<string, number>>,
): Record<string, number> {
  const out: Record<string, number> = { ...base };
  for (const [counter, n] of Object.entries(more)) out[counter] = (out[counter] ?? 0) + n;
  return out;
}
