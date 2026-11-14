/**
 * The mana abilities a permanent has and what using one takes (CR 605, 118, 602.5): which of them it
 * has now, whether its {T}, sacrifice and life costs can be paid and its restriction ("Activate only
 * if ...") holds, what it makes, and paying those costs. The mana cost of an ability, the pool and the
 * payment planner are in `mana-engine.ts` and `mana-sources.ts`.
 */
import type { ManaAbility, ManaProduction, ObjectFilter } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import type { PaymentSource } from '../mana';
import type { ManaColor } from '../mana/types';
import type { GameEvent } from '../state/events';
import { getSeat, loseLifeBy, patchObject } from '../state/ops';
import type { GameObject, GameState } from '../state/types';
import { evaluateCondition } from './conditions';
import { controlledSince, controllerOf } from './control';
import { derive } from './derive';
import { hasKeyword } from './keywords';
import { effectiveManaAbility, isCombinationProduction, productionOutcomes } from './mana-outcomes';
import { manaValueOfCost } from './mana-value';
import { millCards } from './mill';
import { sacrificeCandidates, sacrificePermanent } from './sacrifice';

export function manaAbilitiesOf(
  state: GameState,
  obj: GameObject,
): { abilityIndex: number; ability: ManaAbility }[] {
  const out: { abilityIndex: number; ability: ManaAbility }[] = [];
  derive(state, obj).abilities.forEach((a, abilityIndex) => {
    // D-145: what the ability makes now ("... add two mana of any one color instead").
    if (a.kind === 'mana') out.push({ abilityIndex, ability: effectiveManaAbility(state, obj, a) });
  });
  return out;
}

/**
 * CR 302.6 (Creatures): a creature's {T} ability can't be activated unless its controller has
 * controlled it continuously since their most recent turn began, unless it has haste.
 */
export function isSummoningSick(state: GameState, obj: GameObject): boolean {
  if (!derive(state, obj).types.includes('creature')) return false;
  return wouldBeSummoningSick(state, obj);
}

/**
 * Whether `obj` would be summoning sick (CR 302.6) if it were a creature: its controller has not
 * controlled it continuously since their most recent turn began, and it has no haste (CR 702.10b,
 * 702.10c). The test for a permanent that may become a creature, such as a crewed Vehicle: it
 * cannot attack the turn it arrives, crewed or not.
 */
export function wouldBeSummoningSick(state: GameState, obj: GameObject): boolean {
  if (hasKeyword(state, obj, 'haste')) return false; // CR 702.10b, 702.10c
  // CR 302.6 (D-189): since the permanent came under the control of the player who has it now, which a control-changing effect moves.
  return controlledSince(state, obj) > getSeat(state, controllerOf(state, obj)).turnStartTimestamp;
}

export function canTapForMana(state: GameState, obj: GameObject, seat: SeatId): boolean {
  if (obj.zone !== 'battlefield' || controllerOf(state, obj) !== seat || obj.tapped) return false;
  return !isSummoningSick(state, obj);
}

export const hasCost = (ability: ManaAbility, kind: 'tap' | 'sacrifice'): boolean =>
  ability.cost.some((c) => c.kind === kind);

/**
 * The kind of permanent the ability's cost sacrifices when it is not the permanent itself ("Sacrifice a Spirit: Add {R}.", D-216, CR 605.3b, 701.21a),
 * or null: the cost sacrifices the permanent itself, or there is none.
 */
export function sacrificeFilterOf(ability: ManaAbility): ObjectFilter | null {
  for (const c of ability.cost) {
    if (c.kind === 'sacrifice' && !('kind' in c.what)) return c.what;
  }
  return null;
}

/**
 * The permanents the player may choose to sacrifice for the cost of a mana ability that sacrifices a kind of permanent ("Sacrifice a Spirit: Add {R}.", D-222,
 * CR 118.3, 601.2b, 605.3b, 701.21a): empty for an ability whose cost sacrifices nothing or only itself (a Treasure), which has no choice to make.
 */
export function manaSacrificeCandidates(
  state: GameState,
  seat: SeatId,
  source: ObjectId,
  ability: ManaAbility,
): readonly ObjectId[] {
  const kind = sacrificeFilterOf(ability);
  return kind === null ? [] : sacrificeCandidates(state, seat, source, kind);
}

/**
 * The permanent a mana ability sacrifices as its cost (D-216, CR 605.3b: costs are paid as it is activated, so the player chooses). `preferred` is the
 * one the player named, when it is a legal choice; otherwise the engine picks the one the player would give up first: a token before a card, then the
 * lowest mana value, then the oldest. That default is what `payAuto` uses (the planner pays for the player, who can pay by hand to choose: D-222); a mana
 * ability the player activates or taps by hand with more than one candidate must name the permanent (`activateManaAbility`). Null when there is nothing to sacrifice.
 */
