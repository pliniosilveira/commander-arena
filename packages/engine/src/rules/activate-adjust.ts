/**
 * What an activated ability costs as it is activated (CR 601.2f, 602.2b, D-135): the amounts of its `payLife` costs ("Pay life
 * equal to the number of colors in your commanders' color identity") worked out once, and the reduction of its generic mana
 * ("This ability costs {4} less to activate if an opponent controls four or more nonbasic lands") applied when its condition
 * holds. The result is the ability as it is put on the stack and paid, with numbers for amounts and no `costReducedIf`, so the
 * rest of the activation code (`breakDown`, `costRefusal`) reads a plain cost and the stack object shows what was paid. Used by
 * `activationRefusal` (a cost that can be paid is one the engine offers) and by `beginActivate`.
 */
import type { Cost } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import type { ActivatedAbility, GameObject, GameState } from '../state/types';
import { amountOf } from './amounts';
import { reduceGeneric } from './cast-cost';
import { evaluateCondition } from './conditions';
import { controllerOf } from './control';
import { abilityReductionSources } from './derive-statics';
import { matchesFilter } from './select';

/** CR 601.2f: the generic mana of the first mana cost goes down by `by` (never below zero); later mana costs are untouched. */
function reducedCosts(costs: readonly Cost[], by: number): readonly Cost[] {
  const at = costs.findIndex((c) => c.kind === 'mana');
  return costs.map((c, i) =>
    i === at && c.kind === 'mana' ? { ...c, symbols: reduceGeneric(c.symbols, by) } : c,
  );
}

/**
 * The ability with its costs as they stand for `seat` activating it from `source` now. The ability itself when nothing needs
 * working out (the usual case): the same object comes back.
 */
export function adjustedAbility(
  state: GameState,
  seat: SeatId,
  source: GameObject,
  ability: ActivatedAbility,
): ActivatedAbility {
  const worked = ability.cost.some((c) => c.kind === 'payLife' && typeof c.amount !== 'number');
  // D-461: the reduction of a permanent's static ability for the activated abilities of cards in a graveyard.
  const { by: staticsBy, floor } = objectsReductionFor(state, source);
  let byStatics = staticsBy;
  if (
    !worked &&
    ability.costReducedIf === undefined &&
    ability.costReducedBy === undefined &&
    byStatics === 0
  ) {
    return ability;
  }
  const ctx = { controller: seat, source: source.id };
  let cost: readonly Cost[] = ability.cost.map((c) =>
    c.kind === 'payLife' && typeof c.amount !== 'number'
      ? { ...c, amount: Math.max(0, amountOf(state, c.amount, ctx, [])) }
      : c,
  );
  const { costReducedIf, costReducedBy, ...rest } = ability;
  if (costReducedIf !== undefined && evaluateCondition(state, costReducedIf.condition, ctx)) {
    cost = reducedCosts(cost, costReducedIf.generic);
  }
  // D-139: "costs {1} less for each other artifact you control": the amount is read as the ability is activated (CR 601.2f).
  if (costReducedBy !== undefined) {
    const by = amountOf(state, costReducedBy.amount, ctx, []);
    if (by > 0) cost = reducedCosts(cost, by);
  }
  // Issue 345 (CR 601.2f): "This effect can't reduce the mana in that cost to less than one mana": the reduction of the static ability stops at the floor.
  if (byStatics > 0 && floor > 0)
    byStatics = Math.min(byStatics, Math.max(0, manaInCost(cost) - floor));
  if (byStatics > 0) cost = reducedCosts(cost, byStatics);
  return { ...rest, cost };
}

/**
 * "Activated abilities of creature cards in your graveyard cost {1} less to activate" (D-461, CR 601.2f, 118.7): how much the generic mana of an ability of `source`, a card
 * in a graveyard, goes down, from the permanents with an `abilityCostReduction` of `ofObjects` whose filter matches the card (the permanent that has the static ability is the
 * source and its controller is "you", so `controller: 'you'` is its controller's graveyard), or, with `zone: 'battlefield'`, "Activated abilities of Foods you control cost {1} less to
 * activate" (CR 602.2b). The reductions of several permanents add up. 0 for an object in any other zone.
 */
