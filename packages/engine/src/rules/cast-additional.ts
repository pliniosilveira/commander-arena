/**
 * Paying what a spell's additional costs ask once its mana is paid (CR 118.8, 601.2h, D-095): the
 * permanent to sacrifice, the permanents the caster may choose to sacrifice (any number, none included, D-491), then the cards to discard, then (an escape cost, CR 702.138a, D-124) the other cards
 * of the graveyard to exile. The total cost was locked in at CR 601.2f and
 * the mana paid (CR 601.2g), so these are the costs that need a choice; the legal-action code
 * (`canPaySpellCost`) checked beforehand that they can be paid.
 *
 *   sacrifice  one candidate: the engine chooses and says so (`permanentsChosen`, `automatic`);
 *              several: a `choosePermanent` decision with `forCost`, stage 'sacrifice'
 *   sacrifice  "you may sacrifice one or more creatures" (D-491): with at least one candidate, a `choosePermanent`
 *   (any number)  decision with `forCost`, `min` 0 and `max` the candidates, stage 'sacrifice' too; the permanents
 *              chosen are written on the spell for `sacrificedAsCost`
 *   discard    exactly as many cards in hand as asked: all of them; more: a `chooseCards` decision
 *              with `forCost`, stage 'discard'
 *   exile      exactly as many other cards in the graveyard as asked: all of them; more: a `chooseCards`
 *              decision (purpose 'exile', zone 'graveyard') with `forCost`, stage 'exile'. The cards are
 *              exiled one by one with the usual `zoneChanged` events
 *
 * `cancel` on either question rewinds the whole cast (CR 733), mana included. What the costs paid so
 * far triggered (a sacrificed creature dying, a card discarded) is noted before a question is asked
 * and goes on the stack above the spell once it is cast (CR 603.3), as for an activation.
 */
import type { ObjectId } from '../ids';
import type { NewDecision } from '../state/decisions';
import type { GameEvent } from '../state/events';
import { patchObject } from '../state/ops';
import type { GameState } from '../state/types';
import { beholdCandidates } from './behold';
import { discardableFor, exilable } from './cast-cost';
import { derive } from './derive';
import { discardCostDecision, discardObjects } from './discard-cost';
import { exileCostDecision, exileObjects } from './exile-cost';
import { fail, ok, type Result } from './result';
import { sacrificeCandidates, sacrificePermanent, tapCandidates } from './sacrifice';
import { setPending } from './set-pending';
import { recordObjectsTogether } from './simultaneous';
import { collectTriggers } from './triggers';
import { moveObject } from './zones';

/** What happens once every cost is paid: the spell becomes cast (CR 601.2i). */
export type Finish = (state: GameState, events: GameEvent[]) => Result;

function pause(state: GameState, events: GameEvent[], decision: NewDecision): Result {
  return ok(setPending(collectTriggers(state, events), decision), events);
}

/**
 * After the mana: the permanents a `tapPermanents` alternative cost taps (D-149), then Behold, the sacrifice, the discard and the exile, then the
 * spell is cast. The mana was planned to leave enough permanents to tap (`castManaPlan`).
 */
export function payAdditionalCosts(state: GameState, events: GameEvent[], finish: Finish): Result {
  const casting = state.casting;
  if (!casting) return fail('No cast in progress');
  const tap = casting.extra?.tap;
  if (tap == null) return payBehold(state, events, finish);
  const legal = tapCandidates(state, casting.seat, casting.object, tap.filter);
  if (legal.length < tap.count) return fail('You cannot tap enough permanents');
  if (legal.length === tap.count) return tapChosen(state, events, legal, true, finish);
  return pause({ ...state, casting: { ...casting, stage: 'tap' } }, events, {
    kind: 'choosePermanent',
    seat: casting.seat,
    source: casting.object,
    purpose: 'tap',
    min: tap.count,
    max: tap.count,
    legal,
    forCost: true,
  });
}

