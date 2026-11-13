/**
 * CasualAgent choices about permanents and optional abilities: what to sacrifice, in what order
 * triggers go on the stack, and whether to take a "you may". Heuristics, deliberately simple.
 */
import {
  type Action,
  type ChoosePermanentDecision,
  type ConfirmOptionalDecision,
  type Cost,
  type GameView,
  manaValue,
  type ObjectId,
  type ObjectView,
  type OrderTriggersDecision,
} from '@commander-arena/engine';
import { answerAttachToEntered } from './casual-attachments';
import { LAND_TARGET } from './casual-choices';
import { answerPairReturn } from './casual-pair';
import { answerDelayedMay } from './casual-soulbond';
import {
  effectiveCost,
  findObject,
  fixedLifeOf,
  isCreature,
  isLand,
  manaValueOf,
  ownHand,
  ownLife,
  powerOf,
  toughnessOf,
} from './casual-view';

/**
 * How much the agent wants to keep a permanent; the lowest is sacrificed first. Tokens and
 * Treasures go first (a Treasure is worth one mana, a token no card), then lands the agent does
 * not need, then the lowest mana value, counting what the permanent has grown.
 */
export function permanentValue(view: GameView, o: ObjectView): number {
  if (o.isToken) {
    // A Treasure (an artifact token, no power) is the cheapest thing to give up.
    return isCreature(o) ? 1 + powerOf(o) / 100 : 0;
  }
  if (isLand(o)) {
    const lands = view.battlefield.filter((p) => p.controller === view.viewer && isLand(p)).length;
    const wanted = Math.max(
      LAND_TARGET,
      ...ownHand(view).map((card) => (isLand(card) ? 0 : manaValueOf(card))),
    );
    // A land beyond what the hand can use is surplus; any other land is worth about a card.
    return lands > wanted ? 2 : 6;
  }
  const counters = Object.values(o.counters).reduce((sum, n) => sum + n, 0);
  return 3 + manaValueOf(o) + powerOf(o) / 100 + counters / 10 + (o.isCommander ? 50 : 0);
}

export function choosePermanentToSacrifice(view: GameView, d: ChoosePermanentDecision): Action {
  const ranked = d.legal
    .map((id, index) => {
      const o = findObject(view, id);
      return {
        id,
        index,
        value: o === undefined ? Number.POSITIVE_INFINITY : permanentValue(view, o),
      };
    })
    .sort((a, b) => a.value - b.value || a.index - b.index);
  const chosen = ranked.slice(0, d.min).map((r) => r.id);
  // Listed in the engine's order, like its own options.
  return {
    kind: 'choosePermanents',
    objects: d.legal.filter((id) => chosen.includes(id)),
  };
}

/**
 * "Blight 1" as a cost (a `choosePermanent` with `purpose: 'blight'`, D-1252, CR 701.68a): a -1/-1 counter is a permanent loss of power and toughness on a
 * creature the agent controls, so it goes where it costs least: a creature that survives it (toughness above the counters, which the view shows as it stands
 * now) before one that dies, and among those the one the agent wants least (`permanentValue`, so a token before a commander), then the first in the engine's order.
 * `counters` is how many the cost puts on it (the decision does not say, so one: the usual cost, and a safe lower bound).
 */
export function chooseBlightCreature(
  view: GameView,
  d: ChoosePermanentDecision,
  counters = 1,
): Action {
  const ranked = d.legal
    .map((id, index) => {
      const o = findObject(view, id);
      return {
        id,
        index,
        // A creature that would die loses everything it is worth; one that lives loses only some power.
        dies: o === undefined || toughnessOf(o) <= counters ? 1 : 0,
        value: o === undefined ? Number.POSITIVE_INFINITY : permanentValue(view, o),
      };
    })
    .sort((a, b) => a.dies - b.dies || a.value - b.value || a.index - b.index);
  const chosen = ranked.slice(0, d.min).map((r) => r.id);
  return { kind: 'choosePermanents', objects: d.legal.filter((id) => chosen.includes(id)) };
}

/**
 * "Tap three untapped Zombies you control" as a cost (a `choosePermanent` with `purpose: 'tap'`, D-133): nothing is
 * lost, but a tapped creature cannot attack or block, so the agent taps first the ones that cannot attack anyway (summoning
 * sick), then the ones it wants least (`permanentValue`), then the first in the engine's order.
 */