export function manaSacrificeChoice(
  state: GameState,
  seat: SeatId,
  source: ObjectId,
  filter: ObjectFilter,
  preferred?: ObjectId,
): ObjectId | null {
  const candidates = sacrificeCandidates(state, seat, source, filter);
  if (preferred !== undefined && candidates.includes(preferred)) return preferred;
  const rank = (id: ObjectId): [number, number, number] => {
    const obj = state.objects[id];
    if (obj === undefined) return [2, 2, Number.POSITIVE_INFINITY];
    // The permanent that makes the mana is the last one the player would give up.
    return [
      id === source ? 1 : 0,
      obj.token !== undefined ? 0 : 1,
      manaValueOfCost(derive(state, obj).manaCost, obj),
    ];
  };
  const sorted = candidates
    .map((id, index) => ({ id, index, rank: rank(id) }))
    .sort(
      (a, b) =>
        a.rank[0] - b.rank[0] ||
        a.rank[1] - b.rank[1] ||
        a.rank[2] - b.rank[2] ||
        a.index - b.index,
    );
  return sorted[0]?.id ?? null;
}

/** The symbols of the mana part of the ability's cost ("{1}" of "{1}, {T}"), empty when it has none. */
export function manaCostSymbols(ability: ManaAbility): string[] {
  return ability.cost.flatMap((c) => (c.kind === 'mana' ? c.symbols : []));
}

/** The life the ability's cost makes its controller pay ("Pay 1 life", CR 119.4, 605.3). */
export function lifeCostOf(ability: ManaAbility): number {
  return ability.cost.reduce(
    (n, c) => n + (c.kind === 'payLife' && typeof c.amount === 'number' ? c.amount : 0),
    0,
  );
}

/** The cards the ability's cost mills from its controller's library ("Mill a card", CR 701.17, D-208). */
export function millCostOf(ability: ManaAbility): number {
  return ability.cost.reduce((n, c) => n + (c.kind === 'mill' ? c.count : 0), 0);
}

export const showCost = (symbols: readonly string[]): string =>
  symbols.map((s) => `{${s}}`).join('');

/**
 * The color an outcome of a choice of color stands for: the one mana (`[G]`), or several mana of the one color the player picked ("two mana
 * of any one color", D-145: `[G, G]`). Null for an outcome that has no mana or mixes colors.
 */
export function outcomeColor(outcome: readonly ManaColor[]): ManaColor | null {
  const first = outcome[0];
  return first !== undefined && outcome.every((m) => m === first) ? first : null;
}

/** True when the production lets the player pick one color (any color, a list, the identity, "could produce"). */
export function isColorChoice(production: ManaProduction): boolean {
  return !isCombinationProduction(production) && production.kind !== 'fixed';
}

/**
 * CR 602.5b: "Activate only if you control a Swamp." is read for the permanent's controller, with the
 * permanent as the source, when the ability is activated. An ability with no restriction always passes.
 */
export function activationAllowed(
  state: GameState,
  obj: GameObject,
  ability: ManaAbility,
): boolean {
  return (
    ability.activateOnlyIf === undefined ||
    evaluateCondition(state, ability.activateOnlyIf, {
      controller: controllerOf(state, obj),
      source: obj.id,
    })
  );
}

/**
 * Whether the seat can pay the {T}, sacrifice and life costs of this mana ability now and may
 * activate it (CR 605.3, 118, 602.5b). A {T} cost needs an untapped permanent that is not a
 * summoning-sick creature (CR 302.6, 602.5a); a sacrifice cost needs a permanent the seat controls
 * (CR 701.21a); life can be paid only if the life total is at least the amount (CR 119.4); a
 * restriction on activating must hold. An ability with none of these costs (a Gold token's "Sacrifice
 * this token: Add one mana of any color") needs only the permanent itself. Its mana cost, if any, is
 * not looked at here.
 */
export function canPayPhysicalCosts(
  state: GameState,
  obj: GameObject,
  ability: ManaAbility,
  seat: SeatId,
): boolean {
  return physicalRefusal(state, obj, ability, seat) === null;
}

/** Why the seat cannot use the ability now for a reason `canPayPhysicalCosts` looks at, or null. */
export function physicalRefusal(
  state: GameState,
  obj: GameObject,
  ability: ManaAbility,
  seat: SeatId,
): string | null {
  const name = derive(state, obj).name;
  if (obj.zone !== 'battlefield' || controllerOf(state, obj) !== seat)
    return `${name} is not yours`;
  if (hasCost(ability, 'tap') && !canTapForMana(state, obj, seat)) {
    return `${name} is tapped or summoning sick`;
  }
  const life = lifeCostOf(ability);
  if (life > getSeat(state, seat).life) return `you have less than ${life} life to pay`;
  // CR 701.17b, 118.3: a cost that mills more cards than the library holds cannot be paid.
  const mill = millCostOf(ability);
  if (mill > getSeat(state, seat).library.length)
    return `you have fewer than ${mill} cards in your library to mill`;
  // CR 701.21a, 118.3: "Sacrifice a Spirit" needs a permanent of the kind that the seat controls.
  const kind = sacrificeFilterOf(ability);
  if (kind !== null && sacrificeCandidates(state, seat, obj.id, kind).length === 0) {
    return `you control nothing to sacrifice for ${name}`;
  }
  if (!activationAllowed(state, obj, ability))
    return `${name} can be activated only if its condition holds`;
  return null;
}