/** CR 701.26a (Tap and Untap): the chosen permanents are tapped as a cost (CR 118.3), then the rest of the cost is paid. */
function tapChosen(
  state: GameState,
  events: GameEvent[],
  chosen: readonly ObjectId[],
  automatic: boolean,
  finish: Finish,
): Result {
  const casting = state.casting;
  if (!casting) return fail('No cast in progress');
  let next = state;
  events.push({
    kind: 'permanentsChosen',
    seat: casting.seat,
    source: casting.object,
    objects: chosen,
    purpose: 'tap',
    automatic,
  });
  for (const id of chosen) {
    next = patchObject(next, id, { tapped: true });
    events.push({ kind: 'tapped', object: id, by: casting.seat });
  }
  return payBehold(next, events, finish);
}

/** The answer to the tap question of a spell's alternative cost; the caller checked it against the decision. */
export function answerTap(state: GameState, chosen: readonly ObjectId[], finish: Finish): Result {
  if (state.casting?.stage !== 'tap' || state.casting.activation !== null) {
    return fail('No permanents are being tapped for a spell');
  }
  return tapChosen({ ...state, pending: null }, [], chosen, false, finish);
}

/** As an additional cost, behold one matching card or permanent; a hand card is revealed. */
function payBehold(state: GameState, events: GameEvent[], finish: Finish): Result {
  const casting = state.casting;
  if (!casting) return fail('No cast in progress');
  const filter = casting.extra?.behold ?? null;
  if (filter === null) return paySacrifice(state, events, finish);
  const legal = beholdCandidates(state, casting.seat, casting.object, filter);
  if (legal.length === 0) return fail('You cannot behold a matching card or permanent');
  return pause({ ...state, casting: { ...casting, stage: 'behold' } }, events, {
    kind: 'chooseCards',
    seat: casting.seat,
    source: casting.object,
    purpose: 'behold',
    zone: 'hand',
    legal,
    min: 1,
    max: 1,
    reveal: true,
    prompt: 'Behold: reveal a card from your hand or choose a permanent you control',
    forCost: true,
  });
}

function beholdChosen(
  state: GameState,
  events: GameEvent[],
  chosen: readonly ObjectId[],
  finish: Finish,
): Result {
  const casting = state.casting;
  if (!casting) return fail('No cast in progress');
  const [id] = chosen;
  const object = id === undefined ? undefined : state.objects[id];
  if (object === undefined) return fail('That card or permanent cannot be beheld');
  if (object.zone === 'hand' && object.card !== null) {
    events.push({
      kind: 'cardsRevealed',
      seat: casting.seat,
      cards: [object.card],
      names: [derive(state, object).name],
      from: 'hand',
    });
  }
  return paySacrifice(state, events, finish);
}

/** The answer to the Behold question of a spell's additional cost. */
export function answerBehold(
  state: GameState,
  chosen: readonly ObjectId[],
  finish: Finish,
): Result {
  if (state.casting?.stage !== 'behold' || state.casting.activation !== null) {
    return fail('No card or permanent is being beheld for a spell');
  }
  return beholdChosen({ ...state, pending: null }, [], chosen, finish);
}

/** The sacrifice, then the discard and the exile, then the spell is cast. */
function paySacrifice(state: GameState, events: GameEvent[], finish: Finish): Result {
  const casting = state.casting;
  if (!casting) return fail('No cast in progress');
  const filter = casting.extra?.sacrifice ?? null;
  if (filter === null) return payOptionalSacrifice(state, events, finish);
  const seat = casting.seat;
  const legal = sacrificeCandidates(state, seat, casting.object, filter);
  const count = casting.extra?.sacrificeCount ?? 1;
  if (legal.length < count) return fail('You have too few permanents to sacrifice');
  if (legal.length === count) return sacrificeChosen(state, events, legal, true, finish);
  return pause({ ...state, casting: { ...casting, stage: 'sacrifice' } }, events, {
    kind: 'choosePermanent',
    seat,
    source: casting.object,
    purpose: 'sacrifice',
    min: count,
    max: count,
    legal,
    forCost: true,
  });
}

