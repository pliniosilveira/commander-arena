/**
 * CasualAgent and what a spell costs besides its printed mana (D-095): additional costs to cast, cost
 * reductions and the free cast "without paying its mana cost". The engine lists a `castSpell` option
 * only when the whole cost can be paid, so the agent never checks that; what it decides here is
 * whether paying is a good idea:
 *
 * - a sacrifice ("As an additional cost to cast this spell, sacrifice a creature") only when the
 *   permanent it would give up (the one `permanentValue` likes least among those the cost allows) is
 *   worth less than the spell, so a token or a surplus land goes for a good spell and a good creature
 *   never goes for a cheap one;
 * - a discard only for a card the agent wants to lose anyway: a land beyond what the hand can use or a
 *   card it cannot cast (the same two tests as `chooseToDiscard`), or when the spell is worth three
 *   mana or more;
 * - life only while it stays above `PAY_LIFE_ABOVE`, as for a kicker or a shock land.
 *
 * The cost it counts is what the view says (`castCost`): printed cost less reductions plus tax. Among
 * equally valuable spells the cheaper one is cast first (it leaves mana for more), and a permanent
 * that makes spells cheaper ("Artifact spells you cast cost {1} less") is cast before the spells it
 * would discount. The agent keeps its choice to the view: it matches a cost's filter against the
 * permanents it can see, as the engine does for the fields the filters use.
 */
import {
  type Action,
  type ChooseCardsDecision,
  type ConfirmOptionalDecision,
  type Cost,
  type GameView,
  manaValue,
  type ObjectFilter,
  type ObjectView,
} from '@commander-arena/engine';
import { LAND_TARGET } from './casual-choices';
import { PAY_LIFE_ABOVE, permanentValue } from './casual-permanents';
import {
  effectiveCost,
  findObject,
  fixedLifeOf,
  isLand,
  manaValueOf,
  ownHand,
  ownLife,
} from './casual-view';

/**
 * Whether the object matches the filter, for the fields a cost filter uses: types, the types it must
 * not have, supertypes, subtypes, colors, tapped and a disjunction. `zone` and `controller` are the
 * caller's business (the objects it passes are the permanents the agent controls).
 */
export function viewMatches(o: ObjectView, f: ObjectFilter): boolean {
  if (f.types?.some((t) => !o.types.includes(t))) return false;
  if (f.notTypes?.some((t) => o.types.includes(t))) return false;
  if (f.supertypes?.some((t) => !o.supertypes.includes(t))) return false;
  if (f.subtypes?.some((t) => !o.subtypes.includes(t))) return false;
  if (f.colors?.some((c) => !o.colors.includes(c))) return false;
  if (f.tapped !== undefined && o.tapped !== f.tapped) return false;
  if (f.anyOf !== undefined) return f.anyOf.some((member) => viewMatches(o, member));
  return true;
}

/** The permanents the agent controls that a sacrifice filter allows (CR 701.21a). */
function sacrificeCandidates(view: GameView, filter: ObjectFilter): ObjectView[] {
  return view.battlefield.filter((o) => o.controller === view.viewer && viewMatches(o, filter));
}

/**
 * How much the agent wants to keep a card in hand: a land it has no use for (it controls and holds
 * more than `wanted`) and a card it cannot cast yet (its mana value is above the lands it controls)
 * go first, then the cheapest card it can cast.
 */
function handValue(o: ObjectView, onBoard: number, landsTotal: number, wanted: number): number {
  if (isLand(o)) return landsTotal > wanted ? 0 : 5;
  const mv = manaValueOf(o);
  return mv > onBoard ? 1 : 2 + mv;
}

/**
 * The `count` cards of `hand` the agent would lose first, least wanted first, each with its value
 * (see `handValue`). One card at a time, so after one surplus land goes the next is judged against one
 * land fewer.
 */
function leastWanted(
  view: GameView,
  hand: readonly ObjectView[],
  count: number,
): { card: ObjectView; value: number }[] {
  const onBoard = view.battlefield.filter((o) => o.controller === view.viewer && isLand(o)).length;
  let pool = [...hand];
  const out: { card: ObjectView; value: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    const landsTotal = onBoard + pool.filter(isLand).length;
    const wanted = Math.max(LAND_TARGET, ...pool.filter((o) => !isLand(o)).map(manaValueOf));
    const first = pool
      .map((card, index) => ({ card, index, value: handValue(card, onBoard, landsTotal, wanted) }))
      .sort((a, b) => a.value - b.value || a.index - b.index)[0];
    if (first === undefined) break;
    out.push({ card: first.card, value: first.value });
    pool = pool.filter((o) => o !== first.card);
  }
  return out;
}

/** Whether the `count` cards of the hand the agent wants to keep least are ones it is glad to lose. */
function expendable(view: GameView, hand: readonly ObjectView[], count: number): boolean {
  const lose = leastWanted(view, hand, count);
  return lose.length === count && lose.every((l) => l.value <= 1);
}

