/**
 * chooseCards (CR 701.23 Search, CR 701.9 Discard): the player picks between `min` and `max` of the
 * engine's legal cards. The ORDER of the picks is part of the answer, because a search assigns its
 * destinations in that order (the first card found goes to the first destination), so selection
 * keeps the order of the clicks. Pure functions, unit tested without a DOM.
 */
import type {
  ChooseCardsDecision,
  Cost,
  Effect,
  GameView,
  ObjectId,
  ObjectView,
} from '@commander-arena/engine';
import { sharesLandType } from '@commander-arena/engine';
import { cardNoun, chosenCardMoveText, findEffect, lookAtTopText } from '../../game/artifacts-text';
import { castFreeText } from '../../game/dinosaurs-text';
import { beholdQuality, beholdReminder } from '../../game/dragons-text';
import { findUnless } from '../../game/unless-text';
import { type Index, myHand, nameOf, plural, stackName } from './lookup';
import { unlessPaysPrompt, wardPrompt } from './optional';
import { togglePermanent } from './permanents';

type Range = Pick<ChooseCardsDecision, 'min' | 'max'> &
  Partial<Pick<ChooseCardsDecision, 'orSingle' | 'shareLandType'>>;

/**
 * Toggles a card, keeping the order of the picks. Clicking a chosen card takes it back (the later
 * picks move up); with one card allowed a click on another swaps; with room for several a click
 * beyond `max` is ignored; a card that is not legal is never chosen.
 */
export function toggleFound(
  chosen: readonly ObjectId[],
  decision: Pick<ChooseCardsDecision, 'legal' | 'max'>,
  id: ObjectId,
): readonly ObjectId[] {
  return togglePermanent(chosen, decision, id);
}

/**
 * True when the picks may be sent: between `min` and `max` cards (zero is fine for a search). A discard "unless you
 * discard an artifact card" (D-139, `orSingle`) takes exactly `max` cards, or one card of its list alone.
 */
export function foundReady(chosen: readonly ObjectId[], decision: Range): boolean {
  // D-262: "up to two basic land cards that share a land type": the cards picked need a land type in common, which the engine would refuse otherwise.
  if (decision.shareLandType !== undefined && !sharesLandType(chosen, decision.shareLandType)) {
    return false;
  }
  const { orSingle } = decision;
  if (orSingle !== undefined && chosen.length !== decision.max) {
    const [only] = chosen;
    return chosen.length === 1 && only !== undefined && orSingle.includes(only);
  }
  return chosen.length >= decision.min && chosen.length <= decision.max;
}

/** Why Confirm is disabled (its tooltip), or null when the picks may be sent. */
export function foundHint(chosen: readonly ObjectId[], decision: Range): string | null {
  if (foundReady(chosen, decision)) return null;
  if (
    decision.shareLandType !== undefined &&
    chosen.length >= decision.min &&
    chosen.length <= decision.max
  ) {
    return 'Choose lands that share a land type';
  }
  if (decision.orSingle !== undefined) {
    return `Choose ${plural(decision.max, 'card')}, or one card marked “${ALONE}”`;
  }
  return chosen.length < decision.min
    ? `Choose ${plural(decision.min - chosen.length, 'more card')}`
    : `Choose at most ${decision.max}`;
}

/** The mark of a card that may be discarded alone instead of the full count (D-139). */
export const ALONE = 'enough alone';

