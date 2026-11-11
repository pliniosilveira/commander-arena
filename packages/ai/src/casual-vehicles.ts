/**
 * CasualAgent and Vehicles (CR 301.7, 702.122). The agent crews a Vehicle for one reason only: to
 * attack with it. It never crews to block (a crewed Vehicle keeps its crew tapped through the
 * opponent's turn, so crewing on defense would cost the blockers it uses), and never crews at any
 * other time. The rule, applied in the precombat main phase of the agent's own turn, once per
 * Vehicle per turn (the loop guard of `casual-activations.ts`):
 *
 * - the Vehicle is untapped, is not a creature yet, and could attack if it were one: it did not
 *   arrive this turn (`wouldBeSummoningSick` is absent, CR 302.6);
 * - it would be a safe attack as a creature with its printed power and toughness (`printedPt`),
 *   the same test the agent applies to a creature it declares as an attacker
 *   (`isSafeAttack`, casual-combat.ts);
 * - the agent has spare creatures: untapped creatures of its own that it would not attack with
 *   anyway (summoning sick, defender, no power, or not a safe attack) and that are not Vehicles,
 *   whose total power reaches the crew cost, every one of them with less power than the Vehicle.
 *
 * When the engine asks which creatures to tap (a `choosePermanent` with `purpose: 'crew'`) the agent
 * answers with the fewest spare creatures that reach the cost, most powerful first, dropping any
 * that turn out not to be needed; if the spare ones are not enough (the question was not one the
 * agent started) it taps the permanents it values least until the total power is reached. The
 * answer always meets `minTotalPower`, so the engine never refuses it.
 *
 * Deliberately weak, like the rest of this agent: it does not weigh the creatures it leaves home
 * as blockers, other costs of a crewed Vehicle, or a Vehicle already animated by another effect.
 */
import type {
  Action,
  ActivatedAbility,
  ChoosePermanentDecision,
  GameView,
  ObjectId,
  ObjectView,
  PriorityOption,
} from '@commander-arena/engine';
import { isSafeAttack } from './casual-combat';
import { permanentValue } from './casual-permanents';
import { findObject, hasKeyword, isCreature, powerOf } from './casual-view';

type ActivateOption = Extract<PriorityOption, { kind: 'activate' }>;

export const isVehicle = (o: ObjectView): boolean => o.subtypes.includes('Vehicle');

/** N of "Crew N" when the ability is a crew ability (its whole cost is the creature tap), else null. */
export function crewNeed(ability: ActivatedAbility): number | null {
  const [cost, ...rest] = ability.cost;
  return cost?.kind === 'tapCreatures' && rest.length === 0 ? cost.totalPower : null;
}

/** The Vehicle as the creature it would be once crewed (CR 301.7b): its printed power and toughness. */
function asCrewedCreature(vehicle: ObjectView): ObjectView | null {
  const printed = vehicle.printedPt;
  if (printed === undefined) return null;
  return {
    ...vehicle,
    types: [...vehicle.types, 'creature'],
    power: printed.power,
    toughness: printed.toughness,
  };
}

/**
 * Whether `o` is one of the agent's creatures that would stay home this turn: it cannot attack, or
 * the agent would not send it. A Vehicle is never spare (it is the thing being crewed).
 */
function isSpare(view: GameView, o: ObjectView): boolean {
  if (o.controller !== view.viewer || o.tapped || !isCreature(o) || isVehicle(o)) return false;
  return o.summoningSick || hasKeyword(o, 'defender') || powerOf(o) <= 0 || !isSafeAttack(view, o);
}

/**
 * The fewest of `pool` that reach `need` total power: the most powerful first, then any that are not
 * needed dropped, weakest first. Null when the whole pool is not enough. `power` reads each power.
 */
function fewestReaching<T>(
  pool: readonly T[],
  need: number,
  power: (item: T) => number,
): T[] | null {
  const ranked = pool
    .map((item, index) => ({ item, index, power: power(item) }))
    .filter((x) => x.power > 0)
    .sort((a, b) => b.power - a.power || a.index - b.index);
  const taken: typeof ranked = [];
  let total = 0;
  for (const x of ranked) {
    if (total >= need) break;
    taken.push(x);
    total += x.power;
  }
  if (total < need) return null;
  for (const x of [...taken].reverse()) {
    if (total - x.power >= need) {
      taken.splice(taken.indexOf(x), 1);
      total -= x.power;
    }
  }
  return taken.sort((a, b) => a.index - b.index).map((x) => x.item);
}

/** The spare creatures to crew with, or null when there are not enough (see the file comment). */
function sparePlan(view: GameView, vehicle: ObjectView, need: number): ObjectView[] | null {
  const power = vehicle.printedPt?.power ?? 0;
  const spare = view.battlefield.filter((o) => isSpare(view, o) && powerOf(o) < power);
  return fewestReaching(spare, need, powerOf);
}

/** The crew activation to make now, among the fresh `options`, or undefined. */
export function chooseCrewActivation(
  view: GameView,
  options: readonly ActivateOption[],
): ActivateOption | undefined {
  if (view.step !== 'precombatMain' || view.activeSeat !== view.viewer) return undefined;
  return options.find((o) => {
    const vehicle = findObject(view, o.object);
    const ability = vehicle?.activated?.find((a) => a.abilityIndex === o.abilityIndex)?.ability;
    const need = ability === undefined ? null : crewNeed(ability);
    if (vehicle === undefined || need === null) return false;
    if (vehicle.zone !== 'battlefield' || vehicle.controller !== view.viewer) return false;
    if (vehicle.tapped || isCreature(vehicle) || vehicle.wouldBeSummoningSick === true)
      return false;
    const crewed = asCrewedCreature(vehicle);
    if (crewed === null || powerOf(crewed) <= 0 || !isSafeAttack(view, crewed)) return false;
    return sparePlan(view, vehicle, need) !== null;
  });
}

/** The creatures to tap for a crew cost (a `choosePermanent` with `purpose: 'crew'`); always enough. */
export function chooseCrewCreatures(view: GameView, d: ChoosePermanentDecision): Action {
  const need = d.minTotalPower ?? 1;
  const power = (id: ObjectId): number => d.powers?.[id] ?? 0;
  const known = d.legal.flatMap((id) => {
    const o = findObject(view, id);
    return o === undefined ? [] : [o];
  });
  const spare = known.filter((o) => isSpare(view, o));
  const chosen =
    fewestReaching(spare, need, (o) => power(o.id)) ??
    // Not a crew the agent planned: tap what it values least until the cost is reached.
    cheapestReaching(view, known, need, power);
  // If even that falls short (the view lacks a creature), every legal creature is the safe answer.
  const ids: readonly ObjectId[] = chosen === null ? d.legal : chosen.map((o) => o.id);
  return { kind: 'choosePermanents', objects: d.legal.filter((id) => ids.includes(id)) };
}

/** The permanents the agent values least, in that order, until their total power reaches `need`. */
function cheapestReaching(
  view: GameView,
  pool: readonly ObjectView[],
  need: number,
  power: (id: ObjectId) => number,
): ObjectView[] | null {
  const ranked = pool
    .map((o, index) => ({ o, index, value: permanentValue(view, o) }))
    .sort((a, b) => a.value - b.value || a.index - b.index);
  const taken: ObjectView[] = [];
  let total = 0;
  for (const x of ranked) {
    if (total >= need) break;
    taken.push(x.o);
    total += power(x.o.id);
  }
  return total >= need ? taken : null;
}
