/**
 * The meld ability (D-278, CR 701.42 Meld, CR 712.4a, 712.14c): "At the beginning of your end step, if you both own and control this creature and a creature
 * named X, exile them, then meld them into Y." The objects are in `rules/melded.ts`; this is the condition and the effect.
 *
 * The effect exiles the two permanents (CR 701.42a: to meld two cards is to put them onto the battlefield with their back faces up and combined, which the ability
 * does after exiling them), and then, if the two exile objects can be melded (CR 701.42b: the two cards of one meld pair, neither a token) and are both still
 * in exile, puts them onto the battlefield as one melded permanent under the control of the controller of the ability (CR 712.14c). Otherwise they stay in
 * the zone they are in (CR 701.42c, a `meldFailed` event): the cards of the exiled pair stay exiled, a token that was exiled ceases to exist.
 */
import type { Effect } from '../ast/types';
import type { ObjectId } from '../ids';
import type { GameEvent } from '../state/events';
import { definitionOf } from '../state/ops';
import type { GameState, ResolutionContext } from '../state/types';
import { namedCandidates, ownedAndControlledBy } from './meld-condition';
import { commanderCardOf, meldPairIssue } from './melded';
import { done, type StepOutcome } from './step-outcome';
import { moveObject } from './zones';

/**
 * CR 701.42a-c, 712.4a, 712.14c (D-278): exile the permanent the ability belongs to and the creature named `partner` that its controller owns and controls, then
 * meld them into the combined face `result`. When several permanents qualify, the one that can be melded with this card is taken (a token copy that
 * shares the name could not be, CR 701.42b); nothing is chosen for a player that could hurt them.
 */
export function runMeld(
  state: GameState,
  res: ResolutionContext,
  effect: Extract<Effect, { kind: 'meld' }>,
): StepOutcome {
  const source = state.objects[res.source];
  // The ability belongs to a permanent that must still be there (the intervening "if" was checked as the ability resolved, CR 603.4).
  if (source === undefined || !ownedAndControlledBy(state, source, res.controller)) {
    return done(state);
  }
  const candidates = namedCandidates(state, source, res.controller, effect.partner, 'creature');
  const other = candidates.find((c) => meldPairIssue(state, source, c) === null) ?? candidates[0];
  if (other === undefined) return done(state);
  // A commander is the first card of the melded permanent (CR 903.3b, `GameObject.card`): the commander's exile object goes first.
  const second = commanderCardOf(state, other) !== null && commanderCardOf(state, source) === null;
  const [firstOld, secondOld] = second ? [other, source] : [source, other];

  let next = state;
  const events: GameEvent[] = [];
  const exiled: (ObjectId | null)[] = [];
  for (const old of [firstOld, secondOld]) {
    // CR 701.42a: the exile is a move like any other; what replaces it (CR 614) applies, and a card that did not go to exile is not melded.
    const moved = moveObject(next, { object: old.id, to: 'exile' });
    if (moved.kind !== 'done') {
      exiled.push(null);
      continue;
    }
    next = moved.state;
    events.push(...moved.events);
    exiled.push(moved.newObject);
  }
  const [firstExile, secondExile] = exiled;
  const a = firstExile === null || firstExile === undefined ? undefined : next.objects[firstExile];
  const b =
    secondExile === null || secondExile === undefined ? undefined : next.objects[secondExile];
  const stay = [a, b].flatMap((o) => (o === undefined ? [] : [o.id]));
  if (a === undefined || b === undefined || a.zone !== 'exile' || b.zone !== 'exile') {
    // CR 701.42c: what is not in exile (or is gone) can't be melded; what is there stays.
    events.push({
      kind: 'meldFailed',
      objects: stay,
      reason: 'a card did not stay in exile, so the two can not be melded',
    });
    return done(next, events);
  }
  const issue = meldPairIssue(next, a, b);
  const result = a.card === null ? undefined : definitionOf(next, a.card).faces[1]?.name;
  if (issue !== null || result !== effect.result) {
    // CR 701.42b, 701.42c: a token, a card that is not part of the pair, or a pair that is not the one the ability names: they stay exiled.
    events.push({
      kind: 'meldFailed',
      objects: stay,
      reason: issue ?? 'the cards do not form the pair this ability melds into',
    });
    return done(next, events);
  }
  // CR 712.14c: the two cards enter the battlefield as a single permanent with their back faces up, under the control of the controller of the ability.
  const melded = moveObject(next, {
    object: a.id,
    to: 'battlefield',
    face: 1,
    meldWith: b.id,
    toSeat: res.controller,
  });
  if (melded.kind !== 'done') {
    // A combined face that asks a question as it enters is refused by `validateCard`; if one did get here the cards stay exiled rather than guess.
    events.push({
      kind: 'meldFailed',
      objects: stay,
      reason: 'the melded permanent asks a question as it enters, which is not supported',
    });
    return done(next, events);
  }
  events.push(...melded.events);
  return done(melded.state, events);
}