/** "1st", "2nd", "3rd", "4th", "11th", "22nd". */
export function ordinal(n: number): string {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** Where a looked-at card goes when taken (D-145): into the hand (the default), onto the battlefield, or into exile face down. */
export type TakeTo = 'hand' | 'battlefield' | 'exileFaceDown';

/**
 * Where the card taken from the top of the library goes, read from the `lookAtTop` of the ability on the stack; the hand
 * when the view does not show the ability (a spell's effect is not in the view): nothing is guessed beyond the default.
 */
export function lookTakeDestination(
  decision: Pick<ChooseCardsDecision, 'source'>,
  index: Index,
): TakeTo {
  return sourceEffect(decision, index, 'lookAtTop')?.take.to ?? 'hand';
}

/**
 * "cast" or "play": what the controller does with the card (D-145, CR 608.2g). The engine's own words say it ("You may play the
 * exiled card without paying its mana cost"), so a spell's question, whose effect the view does not carry, reads right too.
 */
export function castVerb(decision: Pick<ChooseCardsDecision, 'prompt'>): 'cast' | 'play' {
  return decision.prompt.startsWith('You may play ') ? 'play' : 'cast';
}

/** The label of the Confirm button: a search that finds nothing says so. */
export function confirmLabel(
  decision: Pick<ChooseCardsDecision, 'purpose'> &
    Partial<Pick<ChooseCardsDecision, 'prompt' | 'min' | 'to'>>,
  chosen: readonly ObjectId[],
  to: TakeTo = 'hand',
): string {
  // D-145: "You may cast a spell ... without paying its mana cost": cast it, or decline.
  if (decision.purpose === 'cast') {
    const verb = castVerb({ prompt: decision.prompt ?? '' });
    return chosen.length === 0 ? `Don't ${verb}` : `${capital(verb)} it`;
  }
  // D-151 (CR 701.4a): reveal a card from the hand or choose a permanent; the choice is made, so there is no "none".
  if (decision.purpose === 'behold') return 'Behold';
  // D-225 (CR 701.20a): the card revealed for a land's "you may reveal a card"; the choice is made, so there is no "none".
  if (decision.purpose === 'reveal') return 'Reveal';
  // D-232: the card an opponent puts on the bottom of the other player's library (Coin of Fate); the choice is made, so there is no "none".
  if (decision.purpose === 'split') return 'Choose';
  // D-232: the card a permanent becomes a copy of (Spirit of Resilience); the choice is made, so there is no "none".
  if (decision.purpose === 'copy') return 'Copy';
  // D-272: a creature card of a graveyard chosen for Dawnbreak Reclaimer's pair; the choice is made, so there is no "none".
  if (decision.purpose === 'pair') return 'Choose';
  // D-151 (CR 701.9): "Discard any number of cards": Confirm works with none.
  if (decision.purpose === 'discard' && chosen.length === 0 && (decision.min ?? 1) === 0) {
    return 'Discard none';
  }
  if (decision.purpose === 'search') return chosen.length === 0 ? 'Find nothing' : 'Confirm';
  if (decision.purpose === 'putOnTop') return 'Put on top';
  // D-216: the piles of the cards looked at (Expressive Iteration): the hand, then the bottom of the library; the rest is exiled.
  if (decision.purpose === 'lookSplit') {
    return decision.to === 'bottom' ? 'Put on the bottom' : 'Put into hand';
  }
  if (decision.purpose === 'exile') return 'Exile';
  // D-139: put a card from the hand or graveyard onto the battlefield; take a looked-at card into the hand.
  if (decision.purpose === 'move') return chosen.length === 0 ? 'Put none' : 'Put onto battlefield';
  if (decision.purpose === 'lookTake') {
    // CR 702.75a: Hideaway exiles the card it must take; "put it onto the battlefield" may take none.
    if (to === 'exileFaceDown') return 'Exile face down';
    if (to === 'battlefield') return chosen.length === 0 ? 'Put none' : 'Put onto battlefield';
    return chosen.length === 0 ? 'Take none' : 'Put into hand';
  }
  return 'Discard';
}

const capital = (text: string): string => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

/**
 * True when the order of the picks is part of the answer and worth showing: a search gives its
 * first card to the first destination, a put on top puts the first card on top (D-091).
 */
export function pickOrderMatters(decision: Pick<ChooseCardsDecision, 'purpose' | 'max'>): boolean {
  return (decision.purpose === 'search' || decision.purpose === 'putOnTop') && decision.max > 1;
}

/** "1st from top" for a put on top, "1st" for a search: the order of one pick. */
export function pickOrderLabel(
  decision: Pick<ChooseCardsDecision, 'purpose'>,
  place: number,
): string {
  return decision.purpose === 'putOnTop' ? `${ordinal(place)} from top` : ordinal(place);
}

/** "a card", "2 cards", "up to 3 cards", "1 to 2 cards". */
export function cardsRange(min: number, max: number): string {
  if (min === max) return max === 1 ? 'a card' : plural(max, 'card');
  return min === 0 ? `up to ${plural(max, 'card')}` : `${min} to ${plural(max, 'card')}`;
}

/** "0 of up to 2 chosen", "1 of 2 chosen". */
export function foundCount(chosen: readonly ObjectId[], decision: Range): string {
  const { min, max } = decision;
  const of = min === max ? String(max) : min === 0 ? `up to ${max}` : `${min} to ${max}`;
  return `${chosen.length} of ${of} chosen`;
}

/** The bar's second line: how many are chosen, and that the order of the picks matters. */
export function foundDetail(decision: ChooseCardsDecision, chosen: readonly ObjectId[]): string {
  if (decision.orSingle !== undefined) {
    // D-139: "Discard two cards unless you discard an artifact card".
    return `${chosen.length} of ${decision.max} chosen. One card marked “${ALONE}” is enough by itself.`;
  }
  const count = foundCount(chosen, decision);
  // D-151 (CR 701.9): "Discard any number of cards": say what Confirm does with none chosen.
  if (decision.purpose === 'discard' && decision.min === 0) {
    return chosen.length === 0
      ? `${count}. Click cards to discard them, or Confirm to discard none.`
      : count;
  }
  if (!pickOrderMatters(decision)) return count;
  return decision.purpose === 'putOnTop'
    ? `${count}. The order you pick them in matters: the first you pick ends on top of your library.`
    : `${count}. The order you pick them in matters: the first goes to the first place named.`;
}

/**
 * The badge on a card of the board (a hand card to discard or to put on top): the order of the pick
 * for a search or a put on top of several ("1st from top"), "Discard" for a discard, where the
 * order means nothing.
 */
export function foundBadge(
  decision: Pick<ChooseCardsDecision, 'purpose' | 'max'> &
    Partial<Pick<ChooseCardsDecision, 'prompt' | 'to'>>,
  chosen: readonly ObjectId[],
  id: ObjectId,
  to: TakeTo = 'hand',
): string | null {
  const at = chosen.indexOf(id);
  if (at === -1) return null;
  if (decision.purpose === 'cast') return capital(castVerb({ prompt: decision.prompt ?? '' }));
  if (decision.purpose === 'discard') return 'Discard';
  if (decision.purpose === 'behold') return 'Behold';
  if (decision.purpose === 'reveal') return 'Reveal';
  if (decision.purpose === 'split') return 'To the bottom';
  if (decision.purpose === 'copy') return 'Copy';
  if (decision.purpose === 'pair') return 'Chosen';
  if (decision.purpose === 'exile') return 'Exile';
  if (decision.purpose === 'move') return 'Put';
  if (decision.purpose === 'lookTake') {
    return to === 'exileFaceDown' ? 'Exile' : to === 'battlefield' ? 'Put' : 'Take';
  }
  if (decision.purpose === 'lookSplit') {
    return decision.to === 'bottom' ? 'Bottom' : 'Hand';
  }
  if (decision.purpose === 'putOnTop') {
    return decision.max > 1 ? pickOrderLabel(decision, at + 1) : 'On top';
  }
  return decision.max > 1 ? ordinal(at + 1) : 'Found';
}

/** A row of the card list: cards with the same name are one row with a count. */
export interface CardGroup {
  readonly name: string;
  /** The ids of the copies, in the decision's order. */
  readonly ids: readonly ObjectId[];
  /** A copy to show the card's face data (cost, types, text). */
  readonly card: ObjectView;
}

/** Groups equal names, keeping the order of first appearance (the engine lists by name). */
export function groupCards(cards: readonly ObjectView[]): readonly CardGroup[] {
  const groups = new Map<string, { name: string; ids: ObjectId[]; card: ObjectView }>();
  for (const card of cards) {
    const group = groups.get(card.name);
    if (group === undefined) groups.set(card.name, { name: card.name, ids: [card.id], card });
    else group.ids.push(card.id);
  }
  return [...groups.values()];
}

/**
 * A click on a row. A row of one card toggles it. A row of several copies adds the next unchosen
 * copy while there is room, and once every copy (or the room) is used takes the last one back, so
 * one row can stand for "how many of this card".
 */
export function clickGroup(
  chosen: readonly ObjectId[],
  decision: Pick<ChooseCardsDecision, 'legal' | 'max'>,
  group: Pick<CardGroup, 'ids'>,
): readonly ObjectId[] {
  const picked = group.ids.filter((id) => chosen.includes(id));
  const last = picked[picked.length - 1];
  const next = group.ids.find((id) => !chosen.includes(id));
  const full = decision.max === 1 || next === undefined || chosen.length >= decision.max;
  const click = full ? (last ?? group.ids[0]) : next;
  return click === undefined ? chosen : toggleFound(chosen, decision, click);
}

/**
 * The cards the list shows: the viewer's matching library cards, the legal cards of the hand, or
 * the legal cards of the viewer's graveyard (the exile cost of Escape, D-124: the graveyard is
 * public, so the view has the cards).
 */
export function pickerCards(view: GameView, decision: ChooseCardsDecision): readonly ObjectView[] {
  // D-151 (CR 701.4a): a card of the hand to reveal, or a permanent you control to choose.
  if (decision.purpose === 'behold') {
    const { hand, battlefield } = beholdCards(view, decision);
    return [...hand, ...battlefield];
  }
  if (decision.zone === 'hand') return myHand(view).filter((o) => decision.legal.includes(o.id));
  if (decision.zone === 'graveyard') {
    // D-272: the cards may be in the graveyard of another player ("a creature card in an opponent's graveyard"); every graveyard is public (CR 404.2).
    return view.seats
      .flatMap((seat) => seat.graveyard)
      .filter((o) => decision.legal.includes(o.id));
  }
  // D-145: a card to cast or play from exile (Hideaway's card, face down; the view shows it to the player who may look at it).
  if (decision.zone === 'exile') return view.exile.filter((o) => decision.legal.includes(o.id));
  // The library cards come only with the viewer's own pending chooseCards (engine view.ts); never
  // read them for any other decision.
  const own = view.pending?.kind === 'chooseCards' && view.pending.id === decision.id;
  return own ? (view.pendingCards ?? []) : [];
}

/**
 * The legal cards of a Behold, in the two places they are (D-151, CR 701.4a): the cards of the viewer's hand, which are revealed, and
 * the permanents they control, which are only chosen. `zone` of the decision says only `hand`; the cards themselves tell.
 */
export function beholdCards(
  view: GameView,
  decision: Pick<ChooseCardsDecision, 'legal'>,
): { readonly hand: readonly ObjectView[]; readonly battlefield: readonly ObjectView[] } {
  return {
    hand: myHand(view).filter((o) => decision.legal.includes(o.id)),
    battlefield: view.battlefield.filter((o) => decision.legal.includes(o.id)),
  };
}

/** The `behold` effect of the ability on the stack: what is beheld. Null for a spell (the view has no effect for it). */
function beholdEffect(
  decision: Pick<ChooseCardsDecision, 'source'>,
  index: Index,
): Extract<Effect, { kind: 'behold' }> | null {
  return sourceEffect(decision, index, 'behold');
}

/**
 * "Behold a Dragon (X's ability)." (D-151, CR 701.4a): what is beheld is read from the ability on the stack; without it the engine's own
 * words are kept. The long form of the rule is the line of the panel (`beholdHelp`), so the bar stays short.
 */
function beholdPrompt(decision: ChooseCardsDecision, index: Index): string {
  const effect = beholdEffect(decision, index);
  const quality = effect === null ? null : beholdQuality(effect.filter);
  const source = stackName(index, decision.source);
  return quality === null
    ? `${decision.prompt.replace(/\.$/, '')} (${source}).`
    : `Behold ${quality} (${source}).`;
}

/**
 * "Reveal a Dragon card from your hand or choose a Dragon you control on the battlefield." (CR 701.4a): the rule of Behold with what is
 * beheld, the line of the panel; the generic words when the view does not show the ability.
 */
export function beholdHelp(decision: ChooseCardsDecision, index: Index): string {
  const effect = beholdEffect(decision, index);
  const reminder = effect === null ? null : beholdReminder(effect.filter);
  return reminder === null
    ? 'Choose one: a card of your hand to reveal, or a permanent you control.'
    : `${reminder}.`;
}

/** What the opponent is doing for each `waitingOn` purpose; none of it names a card. */
const WAITING_WORDS: Readonly<Record<NonNullable<GameView['waitingOn']>['purpose'], string>> = {
  search: 'searching their library',
  discard: 'discarding',
  putOnTop: 'putting cards from their hand on top of their library',
  scry: 'scrying',
  surveil: 'surveilling',
  reorder: 'putting the top cards of their library back in an order',
  exile: 'choosing cards to exile from their graveyard',
  move: 'choosing cards to put onto the battlefield',
  lookTake: 'choosing among the top cards of their library',
  lookSplit: 'sorting the top cards of their library',
  cast: 'choosing a card to cast or play without paying its mana cost',
  behold: 'beholding',
  reveal: 'choosing a card to reveal',
  split: 'choosing one of the exiled cards',
  copy: 'choosing a card to become a copy of',
  pair: 'choosing a card in a graveyard',
};

/**
 * What the seat that is not choosing shows: only that the opponent is searching, discarding,
 * putting cards on top, scrying, surveilling or reordering, and the spell or ability behind it.
 * Reads `waitingOn`, which names no card and no zone.
 */
export function waitingText(view: GameView): string | null {
  const w = view.waitingOn;
  if (w === undefined) return null;
  const what = WAITING_WORDS[w.purpose];
  return `Opponent is ${what}${w.sourceName === '' ? '' : ` (${w.sourceName})`}.`;
}

/**
 * The discard of Ward's cost ("Ward—Discard a card", D-095): the payer already accepted, so the
 * question has no `forCost` and no cancel. It is told from an effect's discard by its source, the
 * Ward trigger on the stack (a triggered ability that counters its trigger subject unless a cost is
 * paid). The spell that is countered unless the cost is paid is the one stack object that targeted
 * the warded permanent; when the view does not pin it down, the prompt says "that spell".
 */
function wardDiscard(
  decision: Pick<ChooseCardsDecision, 'purpose' | 'source' | 'forCost'>,
  index: Index,
): { readonly cost: readonly Cost[]; readonly subject: string } | null {
  if (decision.purpose !== 'discard' || decision.forCost === true) return null;
  const source = index.get(decision.source);
  const ability = source?.ability;
  if (source === undefined || ability?.kind !== 'triggered') return null;
  if (ability.effect.kind !== 'counterUnlessPays') return null;
  if (ability.effect.objects.kind !== 'triggerSubject') return null;
  const warded = source.abilitySource;
  const subjects = [...index.values()].filter(
    (o) =>
      o.zone === 'stack' &&
      o.id !== source.id &&
      o.abilitySource === undefined &&
      o.targets.some((t) => t.kind === 'object' && t.id === warded),
  );
  const only = subjects.length === 1 ? subjects[0] : undefined;
  return {
    cost: ability.effect.cost,
    subject: only === undefined ? 'that spell' : stackName(index, only.id),
  };
}

/**
 * The discard of an "unless that player discards a card" cost (`unlessPays`, D-111): the payer accepted
 * already, so the question has no `forCost`. Told from an effect's discard by its source, the ability on
 * the stack whose effect is an `unlessPays` with a discard cost. When the effect that happens on a
 * decline is itself a discard the two questions look alike and the engine's prompt is kept.
 */
function unlessDiscardPrompt(
  decision: Pick<ChooseCardsDecision, 'purpose' | 'source' | 'forCost' | 'seat'>,
  index: Index,
): string | null {
  if (decision.purpose !== 'discard' || decision.forCost === true) return null;
  const source = index.get(decision.source);
  const unless = source?.ability === undefined ? null : findUnless(source.ability.effect);
  if (source === undefined || unless === null) return null;
  if (!unless.cost.some((c) => c.kind === 'discard') || unless.effect.kind === 'discard') {
    return null;
  }
  return unlessPaysPrompt(unless.cost, { ...decision, sourceName: source.name }, index);
}

/**
 * The words of a hand discard's question. The engine's own prompt ("Discard a card.") says nothing
 * of why, so a cost says it: "Discard a card as an additional cost to cast X." for a spell,
 * "Discard a card to pay for X's ability." for an activation (both `forCost`, with a Cancel that
 * takes the whole cast back), and Ward's discard is worded like its payment, "Discard a card or X is
 * countered?". Anything else keeps the engine's prompt.
 */
export function cardsPrompt(decision: ChooseCardsDecision, index: Index): string {
  if (decision.purpose === 'exile') return exilePrompt(decision, index);
  if (decision.purpose === 'behold') return beholdPrompt(decision, index);
  if (decision.purpose === 'move') return movePrompt(decision, index);
  if (decision.purpose === 'lookTake') return lookTakePrompt(decision, index);
  if (decision.purpose === 'cast') return castPrompt(decision, index);
  if (decision.orSingle !== undefined) return discardUnlessPrompt(decision, index);
  if (decision.purpose !== 'discard') return decision.prompt;
  const ward = wardDiscard(decision, index);
  if (ward !== null) return wardPrompt(ward.cost, ward.subject);
  const unless = unlessDiscardPrompt(decision, index);
  if (unless !== null) return unless;
  // D-151 (CR 701.9): "Discard any number of cards", none is an answer.
  if (decision.forCost !== true) return anyNumberPrompt(decision, index) ?? decision.prompt;
  const source = index.get(decision.source);
  const base = decision.prompt.replace(/\.$/, '');
  if (source === undefined) return decision.prompt;
  return source.abilitySource === undefined
    ? `${base} as an additional cost to cast ${nameOf(index, decision.source)}.`
    : `${base} to pay for ${stackName(index, decision.source)}.`;
}

/**
 * "Discard any number of cards (X's ability)." (D-151, CR 701.9): a discard with no minimum, from the effect on the stack; null for
 * any other discard.
 */
function anyNumberPrompt(decision: ChooseCardsDecision, index: Index): string | null {
  if (decision.purpose !== 'discard' || decision.min !== 0) return null;
  return `Discard any number of cards (${stackName(index, decision.source)}).`;
}

/**
 * The exile cost of Escape (CR 702.138a, D-124): "Exile 5 other cards from your graveyard to cast
 * X." The count is the decision's, never the card's text; without the spell in the view the
 * engine's own prompt is kept.
 */
function exilePrompt(decision: ChooseCardsDecision, index: Index): string {
  const source = index.get(decision.source);
  if (source === undefined) return decision.prompt;
  return `Exile ${plural(decision.max, 'other card')} from your graveyard to cast ${source.name}.`;
}

/** The effect of a kind in the ability on the stack the decision comes from; null for a spell (the view has none). */
function sourceEffect<K extends Effect['kind']>(
  decision: Pick<ChooseCardsDecision, 'source'>,
  index: Index,
  kind: K,
): Extract<Effect, { kind: K }> | null {
  const effect = index.get(decision.source)?.ability?.effect;
  return effect === undefined ? null : findEffect(effect, kind);
}

/**
 * "Discard two cards, or one artifact card instead, for X." (D-139): the kind of card that will do alone is read from
 * the ability on the stack; a spell's effect is not in the view, so its cards are marked instead ("enough alone").
 */
function discardUnlessPrompt(decision: ChooseCardsDecision, index: Index): string {
  const effect = sourceEffect(decision, index, 'discard');
  const card = effect?.unless === undefined ? null : cardNoun(effect.unless);
  const alone = card ?? `one card marked “${ALONE}”`;
  return `Discard ${plural(decision.max, 'card')}, or ${alone} instead, for ${stackName(index, decision.source)}.`;
}

/**
 * "You may put an artifact card from your hand onto the battlefield (X's ability)." (D-139): the words of the ability on
 * the stack, or the engine's own words with the source when the view does not show them.
 */
function movePrompt(decision: ChooseCardsDecision, index: Index): string {
  const effect = sourceEffect(decision, index, 'moveToZone');
  const words = effect === null ? null : chosenCardMoveText(effect);
  const base = words ?? decision.prompt.replace(/\.$/, '');
  return `${base} (${stackName(index, decision.source)}).`;
}

/**
 * "Look at the top six cards of your library. You may reveal an artifact card from among them and put it into your hand.
 * Put the rest on the bottom of your library in a random order (X's ability)." (D-139): the filter is read from the
 * ability on the stack, the count is the cards really looked at; for a spell the engine's words are kept.
 */
function lookTakePrompt(decision: ChooseCardsDecision, index: Index): string {
  const effect = sourceEffect(decision, index, 'lookAtTop');
  const looked = decision.looked?.length ?? decision.legal.length;
  const words =
    effect === null ? null : lookAtTopText({ ...effect, count: looked }, (a) => String(a));
  const base = words ?? decision.prompt.replace(/\.$/, '');
  return `${base} (${stackName(index, decision.source)}).`;
}

/**
 * "You may cast a spell with mana value 5 or less from your hand without paying its mana cost (X's ability)." (D-145, CR 608.2g):
 * the words of the `castFree` of the ability on the stack, or the engine's own words when the view does not show it (a spell's
 * effect is not in the view).
 */
function castPrompt(decision: ChooseCardsDecision, index: Index): string {
  const effect = sourceEffect(decision, index, 'castFree');
  const words = effect === null ? null : castFreeText(effect);
  const base = words ?? decision.prompt.replace(/\.$/, '');
  return `${base} (${stackName(index, decision.source)}).`;
}

/** The title of the picker panel: "Exile to cast X", "Discard to cast X", "Discard to pay for X's ability", or the default. */
export function discardTitle(decision: ChooseCardsDecision, index: Index): string {
  if (decision.purpose === 'move')
    return `Put onto the battlefield for ${nameOf(index, decision.source)}`;
  // D-272: the two choices of Dawnbreak Reclaimer's ability.
  if (decision.purpose === 'pair') {
    return `Choose a card in a graveyard (${stackName(index, decision.source)})`;
  }
  if (decision.purpose === 'behold') {
    const effect = beholdEffect(decision, index);
    const quality = effect === null ? null : beholdQuality(effect.filter);
    return quality === null ? 'Behold' : `Behold ${quality}`;
  }
  if (decision.purpose === 'lookTake' || decision.purpose === 'lookSplit') {
    const looked = decision.looked?.length ?? decision.legal.length;
    return `Top ${plural(looked, 'card')} of your library`;
  }
  if (decision.purpose === 'cast') {
    const source = nameOf(index, decision.source);
    return castVerb(decision) === 'play' ? `Play for free: ${source}` : `Cast for free: ${source}`;
  }
  if (decision.purpose === 'exile') {
    const spell = index.get(decision.source);
    return spell === undefined ? 'Exile from your graveyard' : `Exile to cast ${spell.name}`;
  }
  if (decision.forCost !== true) return 'Discard from your hand';
  const source = index.get(decision.source);
  if (source === undefined) return 'Discard from your hand';
  return source.abilitySource === undefined
    ? `Discard to cast ${source.name}`
    : `Discard to pay for ${stackName(index, decision.source)}`;
}
