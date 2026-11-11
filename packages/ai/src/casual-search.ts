/**
 * CasualAgent choices of cards from a zone (the `chooseCards` decision): what to find with a
 * library search and what to discard. Heuristics, deliberately simple.
 */
import {
  type Action,
  BASIC_LAND_TYPES,
  type ChooseCardsDecision,
  type Color,
  type GameView,
  type ObjectId,
  type ObjectView,
} from '@commander-arena/engine';
import { chooseCopyCard, chooseEscapeExile, chooseSplitExiled } from './casual-alt-costs';
import { chooseCardsToLose } from './casual-choices';
import { chooseCostDiscard, isWardDiscard } from './casual-costs';
import { chooseAnyNumberToDiscard, chooseBehold } from './casual-dragons';
import { chooseFreeCast } from './casual-free';
import { choosePutOnTop } from './casual-library';
import { findObject, isLand, manaValueOf } from './casual-view';

/** The colour of a basic land, from its land type (CR 305.6), or null for any other card. */
function basicLandColor(o: ObjectView): Color | null {
  if (!isLand(o) || !o.supertypes.includes('basic')) return null;
  for (const type of o.subtypes) {
    const color = BASIC_LAND_TYPES[type];
    if (color !== undefined) return color;
  }
  return null;
}

/** The colours of the basic land types among the lands the viewer controls. */
function coloursOwned(view: GameView): Set<Color> {
  const owned = new Set<Color>();
  for (const o of view.battlefield) {
    if (o.controller !== view.viewer || !isLand(o)) continue;
    for (const type of o.subtypes) {
      const color = BASIC_LAND_TYPES[type];
      if (color !== undefined) owned.add(color);
    }
  }
  return owned;
}

/**
 * "Up to two basic land cards that share a land type" (`shareLandType`, D-262): all the cards found must have one land type in common, so the agent picks a land type
 * first: the one with the most cards to find (up to what is allowed), and among those a colour it has no land of, else the first the engine lists.
 */
function chooseSharedLandType(
  d: ChooseCardsDecision,
  types: Readonly<Record<ObjectId, readonly string[]>>,
  owned: ReadonlySet<Color>,
): Action {
  const kinds = [...new Set(d.legal.flatMap((id) => types[id] ?? []))];
  let best: { cards: ObjectId[]; lacking: boolean } | null = null;
  for (const kind of kinds) {
    const cards = d.legal.filter((id) => (types[id] ?? []).includes(kind)).slice(0, d.max);
    const color = BASIC_LAND_TYPES[kind];
    const lacking = color !== undefined && !owned.has(color);
    if (
      best === null ||
      cards.length > best.cards.length ||
      (cards.length === best.cards.length && lacking && !best.lacking)
    ) {
      best = { cards, lacking };
    }
  }
  return { kind: 'chooseCards', objects: best === null ? [] : best.cards };
}

/**
 * A search: find as many cards as allowed. A basic land of a colour the agent has no land of comes
 * first (and each colour counts once, so two Forests are not taken while Islands are missing);
 * otherwise the first card the engine lists. The answer is in the order found, which is the order
 * of the destinations.
 */
function chooseToFind(view: GameView, d: ChooseCardsDecision): Action {
  const cards = new Map<ObjectId, ObjectView>(
    (view.pendingCards ?? []).map((o) => [o.id, o] as const),
  );
  const owned = coloursOwned(view);
  const colorOf = (id: ObjectId): Color | null => {
    const o = cards.get(id);
    return o === undefined ? null : basicLandColor(o);
  };
  if (d.shareLandType !== undefined) return chooseSharedLandType(d, d.shareLandType, owned);
  const remaining = [...d.legal];
  const found: ObjectId[] = [];
  const want = Math.min(d.max, remaining.length);
  while (found.length < want) {
    const lacking = remaining.findIndex((id) => {
      const color = colorOf(id);
      return color !== null && !owned.has(color);
    });
    const [id] = remaining.splice(lacking >= 0 ? lacking : 0, 1);
    if (id === undefined) break;
    found.push(id);
    const color = colorOf(id);
    if (color !== null) owned.add(color);
  }
  return { kind: 'chooseCards', objects: found };
}

/**
 * A discard: the highest mana value among the cards the agent cannot cast (more than its lands),
 * then, for what is still to discard, the same choice as for the cards to put back after a
 * mulligan (surplus lands, then the most expensive card).
 */
function chooseToDiscard(view: GameView, d: ChooseCardsDecision): Action {
  const lands = view.battlefield.filter((o) => o.controller === view.viewer && isLand(o)).length;
  const uncastable = d.legal
    .map((id, index) => {
      const o = findObject(view, id);
      return { id, index, mv: o !== undefined && !isLand(o) ? manaValueOf(o) : 0 };
    })
    .filter((c) => c.mv > lands)
    .sort((a, b) => b.mv - a.mv || a.index - b.index);
  const first = uncastable.slice(0, d.min).map((c) => c.id);
  const left = d.min - first.length;
  let rest: ObjectId[] = [];
  if (left > 0) {
    const action = chooseCardsToLose(view, {
      kind: 'discard',
      id: d.id,
      seat: d.seat,
      count: left,
      hand: d.legal.filter((id) => !first.includes(id)),
    });
    rest = action.kind === 'chooseCards' ? [...action.objects] : [];
  }
  const chosen = new Set([...first, ...rest]);
  return { kind: 'chooseCards', objects: d.legal.filter((id) => chosen.has(id)) };
}

/**
 * "Discard a card unless you discard an artifact card" (`orSingle`, D-139): an answer is either exactly `max` cards or one single card
 * of `orSingle`. The agent gives up the one card it would lose first (surplus lands, then the most expensive) when there is one to give.
 */