function sacrificeChosen(
  state: GameState,
  events: GameEvent[],
  chosen: readonly ObjectId[],
  automatic: boolean,
  finish: Finish,
): Result {
  const casting = state.casting;
  if (!casting) return fail('No cast in progress');
  let next = state;
  events.push({
    kind: 'permanentsChosen',
    seat: casting.seat,
    source: casting.object,
    objects: chosen,
    purpose: 'sacrifice',
    automatic,
  });
  // D-283 (CR 603.10a): permanents sacrificed together keep the last-known information recorded before the first leaves.
  next = recordObjectsTogether(next, chosen);
  for (const id of chosen) {
    const done = sacrificePermanent(next, id, casting.seat, chosen.length > 1);
    if (done === null) return fail('That permanent cannot be sacrificed');
    next = done.state;
    events.push(...done.events);
  }
  return payOptionalSacrifice(next, events, finish);
}

/**
 * CR 118.8, 601.2b, 601.2h, 701.21a (D-491): "As an additional cost to cast this spell, you may sacrifice one or more creatures." The caster chooses any number of the
 * permanents that match, none included, once the mana is paid; with no candidate nothing is asked. What was sacrificed is written on the spell (`sacrificedAsCost`), which the
 * spell's own "When you cast this spell" ability reads. `cancel` rewinds the cast (CR 733).
 */
function payOptionalSacrifice(state: GameState, events: GameEvent[], finish: Finish): Result {
  const casting = state.casting;
  if (!casting) return fail('No cast in progress');
  const any = casting.extra?.sacrificeAny ?? null;
  if (any === null || casting.extra === undefined) return payDiscard(state, events, finish);
  const legal = sacrificeCandidates(state, casting.seat, casting.object, any);
  if (legal.length === 0) return payDiscard(state, events, finish);
  return pause(
    {
      ...state,
      casting: {
        ...casting,
        stage: 'sacrifice',
        extra: { ...casting.extra, sacrificeAnyAsked: true },
      },
    },
    events,
    {
      kind: 'choosePermanent',
      seat: casting.seat,
      source: casting.object,
      purpose: 'sacrifice',
      min: 0,
      max: legal.length,
      legal,
      forCost: true,
    },
  );
}

/** Pays the permanents the caster chose for "you may sacrifice one or more creatures", remembers them on the spell, and goes on with the discard. */
function optionalSacrificeChosen(
  state: GameState,
  chosen: readonly ObjectId[],
  finish: Finish,
): Result {
  const casting = state.casting;
  if (!casting) return fail('No cast in progress');
  const events: GameEvent[] = [];
  let next: GameState = state;
  if (chosen.length > 0) {
    events.push({
      kind: 'permanentsChosen',
      seat: casting.seat,
      source: casting.object,
      objects: chosen,
      purpose: 'sacrifice',
      automatic: false,
    });
    // D-283 (CR 603.10a): permanents sacrificed together keep the last-known information recorded before the first leaves.
    next = recordObjectsTogether(next, chosen);
    for (const id of chosen) {
      const done = sacrificePermanent(next, id, casting.seat, chosen.length > 1);
      if (done === null) return fail('That permanent cannot be sacrificed');
      next = done.state;
      events.push(...done.events);
    }
    // D-491: the spell remembers what was sacrificed for it (`sacrificedAsCost`), which "for each creature sacrificed this way" counts.
    const stack = next.objects[casting.object]?.stack;
    if (stack !== undefined && stack !== null) {
      next = patchObject(next, casting.object, { stack: { ...stack, sacrificedAsCost: chosen } });
    }
  }
  const settled = next.casting;
  if (settled?.extra === undefined) return fail('No cast in progress');
  const { sacrificeAnyAsked: _asked, ...extra } = settled.extra;
  return payDiscard({ ...next, casting: { ...settled, extra } }, events, finish);
}

/** The answer to the sacrifice question of a spell's cost; the caller checked it against the decision. */
export function answerSacrifice(
  state: GameState,
  chosen: readonly ObjectId[],
  finish: Finish,
): Result {
  if (state.casting?.stage !== 'sacrifice' || state.casting.activation !== null) {
    return fail('No sacrifice is being chosen for a spell');
  }
  // D-491: the question of "you may sacrifice one or more creatures" has its own answer.
  if (state.casting.extra?.sacrificeAnyAsked === true) {
    return optionalSacrificeChosen({ ...state, pending: null }, chosen, finish);
  }
  return sacrificeChosen({ ...state, pending: null }, [], chosen, false, finish);
}