/**
 * How many of the cards of `hand` the agent is glad to lose (D-1190, "discard X cards"): those it wants least, counted while each is a surplus land or a card
 * it cannot cast (the two tests of `expendable`). The most X it would announce for a spell that discards X cards.
 */
export function expendableCount(view: GameView, hand: readonly ObjectView[]): number {
  let n = 0;
  for (const l of leastWanted(view, hand, hand.length)) {
    if (l.value > 1) break;
    n += 1;
  }
  return n;
}

/** The creature cards of the agent's own graveyard (what "return X target creature cards from your graveyard" can take). */
export function ownGraveyardCreatures(view: GameView): readonly ObjectView[] {
  return (view.seats.find((s) => s.id === view.viewer)?.graveyard ?? []).filter((o) =>
    o.types.includes('creature'),
  );
}

/**
 * The cards to discard for a cost (`chooseCards` with `forCost`, or the cost of Ward the agent has
 * accepted): the ones it wants least, in the order the engine lists the choices.
 */
export function chooseCostDiscard(view: GameView, d: ChooseCardsDecision): Action {
  const hand = d.legal.flatMap((id) => {
    const o = findObject(view, id);
    return o === undefined ? [] : [o];
  });
  const chosen = new Set(leastWanted(view, hand, d.min).map((l) => l.card.id));
  return { kind: 'chooseCards', objects: d.legal.filter((id) => chosen.has(id)) };
}

/**
 * "Sacrifice it unless you pay [cost]" (Echo, CR 702.30a; Cumulative upkeep, CR 702.24a; the question carries
 * `upkeep`, D-127): the agent pays while the permanent is worth more than the payment. The permanent is worth
 * `permanentValue` (about three plus its mana value, so a Giant is worth more than an Echo cost of {G}); the
 * payment costs its mana value, one for each life point (and nothing it would not pay for a Ward: not at or below
 * `PAY_LIFE_ABOVE`) and, for cards to discard, what the hand can spare (`expendable`). A cumulative upkeep that has
 * grown past the value lets the permanent go, which is when a person lets it go. A permanent that is gone from the
 * view is not worth paying for. Null for any other question.
 */
export function upkeepAnswer(view: GameView, d: ConfirmOptionalDecision): Action | null {
  if (d.upkeep === undefined) return null;
  const ability = findObject(view, d.source);
  const permanent =
    ability?.abilitySource === undefined ? undefined : findObject(view, ability.abilitySource);
  if (permanent === undefined || permanent.zone !== 'battlefield') {
    return { kind: 'declineOptional' };
  }
  const cost = d.cost ?? [];
  const life = cost.reduce((sum, c) => sum + fixedLifeOf(c), 0);
  if (life > 0 && ownLife(view) - life <= PAY_LIFE_ABOVE) return { kind: 'declineOptional' };
  const cards = cost.reduce((sum, c) => sum + (c.kind === 'discard' ? c.count : 0), 0);
  if (cards > 0 && !expendable(view, ownHand(view), cards)) return { kind: 'declineOptional' };
  const mana = manaValue(cost.flatMap((c) => (c.kind === 'mana' ? c.symbols : [])));
  const price = mana + life / 2 + cards;
  return price <= permanentValue(view, permanent) - 2
    ? { kind: 'acceptOptional' }
    : { kind: 'declineOptional' };
}

/** Whether a `chooseCards` discard is the cost of a Ward trigger on the stack that the agent accepted. */
export function isWardDiscard(view: GameView, d: ChooseCardsDecision): boolean {
  const source = findObject(view, d.source);
  const kind = source?.ability?.effect.kind;
  // D-111: "[do something] unless that player pays [cost]" asks the same question as Ward's cost.
  return kind === 'counterUnlessPays' || kind === 'unlessPays' || kind === 'cumulativeUpkeep';
}

/**
 * Whether the agent would pay the additional costs of `spell` (a card in its hand or command zone,
 * as its option names it). A spell with none is always acceptable.
 */
export function additionalCostsWorthPaying(view: GameView, spell: ObjectView): boolean {
  const costs: readonly Cost[] = spell.additionalCosts ?? [];
  // D-181: "sacrifice an artifact or creature or pay {4}": the spell is worth casting when one of its two ways is worth paying.
  const choice = spell.additionalCostChoice;
  if (choice !== undefined) {
    return choice.some((way) => costsWorthPaying(view, spell, [...costs, ...way], true));
  }
  return costsWorthPaying(view, spell, costs, false);
}

/** The untapped lands the agent controls: the mana it has now. */
function untappedLands(view: GameView): number {
  return view.battlefield.filter((o) => o.controller === view.viewer && isLand(o) && !o.tapped)
    .length;
}

