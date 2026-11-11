/**
 * The legend rule (CR 704.5j): if a player controls two or more legendary permanents with the same
 * name, that player chooses one of them and the rest are put into their owners' graveyards.
 *
 * It is a state-based action (CR 704.3), found with the others in `checkStateBasedActions`, and its
 * choice is a decision: a `choosePermanent` with purpose 'legendRule' (`min` = `max` = 1, `legal`
 * the duplicates). Like the commander decision of CR 903.9a it is asked after the other state-based
 * actions of the check were performed (the caller loops, so the next check asks it), one name of one
 * player at a time. The answer puts the others into their graveyards (a "dies" trigger of a creature
 * among them fires as it was, CR 700.4, 603.10a) and the caller checks again.
 *
 * It is never decided for the player. Two permanents with the same name are not interchangeable:
 * one may be summoning sick, tapped, carry counters, damage or attachments, or be a token with
 * effects on it, and the rule says the player chooses (a deterministic pick could be wrong).
 *
 * "The same name" and "legendary" are read after the layers (CR 201.2, 205.4): a copy has the
 * original's name and supertypes (CR 707.2), and an effect that changes either counts.
 */
import type { ObjectId, SeatId } from '../ids';
import type { ChoosePermanentDecision } from '../state/decisions';
import type { GameEvent } from '../state/events';
import type { GameObject, GameState } from '../state/types';
import { controllerOf } from './control';
import { derive } from './derive';
import { moveObject } from './zones';

/** A legendary permanent on the battlefield, with the name it has now. */
export interface LegendCandidate {
  readonly object: GameObject;
  readonly name: string;
}

/** Numeric order of object ids: the order objects came to exist, so a list is in a fixed order. */
function byAge(a: ObjectId, b: ObjectId): number {
  return Number(a.slice(1)) - Number(b.slice(1));
}

/**
 * The decision for the first player and name that has duplicates, or null when the rule does not
 * apply. Groups are ordered by the age of their oldest member, and the members by age.
 */
export function legendRuleDecision(
  state: GameState,
  candidates: readonly LegendCandidate[],
): Omit<ChoosePermanentDecision, 'id'> | null {
  const groups = new Map<string, { seat: SeatId; ids: ObjectId[] }>();
  for (const { object, name } of candidates) {
    const key = `${controllerOf(state, object)}#${name}`;
    const group = groups.get(key);
    if (group) group.ids.push(object.id);
    else groups.set(key, { seat: controllerOf(state, object), ids: [object.id] });
  }
  const duplicated = [...groups.values()]
    .filter((g) => g.ids.length >= 2)
    .map((g) => ({ seat: g.seat, ids: [...g.ids].sort(byAge) }))
    .sort((a, b) => byAge(a.ids[0] as ObjectId, b.ids[0] as ObjectId));
  const first = duplicated[0];
  if (first === undefined) return null;
  return {
    kind: 'choosePermanent',
    seat: first.seat,
    source: first.ids[0] as ObjectId,
    purpose: 'legendRule',
    min: 1,
    max: 1,
    legal: first.ids,
  };
}

/**
 * The player kept `keep`: every other permanent of the decision goes to its owner's graveyard, all
 * at once (CR 704.3). Null if one of them is no longer on the battlefield, which cannot happen
 * between the question and the answer.
 */
export function applyLegendRule(
  state: GameState,
  decision: Pick<ChoosePermanentDecision, 'seat' | 'legal'>,
  keep: ObjectId,
): { state: GameState; events: GameEvent[] } | null {
  const kept = state.objects[keep];
  if (kept === undefined) return null;
  // The name is read before anything moves (a copy has the original's name).
  const name = derive(state, kept).name;
  const events: GameEvent[] = [{ kind: 'legendRule', seat: decision.seat, name, kept: keep }];
  let next = state;
  for (const id of decision.legal) {
    if (id === keep) continue;
    if (next.objects[id]?.zone !== 'battlefield') return null;
    const moved = moveObject(next, { object: id, to: 'graveyard' });
    // A permanent going from the battlefield to a graveyard never asks the commander question.
    if (moved.kind !== 'done') return null;
    next = moved.state;
    events.push(...moved.events);
  }
  return { state: next, events };
}