function payDiscard(state: GameState, events: GameEvent[], finish: Finish): Result {
  const casting = state.casting;
  if (!casting) return fail('No cast in progress');
  const count = casting.extra?.discard ?? 0;
  if (count === 0) return payExile(state, events, finish);
  // D-659 (CR 702.81a): retrace discards a land card, not any card.
  const hand = discardableFor(state, casting.seat, casting.object, casting.extra?.discardFilter);
  if (hand.length < count) return fail('You do not have enough cards to discard');
  // Exactly as many cards as asked: there is nothing to choose.
  if (hand.length === count) return discardChosen(state, events, hand, finish);
  return pause(
    { ...state, casting: { ...casting, stage: 'discard' } },
    events,
    discardCostDecision(casting.seat, casting.object, hand, count, true),
  );
}

function discardChosen(
  state: GameState,
  events: GameEvent[],
  chosen: readonly ObjectId[],
  finish: Finish,
): Result {
  const casting = state.casting;
  if (!casting) return fail('No cast in progress');
  const moved = discardObjects(state, casting.seat, chosen);
  if (moved === null) return fail('Those cards cannot be discarded');
  return payExile(moved.state, [...events, ...moved.events], finish);
}

/** CR 702.138a: exile the other cards an escape cost asks for, then the spell is cast. */
function payExile(state: GameState, events: GameEvent[], finish: Finish): Result {
  const casting = state.casting;
  if (!casting) return fail('No cast in progress');
  const count = casting.extra?.exile ?? 0;
  if (count === 0) return payAdditionalExile(state, events, finish);
  const graveyard = exilable(state, casting.seat, casting.object);
  if (graveyard.length < count) return fail('You do not have enough other cards to exile');
  // Exactly as many cards as asked: there is nothing to choose.
  if (graveyard.length === count) return exileChosen(state, events, graveyard, finish);
  return pause(
    { ...state, casting: { ...casting, stage: 'exile' } },
    events,
    exileCostDecision(casting.seat, casting.object, graveyard, count),
  );
}

function exileChosen(
  state: GameState,
  events: GameEvent[],
  chosen: readonly ObjectId[],
  finish: Finish,
): Result {
  const casting = state.casting;
  if (!casting) return fail('No cast in progress');
  const moved = exileObjects(state, chosen);
  if (moved === null) return fail('Those cards cannot be exiled');
  return payAdditionalExile(moved.state, [...events, ...moved.events], finish);
}

/** Exiles the optional cards selected before X, then records their new exile objects on the spell. */
function payAdditionalExile(state: GameState, events: GameEvent[], finish: Finish): Result {
  const casting = state.casting;
  if (!casting) return fail('No cast in progress');
  const ids = casting.extra?.exileFromHand ?? [];
  if (ids.length === 0) return finish(state, events);
  let next = state;
  const exiled: ObjectId[] = [];
  const out = [...events];
  for (const id of ids) {
    if (next.objects[id]?.zone !== 'hand') return fail('A chosen card is no longer in your hand');
    const moved = moveObject(next, { object: id, to: 'exile' });
    if (moved.kind !== 'done' || moved.newObject === null)
      return fail('A chosen card cannot be exiled');
    next = moved.state;
    exiled.push(moved.newObject);
    out.push(...moved.events);
  }
  const spell = next.objects[casting.object];
  if (spell?.stack !== null && spell?.stack !== undefined) {
    next = patchObject(next, casting.object, {
      stack: { ...spell.stack, exiledAsCost: exiled },
    });
  }
  return finish(next, out);
}

/** The answer to the exile question of an escape cost; the caller checked it against the decision. */
export function answerExile(state: GameState, chosen: readonly ObjectId[], finish: Finish): Result {
  if (state.casting?.stage !== 'exile' || state.casting.activation !== null) {
    return fail('No cards are being exiled for a spell');
  }
  return exileChosen({ ...state, pending: null }, [], chosen, finish);
}

/** The answer to the discard question of a spell's cost; the caller checked it against the decision. */
export function answerDiscard(
  state: GameState,
  chosen: readonly ObjectId[],
  finish: Finish,
): Result {
  if (state.casting?.stage !== 'discard' || state.casting.activation !== null) {
    return fail('No discard is being chosen for a spell');
  }
  return discardChosen({ ...state, pending: null }, [], chosen, finish);
}