function chooseDiscardOrSingle(view: GameView, d: ChooseCardsDecision): Action {
  const alone = d.orSingle ?? [];
  const single = chooseCardsToLose(view, {
    kind: 'discard',
    id: d.id,
    seat: d.seat,
    count: 1,
    hand: alone,
  });
  if (single.kind === 'chooseCards' && single.objects.length === 1) return single;
  const first = alone[0];
  return { kind: 'chooseCards', objects: first === undefined ? [] : [first] };
}

/**
 * "You may put an artifact card from your hand onto the battlefield" and "look at the top six cards, you may reveal an artifact card
 * from among them and put it into your hand" (`move` and `lookTake`, D-139): taking is a gain, so the agent takes as many as it may,
 * the most expensive first (a card costs nothing to put onto the battlefield, and the best of a few looked at is the one to keep).
 */
function chooseToTake(view: GameView, d: ChooseCardsDecision): Action {
  const seen = new Map<ObjectId, ObjectView>((view.pendingCards ?? []).map((o) => [o.id, o]));
  const mv = (id: ObjectId): number => {
    const o = seen.get(id) ?? findObject(view, id);
    return o === undefined ? 0 : manaValueOf(o);
  };
  // CR 202.3 (D-230): "any number of nonland permanent cards with total mana value 4 or less": the most expensive first while the total stays within the limit (a free
  // card, a mana value of 0, is always worth taking).
  if (d.totalManaValue !== undefined) {
    const limit = d.totalManaValue.limit;
    let total = 0;
    const taken: ObjectId[] = [];
    for (const card of d.legal
      .map((id, index) => ({ id, index, mv: d.totalManaValue?.values[id] ?? mv(id) }))
      .sort((a, b) => b.mv - a.mv || a.index - b.index)) {
      if (taken.length >= d.max || total + card.mv > limit) continue;
      taken.push(card.id);
      total += card.mv;
    }
    return { kind: 'chooseCards', objects: d.legal.filter((id) => taken.includes(id)) };
  }
  const ranked = d.legal
    .map((id, index) => ({ id, index, mv: mv(id) }))
    .sort((a, b) => b.mv - a.mv || a.index - b.index)
    .slice(0, Math.max(d.min, Math.min(d.max, d.legal.length)))
    .map((c) => c.id);
  return { kind: 'chooseCards', objects: d.legal.filter((id) => ranked.includes(id)) };
}

/**
 * "Put one of them into your hand, put one of them on the bottom of your library, and exile one of them" (`lookSplit`, D-216): the best of the cards
 * looked at goes to the hand (a land while the agent has fewer than four, else the most expensive it can cast soon), the worst to the bottom, and
 * what is left is exiled for the turn, which the agent can play like any card of its hand. Deliberately simple, as the other choices.
 */
function chooseSplitPile(view: GameView, d: ChooseCardsDecision): Action {
  const seen = new Map<ObjectId, ObjectView>((view.pendingCards ?? []).map((o) => [o.id, o]));
  const lands = view.battlefield.filter((p) => p.controller === view.viewer && isLand(p)).length;
  const worth = (id: ObjectId): number => {
    const o = seen.get(id) ?? findObject(view, id);
    if (o === undefined) return 0;
    if (isLand(o)) return lands < 4 ? 100 : 1;
    return Math.min(manaValueOf(o), lands + 2);
  };
  const ranked = d.legal
    .map((id, index) => ({ id, index, worth: worth(id) }))
    .sort((a, b) =>
      d.to === 'bottom'
        ? a.worth - b.worth || a.index - b.index
        : b.worth - a.worth || a.index - b.index,
    )
    .slice(0, d.max)
    .map((c) => c.id);
  return { kind: 'chooseCards', objects: d.legal.filter((id) => ranked.includes(id)) };
}

export function chooseCardsFromZone(view: GameView, d: ChooseCardsDecision): Action {
  if (d.purpose === 'putOnTop') return choosePutOnTop(view, d);
  // D-216: the piles of the cards looked at (Expressive Iteration).
  if (d.purpose === 'lookSplit') return chooseSplitPile(view, d);
  // CR 701.4 (D-151): behold a Dragon; "discard any number of cards" (a discard with no minimum that is no cost).
  if (d.purpose === 'behold') return chooseBehold(view, d);
  if (d.purpose === 'discard' && d.min === 0 && d.forCost !== true && d.orSingle === undefined) {
    return chooseAnyNumberToDiscard(view, d);
  }
  if (d.purpose === 'move' || d.purpose === 'lookTake') return chooseToTake(view, d);
  // CR 608.2g (D-145): a spell cast or a card played without paying its cost: always one, the best.
  if (d.purpose === 'cast') return chooseFreeCast(view, d);
  if (d.purpose === 'discard' && d.orSingle !== undefined && d.forCost !== true) {
    return chooseDiscardOrSingle(view, d);
  }
  // CR 702.138a (D-124): the other cards an escape cost exiles from the graveyard.
  if (d.purpose === 'exile') return chooseEscapeExile(view, d);
  // D-232: the card an opponent's ability puts on the bottom of its library (Coin of Fate): the one the agent least wants the other player to have.
  if (d.purpose === 'split') return chooseSplitExiled(view, d);
  // D-232: the card a permanent becomes a copy of until end of turn (Spirit of Resilience).
  if (d.purpose === 'copy') return chooseCopyCard(view, d);
  // A discard paid as a cost (an additional cost, an ability's cost, Ward's): the card wanted least.
  if (d.purpose === 'discard' && (d.forCost === true || isWardDiscard(view, d))) {
    return chooseCostDiscard(view, d);
  }
  return d.purpose === 'search' ? chooseToFind(view, d) : chooseToDiscard(view, d);
}