export function choosePermanentToTap(view: GameView, d: ChoosePermanentDecision): Action {
  const ranked = d.legal
    .map((id, index) => {
      const o = findObject(view, id);
      return {
        id,
        index,
        ready: o?.summoningSick === true ? 0 : 1,
        value: o === undefined ? Number.POSITIVE_INFINITY : permanentValue(view, o),
      };
    })
    .sort((a, b) => a.ready - b.ready || a.value - b.value || a.index - b.index);
  const chosen = ranked.slice(0, d.min).map((r) => r.id);
  return { kind: 'choosePermanents', objects: d.legal.filter((id) => chosen.includes(id)) };
}

/**
 * "Untap up to three lands" (a `choosePermanent` with `purpose: 'untapChoice'`, D-216, CR 701.26a): untapping is a gain, and only the agent's own
 * permanents can help it (the engine offers every tapped permanent that matches, an opponent's too), so it untaps as many of its own as it may,
 * the ones it values most first.
 */
export function chooseUntap(view: GameView, d: ChoosePermanentDecision): Action {
  const own = d.legal
    .flatMap((id, index) => {
      const o = findObject(view, id);
      return o !== undefined && o.controller === view.viewer
        ? [{ id, index, value: permanentValue(view, o) }]
        : [];
    })
    .sort((a, b) => b.value - a.value || a.index - b.index);
  const chosen = own.slice(0, d.max).map((r) => r.id);
  return { kind: 'choosePermanents', objects: d.legal.filter((id) => chosen.includes(id)) };
}

/**
 * "For each player, you choose from among the permanents that player controls an artifact, a creature, ..." (Tragic Arrogance, D-231, a `choosePermanent` with
 * `purpose: 'spare'`): the chosen permanent is the one that is not sacrificed, so the agent keeps the most valuable of its own permanents and the least valuable of
 * the other players' (`permanentValue`; on a tie the first in the engine's order).
 */
export function chooseSparedPermanent(view: GameView, d: ChoosePermanentDecision): Action {
  const mine = d.spare?.player === view.viewer;
  const ranked = d.legal
    .map((id, index) => {
      const o = findObject(view, id);
      return { id, index, value: o === undefined ? 0 : permanentValue(view, o) };
    })
    .sort((a, b) => (mine ? b.value - a.value : a.value - b.value) || a.index - b.index);
  const first = ranked[0];
  return { kind: 'choosePermanents', objects: first === undefined ? [] : [first.id] };
}

/**
 * "Return a land you control to its owner's hand" (a `choosePermanent` with `purpose: 'effect'`): the
 * agent returns a tapped permanent first, since its mana is already spent this turn and it can be
 * played again, then the one it wants least (`permanentValue`, so a surplus land before a needed
 * one), then the first in the engine's order, which is the oldest. A bounce land that has just
 * entered is tapped too, so with another tapped land the older one goes back.
 */
export function choosePermanentToReturn(view: GameView, d: ChoosePermanentDecision): Action {
  const ranked = d.legal
    .map((id, index) => {
      const o = findObject(view, id);
      return {
        id,
        index,
        tapped: o?.tapped === true ? 0 : 1,
        value: o === undefined ? Number.POSITIVE_INFINITY : permanentValue(view, o),
      };
    })
    .sort((a, b) => a.tapped - b.tapped || a.value - b.value || a.index - b.index);
  const chosen = ranked.slice(0, d.min).map((r) => r.id);
  return { kind: 'choosePermanents', objects: d.legal.filter((id) => chosen.includes(id)) };
}

/**
 * "Counter target spell unless its controller pays [cost]", asked of the agent whose spell it is
 * (purpose `counterUnlessPays`; the engine asks only when the cost can be paid). The agent pays when
 * the spell is worth at least what the cost takes (the mana in the cost, and one for every two life),
 * so it does not spend {3} to keep a one-mana spell, and, as for Ward, not when a life part of the
 * cost would leave it in danger (`PAY_LIFE_ABOVE`). A subject that is not a card (an ability) is
 * always worth paying for.
 */
function payToKeepSpell(d: ConfirmOptionalDecision, view: GameView): Action {
  const life = (d.cost ?? []).reduce((sum, c) => sum + fixedLifeOf(c), 0);
  if (life > 0 && ownLife(view) <= PAY_LIFE_ABOVE) return { kind: 'declineOptional' };
  const mana = manaValue((d.cost ?? []).flatMap((c) => (c.kind === 'mana' ? c.symbols : [])));
  const subject = d.subject === undefined ? undefined : findObject(view, d.subject);
  if (subject === undefined || subject.manaCost === null) return { kind: 'acceptOptional' };
  return manaValueOf(subject) >= mana + Math.ceil(life / 2)
    ? { kind: 'acceptOptional' }
    : { kind: 'declineOptional' };
}