function objectsReductionFor(
  state: GameState,
  source: GameObject,
): { readonly by: number; readonly floor: number } {
  // The abilities of cards in a graveyard (D-461) and of permanents on the battlefield (Foods, CR 602.2b; with a floor, creatures, issue 345).
  if (source.zone !== 'graveyard' && source.zone !== 'battlefield') return { by: 0, floor: 0 };
  let by = 0;
  let floor = 0;
  for (const s of abilityReductionSources(state)) {
    if (s.objects === undefined) continue;
    // A reduction of the permanents' abilities names the battlefield; one of cards in a graveyard does not reach a permanent.
    if (source.zone === 'battlefield' && s.objects.zone !== 'battlefield') continue;
    const ctx = { controller: controllerOf(state, s.object), source: s.object.id };
    if (matchesFilter(state, source, s.objects, ctx)) {
      by += Math.max(0, amountOf(state, s.amount, ctx, []));
      floor = Math.max(floor, s.minTotal ?? 0);
    }
  }
  return { by, floor };
}

/** How much mana a cost has (CR 107.4): a generic number counts its value, any other symbol one, X nothing. */
function manaInCost(costs: readonly Cost[]): number {
  const mana = costs.find((c) => c.kind === 'mana');
  if (mana?.kind !== 'mana') return 0;
  return mana.symbols.reduce(
    (sum, s) => sum + (/^\d+$/u.test(s) ? Number(s) : s === 'X' ? 0 : 1),
    0,
  );
}

/**
 * "Equip abilities you activate that target enchanted creature cost {3} less to activate" (D-425, CR 601.2f, 602.2b): how much the generic mana of this ability
 * (an Equip ability, `equip: true`) goes down for `seat` activating it with these targets, from the permanents of `seat` with an `abilityCostReduction` whose
 * `targeting` filter matches one of the targets (with that permanent as "this", so `hostOfSource` is the one it is attached to). The reductions of several permanents add up.
 */
export function equipReductionFor(
  state: GameState,
  seat: SeatId,
  ability: ActivatedAbility,
  targets: readonly ObjectId[],
): number {
  if (targets.length === 0) return 0;
  let total = 0;
  for (const source of abilityReductionSources(state)) {
    if (controllerOf(state, source.object) !== seat) continue;
    const ctx = { controller: seat, source: source.object.id };
    // CR 602.2b (Professor Hojo): the first ability of the turn that targets a creature of the activator, on their own turn, whatever the ability is.
    if (source.firstTargetingYourCreature === true) {
      if (
        state.turn.activeSeat === seat &&
        !state.turnLog.activated.some((a) => a.targetedOwnCreature === seat) &&
        targets.some((id) => {
          const target = state.objects[id];
          return (
            target !== undefined &&
            matchesFilter(
              state,
              target,
              { zone: 'battlefield', types: ['creature'], controller: 'you' },
              ctx,
            )
          );
        })
      ) {
        total += amountOf(state, source.amount, ctx, []);
      }
      continue;
    }
    if (ability.equip !== true || source.targeting === undefined) continue;
    const aimed = targets.some((id) => {
      const target = state.objects[id];
      return (
        target !== undefined &&
        matchesFilter(state, target, { ...source.targeting, zone: 'battlefield' }, ctx)
      );
    });
    if (aimed) total += amountOf(state, source.amount, ctx, []);
  }
  return total;
}

/**
 * Whether a static ability could reduce the cost of this ability for some choice of targets (`equipReductionFor`): the Equip reduction of an Equip ability, the "first ability that targets a
 * creature you control" reduction of any ability of `seat` on their own turn. The question "may this be activated at all?" and the offer of targets read it (D-425).
 */
export function mayReduceByTargets(
  state: GameState,
  seat: SeatId,
  ability: ActivatedAbility,
): boolean {
  return abilityReductionSources(state).some(
    (s) =>
      controllerOf(state, s.object) === seat &&
      (s.firstTargetingYourCreature === true
        ? state.turn.activeSeat === seat &&
          !state.turnLog.activated.some((a) => a.targetedOwnCreature === seat)
        : s.targeting !== undefined && ability.equip === true),
  );
}

/** The ability with the generic mana of its cost reduced for these targets (`equipReductionFor`); the same object when nothing applies. */
export function reducedForTargets(
  state: GameState,
  seat: SeatId,
  ability: ActivatedAbility,
  targets: readonly ObjectId[],
): ActivatedAbility {
  const by = equipReductionFor(state, seat, ability, targets);
  return by > 0 ? { ...ability, cost: reducedCosts(ability.cost, by) } : ability;
}