/**
 * Pays the {T}, sacrifice and life costs of a mana ability (CR 605.3b: costs are paid as it is
 * activated). The sacrifice emits `sacrificed` after the zone change (CR 701.21). A mana cost is
 * not paid here: by hand it comes out of the pool first (`activateManaAbility`), and the payment
 * planner pays it as part of a plan. Paying life is losing it (CR 119.4): it may take the life total
 * to 0, which state-based actions then see (CR 704.5a).
 */
export function payManaAbilityCosts(
  state: GameState,
  seat: SeatId,
  id: ObjectId,
  ability: ManaAbility,
  /** The permanent a cost "Sacrifice a Spirit" gives up, when the player named it (D-216); the engine chooses otherwise. */
  sacrifice?: ObjectId,
): { state: GameState; events: GameEvent[] } {
  let next = state;
  const events: GameEvent[] = [];
  if (hasCost(ability, 'tap')) {
    next = patchObject(next, id, { tapped: true });
    events.push({ kind: 'tapped', object: id });
    // CR 106.12 (D-189): tapping a permanent for mana is activating its mana ability with {T} in the cost; "whenever an opponent taps an artifact
    // for mana" reads it (the sacrifice below, as a Treasure's, is part of the same ability).
    events.push({ kind: 'tappedForMana', object: id, seat });
  }
  const life = lifeCostOf(ability);
  if (life > 0) {
    const from = getSeat(next, seat).life;
    next = loseLifeBy(next, seat, life);
    events.push({ kind: 'lifeChanged', seat, from, to: from - life });
  }
  const mill = millCostOf(ability);
  if (mill > 0) {
    const milled = millCards(next, seat, mill);
    next = milled.state;
    events.push(...milled.events);
  }
  if (hasCost(ability, 'sacrifice')) {
    const kind = sacrificeFilterOf(ability);
    const given = kind === null ? id : manaSacrificeChoice(next, seat, id, kind, sacrifice);
    const sacrificed = given === null ? null : sacrificePermanent(next, given, seat);
    if (sacrificed) {
      next = sacrificed.state;
      events.push(...sacrificed.events);
    }
  }
  return { state: next, events };
}

/** The life the extra effects of this ability take from its controller (damage and life loss). */
function lifeLossOf(ability: ManaAbility): number {
  let loss = 0;
  for (const e of ability.also ?? []) {
    if (e.kind === 'dealDamage' || e.kind === 'loseLife') {
      if (typeof e.amount === 'number') loss += e.amount;
    }
  }
  return loss;
}

/** The life a plan loses by activating the ability: the life it costs and the damage it deals to you. */
export const lifeLossOfActivating = (ability: ManaAbility): number =>
  lifeCostOf(ability) + lifeLossOf(ability);

function tierOf(state: GameState, obj: GameObject): PaymentSource['tier'] {
  const types = derive(state, obj).types;
  if (types.includes('land')) return 'land';
  if (types.includes('creature')) return 'creature';
  return 'artifact';
}

/** SPEC 10: lands first, then creatures, then artifacts, and sacrificing last. */
export function tierOfAbility(
  state: GameState,
  obj: GameObject,
  ability: ManaAbility,
): PaymentSource['tier'] {
  return hasCost(ability, 'sacrifice') ? 'sacrifice' : tierOf(state, obj);
}

/**
 * What the player picks as a mana ability is activated (CR 605.3b), one entry per outcome that makes
 * mana: a color for a choice of color, a combination for a combination, neither when the ability
 * makes one thing ("{T}: Add {G}", "{T}: Add {C}{C}").
 */
export function activationChoices(
  state: GameState,
  obj: GameObject,
  ability: ManaAbility,
): { color: ManaColor | null; combination?: readonly ManaColor[] }[] {
  const out: { color: ManaColor | null; combination?: readonly ManaColor[] }[] = [];
  for (const outcome of productionOutcomes(state, obj, ability)) {
    if (outcome.length === 0) continue;
    if (isCombinationProduction(ability.production))
      out.push({ color: null, combination: outcome });
    else out.push({ color: isColorChoice(ability.production) ? outcomeColor(outcome) : null });
  }
  return out;
}