/**
 * How much the agent wants to keep one of several legendary permanents with the same name (CR
 * 704.5j): each counter and each Aura or Equipment on it counts one, then a permanent that is not
 * summoning sick, then an untapped one, then a card over a token (a token that goes to the
 * graveyard is gone, and a token is lost to any bounce). Deliberately simple.
 */
export function legendValue(o: ObjectView | undefined): number {
  if (o === undefined) return Number.NEGATIVE_INFINITY;
  const counters = Object.values(o.counters).reduce((sum, n) => sum + n, 0);
  return (
    counters +
    (o.attachments?.length ?? 0) +
    (o.summoningSick ? 0 : 0.5) +
    (o.tapped ? 0 : 0.25) +
    (o.isToken ? 0 : 0.1)
  );
}

/**
 * The legend rule (CR 704.5j): keep the permanent with the highest `legendValue`; on a tie the
 * first in the engine's list, which is the oldest. The others go to the graveyard.
 */
export function chooseLegendToKeep(view: GameView, d: ChoosePermanentDecision): Action {
  let best: ObjectId | undefined;
  let bestValue = Number.NEGATIVE_INFINITY;
  for (const id of d.legal) {
    const value = legendValue(findObject(view, id));
    if (best === undefined || value > bestValue) {
      best = id;
      bestValue = value;
    }
  }
  return { kind: 'choosePermanents', objects: best === undefined ? [] : [best] };
}

/** Triggers go on the stack in the order the engine lists them. */
export function orderTriggersAsListed(d: OrderTriggersDecision): Action {
  return { kind: 'orderTriggers', order: d.triggers.map((_, i) => i) };
}

/** "You may ... sacrifice / pay / discard / lose" costs something; everything else is free. */
const COSTLY_OPTION = /you may[^.]*\b(sacrifice|pay|discard|lose|exile)\b/i;

/**
 * A shock land's "you may pay 2 life" (a decision with `cost`) is worth it while life is plentiful:
 * the land enters untapped and the mana is there this turn, but a low life total is worth more than
 * a tempo. The agent pays when its life is above this, which leaves it above 8 after any cost the
 * engine offers today (2 to 3 life).
 */
export const PAY_LIFE_ABOVE = 10;

/**
 * "You may pay {W/B}. If you do, each opponent loses 1 life and you gain that much" (Extort, CR 702.101a,
 * purpose `mayPay`): asked only when the agent can pay. It pays when the mana is spare: no card in its hand
 * that it could cast with the untapped lands it has now would become too dear with one fewer; a life part
 * of the cost is weighed as for any ward (`PAY_LIFE_ABOVE`). The agent counts untapped lands only, so it
 * pays less readily than it could, never more.
 */
function payForEffect(d: ConfirmOptionalDecision, view: GameView): Action {
  // "You may pay {1}{R}. If you do, creatures attacking your opponents and/or planeswalkers they control get +2/+0" (D-218, CR 508.1b): worth paying only when
  // some creature of the agent is attacking, not when the opponent declared the attack.
  if (/creatures attacking your opponents/i.test(d.sourceOracleText)) {
    const attacking = (view.combat?.attackers ?? []).some(
      (a) => findObject(view, a.object)?.controller === view.viewer,
    );
    if (!attacking) return { kind: 'declineOptional' };
  }
  const life = (d.cost ?? []).reduce((sum, c) => sum + fixedLifeOf(c), 0);
  if (life > 0 && ownLife(view) - life <= PAY_LIFE_ABOVE) return { kind: 'declineOptional' };
  const mana = manaValue((d.cost ?? []).flatMap((c) => (c.kind === 'mana' ? c.symbols : [])));
  const lands = view.battlefield.filter(
    (o) => o.controller === view.viewer && isLand(o) && !o.tapped,
  ).length;
  const needed = ownHand(view).some((card) => {
    if (isLand(card) || card.manaCost === null) return false;
    const cost = effectiveCost(card);
    return cost <= lands && cost > lands - mana;
  });
  return needed ? { kind: 'declineOptional' } : { kind: 'acceptOptional' };
}

/**
 * What one way of paying an additional cost to cast a spell costs the agent (D-181, CR 118.8): mana is the cheapest (what is not spent is wasted
 * if nothing else is cast), then a card from the hand or life (more when it would leave the agent in danger), and a permanent the dearest.
 */