function costsWorthPaying(
  view: GameView,
  spell: ObjectView,
  costs: readonly Cost[],
  oneOfTwo: boolean,
): boolean {
  if (costs.length === 0) return true;
  const worth = 2 + manaValueOf(spell);
  for (const cost of costs) {
    // A way of a choice that is mana is paid on top of the spell's own cost (D-181): the lands have to be there, or the other way is the only one.
    if (
      oneOfTwo &&
      cost.kind === 'mana' &&
      effectiveCost(spell) + cost.symbols.length > untappedLands(view)
    ) {
      return false;
    }
    if (cost.kind === 'sacrifice' && !('kind' in cost.what)) {
      const candidates = sacrificeCandidates(view, cost.what);
      if (candidates.length === 0) return false;
      const cheapest = Math.min(...candidates.map((o) => permanentValue(view, o)));
      if (cheapest > worth) return false;
    } else if (cost.kind === 'discard') {
      // The spell itself is on the stack when the cost is paid: the hand without it.
      const hand = ownHand(view).filter((o) => o.id !== spell.id);
      if (!expendable(view, hand, cost.count) && manaValueOf(spell) < 3) return false;
    } else if (cost.kind === 'discardX') {
      // D-1190: "discard X cards" is worth it for a card the agent wants to lose anyway, and a spell that returns cards from the graveyard only when it has one to return.
      const hand = ownHand(view).filter((o) => o.id !== spell.id);
      if (expendableCount(view, hand) < 1) return false;
      if (/target creature cards? from your graveyard/i.test(spell.oracleText)) {
        if (ownGraveyardCreatures(view).length < 1) return false;
      }
    } else if (cost.kind === 'payLife') {
      if (ownLife(view) - fixedLifeOf(cost) <= PAY_LIFE_ABOVE) return false;
    }
  }
  return true;
}

/**
 * What a permanent's text says its cost reduction is for ("Artifact spells you cast cost {1} less to
 * cast."), as a test on the spells it discounts, or null when it reduces nothing but itself ("This
 * spell costs {1} less ..." belongs to the spell) or says nothing of the kind.
 */
function discounted(text: string): ((o: ObjectView) => boolean) | null {
  const line = /([A-Za-z ]+?) spells (?:you cast )?cost \{\d+\} less to cast/i.exec(text);
  const subject = line?.[1]?.trim().toLowerCase();
  if (subject === undefined || subject === 'this') return null;
  if (subject === 'instant and sorcery') {
    return (o) => o.types.includes('instant') || o.types.includes('sorcery');
  }
  if (subject === 'noncreature') return (o) => !o.types.includes('creature');
  const type = ['artifact', 'creature', 'enchantment', 'instant', 'sorcery', 'planeswalker'].find(
    (t) => t === subject,
  );
  if (type !== undefined) return (o) => (o.types as readonly string[]).includes(type);
  return subject === '' ? () => true : null;
}

/**
 * Whether casting `spell` first makes another card in the hand cheaper: it says so in its text, and
 * a nonland card of the kind it names waits in the hand. The permanent goes before the spells it
 * discounts.
 */
export function discountsHand(view: GameView, spell: ObjectView): boolean {
  const test = discounted(spell.oracleText);
  if (test === null) return false;
  return ownHand(view).some((o) => o.id !== spell.id && !isLand(o) && test(o));
}

/**
 * "Ward—Discard a card." asked of the agent (a `confirmOptional` with purpose `ward`, or
 * `counterUnlessPays`, whose cost discards): it pays to keep a spell worth three mana or more, or
 * when the cards it would discard are ones it is glad to lose (`expendable`); a life part of the
 * cost is weighed as for any ward (not at or below `PAY_LIFE_ABOVE`). Null when the cost has no
 * discard, so the usual rules answer.
 */
export function wardDiscardAnswer(view: GameView, d: ConfirmOptionalDecision): Action | null {
  const count = (d.cost ?? []).reduce((n, c) => n + (c.kind === 'discard' ? c.count : 0), 0);
  if (
    (d.purpose !== 'ward' && d.purpose !== 'counterUnlessPays' && d.purpose !== 'unlessPays') ||
    count === 0
  ) {
    return null;
  }
  const life = (d.cost ?? []).some((c) => c.kind === 'payLife');
  if (life && ownLife(view) <= PAY_LIFE_ABOVE) return { kind: 'declineOptional' };
  // D-111: nothing is kept from a counter here, only a gain for the opponent denied: pay with cards it is
  // glad to lose.
  if (d.purpose === 'unlessPays') {
    return expendable(view, ownHand(view), count)
      ? { kind: 'acceptOptional' }
      : { kind: 'declineOptional' };
  }
  const subject = d.subject === undefined ? undefined : findObject(view, d.subject);
  // A spell is not in the hand it came from, and an ability's source is not a card in hand.
  const worth = subject === undefined || subject.manaCost === null ? 3 : manaValueOf(subject);
  return worth >= 3 || expendable(view, ownHand(view), count)
    ? { kind: 'acceptOptional' }
    : { kind: 'declineOptional' };
}