function additionalCostWeight(costs: readonly Cost[] | undefined, view: GameView): number {
  let weight = 0;
  for (const c of costs ?? []) {
    if (c.kind === 'mana') weight += 1;
    else if (c.kind === 'discard') weight += 2;
    else if (c.kind === 'payLife') weight += ownLife(view) <= PAY_LIFE_ABOVE ? 6 : 2;
    else weight += 4;
  }
  return weight;
}

/** "Sacrifice an artifact or creature or pay {4}": accept the first way unless the second is the cheaper one (a tie keeps the first). */
function chooseAdditionalCost(d: ConfirmOptionalDecision, view: GameView): Action {
  return additionalCostWeight(d.otherCost, view) < additionalCostWeight(d.cost, view)
    ? { kind: 'declineOptional' }
    : { kind: 'acceptOptional' };
}

export function confirmOptional(d: ConfirmOptionalDecision, view: GameView): Action {
  // "You may cast that card without paying its mana cost" (Cascade, CR 702.85a): a free spell, always.
  if (d.purpose === 'cascade') return { kind: 'acceptOptional' };
  // "You may reveal a Mountain or Plains card from your hand. If you don't, it enters tapped" (D-208, CR 701.20): revealing costs nothing but information, and the land
  // enters untapped, so the agent always does.
  if (d.reveal !== undefined) return { kind: 'acceptOptional' };
  if (d.purpose === 'mayPay') return payForEffect(d, view);
  // "Its controller may search their library for a basic land card ..." (CR 701.23a): asked of the
  // agent when it is the one who would search, on its own spell or on an opponent's. A card found is
  // free, and so is the shuffle.
  if (d.purpose === 'search') return { kind: 'acceptOptional' };
  if (d.purpose === 'counterUnlessPays') return payToKeepSpell(d, view);
  if (d.purpose === 'ward' || d.purpose === 'unlessPays') {
    // D-111: "[do something] unless that player pays [cost]" (a draw trigger of an opponent's permanent,
    // say) is answered as Ward is: what the agent pays is small and what it declines to pay for is a
    // gain for the opponent, so it pays unless the life part of the cost would put it in danger.
    // Ward (CR 702.21a): the engine asks only the controller of the spell or ability, and only when
    // the cost can be paid. The agent keeps its spell: it pays, unless a life part of the cost would
    // leave it in danger (PAY_LIFE_ABOVE, as for a shock land).
    const life = d.cost?.some((c) => c.kind === 'payLife') === true;
    return life && ownLife(view) <= PAY_LIFE_ABOVE
      ? { kind: 'declineOptional' }
      : { kind: 'acceptOptional' };
  }
  if (d.purpose === 'kicker') {
    // Kicker (CR 702.33a): the engine asks only when the kicked total can be paid, so the mana is
    // there; a kicked spell is a better spell, so the agent pays it. A life part of the cost is
    // weighed like a shock land's (PAY_LIFE_ABOVE): not when it would leave the agent in danger.
    const life = d.cost?.some((c) => c.kind === 'payLife') === true;
    return life && ownLife(view) <= PAY_LIFE_ABOVE
      ? { kind: 'declineOptional' }
      : { kind: 'acceptOptional' };
  }
  if (d.purpose === 'costChoice') return chooseAdditionalCost(d, view);
  // D-272: "You may return those cards to the battlefield under their owners' control" (Dawnbreak Reclaimer).
  if (d.purpose === 'pairReturn') return answerPairReturn(view, d);
  if (d.cost !== undefined) {
    // Only life payments exist here; any other cost is not weighed, so the agent declines it.
    const onlyLife = d.cost.every((c) => c.kind === 'payLife');
    return onlyLife && ownLife(view) > PAY_LIFE_ABOVE
      ? { kind: 'acceptOptional' }
      : { kind: 'declineOptional' };
  }
  // D-1251: "Whenever a creature enters, you may attach this Aura to that creature": onto the agent's own new creature, not an opponent's.
  const attach = answerAttachToEntered(view, d);
  if (attach !== null) return attach;
  // D-284: read the ability on the stack, not the text of the creature it belongs to (a granted ability is not in that text).
  const delayed = answerDelayedMay(view, d);
  if (delayed !== null) return delayed;
  return COSTLY_OPTION.test(d.sourceOracleText)
    ? { kind: 'declineOptional' }
    : { kind: 'acceptOptional' };
}
