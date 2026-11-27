/**
 * "Creatures can't attack you unless their controller pays {M} for each creature they control that's
 * attacking you" (CR 508.1d, 508.1h, D-125): which attacks cost mana, how much, and whether the attacking
 * player can pay it. The `attackTax` static ability is read from the derived abilities of the battlefield
 * permanents (CR 604.1), so a permanent that lost its abilities taxes nothing.
 *
 * - Whose attack: the tax is on attacking its controller (`target` a player) and, with `planeswalkers`, the
 *   planeswalkers that controller controls (CR 506.3); with `planeswalkersOnly`, only those planeswalkers. A battle is never taxed. Several taxes on the same
 *   target add up, and each attacker pays the whole of it (CR 508.1h: the total cost is the sum).
 * - Paying: at CR 508.1f the attackers are tapped, then at CR 508.1h the cost is paid, so a creature that
 *   attacks cannot tap for the mana of its own tax (unless it has vigilance). `payableAttackTax` plans the
 *   payment on the state with the attackers tapped, the same planner as every other mana payment, so Phyrexian
 *   mana may be paid with life (CR 107.4f) and the pool counts.
 * - Per counter (`perCounter`, "Each creature with one or more counters on it can't attack you ... unless its
 *   controller pays {X}, where X is the number of counters on that creature"): only a creature with a counter
 *   of any kind (CR 122.1) is taxed, and it pays the cost once for each counter on it, read as the attack is
 *   declared. The cost an attacker pays therefore depends on the attacker, not only on the target.
 * - A requirement (CR 508.1d): a player is not required to pay a cost to attack, so a creature that must
 *   attack if able and has only taxed targets is not required (`untaxedTargets`).
 */

import type { Amount, ObjectFilter } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import type { AttackTarget } from '../state/combat-types';
import { getObject } from '../state/ops';
import type { GameState } from '../state/types';
import { manaSymbolsOf } from './alt-costs';
import { amountOf } from './amounts';
import { declareAttackers } from './combat';
import { evaluateCondition } from './conditions';
import { controllerOf } from './control';
import { derive } from './derive';
import { planFor } from './mana-engine';
import { matchesFilter } from './select';

/** One permanent's tax: who controls it, what it costs for each attacker, and whether it covers planeswalkers. */
interface Tax {
  /** The permanent named as the source of the payment; null for a tax an effect made whose source is gone (the attacker stands for it). */
  readonly source: ObjectId | null;
  readonly controller: SeatId;
  readonly symbols: readonly string[];
  readonly planeswalkers: boolean;
  readonly planeswalkersOnly: boolean;
  readonly perCounter: boolean;
  /** CR 508.1h, 118.12a (`times`): the cost is paid this many times for each attacker, read as the attackers are declared. */
  readonly times?: number;
  /** CR 508.1d, 508.1h (`creaturesCantAttackYou` with `tax`): only the creatures this filter matches are taxed. */
  readonly creatures?: ObjectFilter;
}

/** What `tax` costs `attacker` (CR 508.1h): its symbols, or for a per-counter tax once for each counter on it. */
function symbolsFor(state: GameState, tax: Tax, attacker: ObjectId): readonly string[] {
  if (tax.creatures !== undefined) {
    const obj = state.objects[attacker];
    const ctx = { controller: tax.controller, source: tax.source };
    return obj !== undefined &&
      matchesFilter(state, obj, { ...tax.creatures, zone: 'battlefield' }, ctx)
      ? tax.symbols
      : [];
  }
  if (tax.times !== undefined) {
    return Array.from({ length: tax.times }, () => tax.symbols).flat();
  }
  if (!tax.perCounter) return tax.symbols;
  const counters = Object.values(state.objects[attacker]?.counters ?? {}).reduce(
    (sum, n) => sum + n,
    0,
  );
  return Array.from({ length: counters }, () => tax.symbols).flat();
}

/** Every `attackTax` ability on the battlefield, in battlefield order. */
function taxesOnBoard(state: GameState): Tax[] {
  const out: Tax[] = [];
  for (const id of state.battlefield) {
    const obj = getObject(state, id);
    for (const a of derive(state, obj).abilities) {
      if (a.kind !== 'static' || a.static.kind !== 'attackTax') continue;
      // D-133: "As long as ~ is untapped, creatures can't attack you ... unless their controller pays": the ability's own
      // condition, read as the attackers are declared.
      if (
        a.condition !== undefined &&
        !evaluateCondition(state, a.condition, { controller: controllerOf(state, obj), source: id })
      ) {
        continue;
      }
      out.push({
        source: id,
        controller: controllerOf(state, obj),
        symbols: manaSymbolsOf(a.static.cost),
        planeswalkers: a.static.planeswalkers === true || a.static.planeswalkersOnly === true,
        planeswalkersOnly: a.static.planeswalkersOnly === true,
        perCounter: a.static.perCounter === true,
        ...(a.static.times === undefined
          ? {}
          : {
              times: amountOf(
                state,
                a.static.times as Amount,
                { controller: controllerOf(state, obj), source: id },
                [],
              ),
            }),
      });
    }
  }
  // CR 508.1d, 508.1h, 611.2c (Summon: Yojimbo): "Until your next turn, creatures can't attack you unless their controller pays {2} for each of those creatures": the taxes spells and abilities made.
  for (const e of state.continuousEffects) {
    if (e.change.kind !== 'attackTaxPlayer') continue;
    out.push({
      source: e.change.source,
      controller: e.change.controller,
      symbols: e.change.symbols,
      planeswalkers: false,
      planeswalkersOnly: false,
      perCounter: false,
      creatures: e.change.filter,
    });
  }
  return out;
}

/** Whether the tax covers an attack on `target` (CR 506.3). */
function covers(state: GameState, tax: Tax, target: AttackTarget): boolean {
  // "Creatures can't attack planeswalkers you control unless ...": the controller as a player is not covered.
  if (target.kind === 'player') return !tax.planeswalkersOnly && target.seat === tax.controller;
  if (!tax.planeswalkers) return false;
  const obj = state.objects[target.object];
  return (
    obj !== undefined &&
    obj.zone === 'battlefield' &&
    controllerOf(state, obj) === tax.controller &&
    derive(state, obj).types.includes('planeswalker')
  );
}

/** The taxes on the board, for the reads below that look at several targets. */
export interface AttackTaxes {
  /** What `attacker` pays to attack `target`: the symbols of every tax that covers it (empty: free). */
  costOf(target: AttackTarget, attacker: ObjectId): string[];
  /** The first permanent that taxes `attacker` attacking `target`, or null. */
  sourceOf(target: AttackTarget, attacker: ObjectId): ObjectId | null;
}

export function attackTaxes(state: GameState): AttackTaxes {
  const taxes = taxesOnBoard(state);
  return {
    costOf: (target, attacker) =>
      taxes
        .filter((t) => covers(state, t, target))
        .flatMap((t) => [...symbolsFor(state, t, attacker)]),
    sourceOf: (target, attacker) =>
      (() => {
        const found = taxes.find(
          (t) => covers(state, t, target) && symbolsFor(state, t, attacker).length > 0,
        );
        return found === undefined ? null : (found.source ?? attacker);
      })(),
  };
}

/** The total cost of a declaration (CR 508.1h): the tax of each attack, in order of the attackers. */
export function attackTaxSymbols(
  state: GameState,
  attacks: readonly { readonly attacker: ObjectId; readonly target: AttackTarget }[],
): string[] {
  const taxes = attackTaxes(state);
  return attacks.flatMap((a) => taxes.costOf(a.target, a.attacker));
}

/** The first permanent that taxes any of the attacks: the `source` of the payment decision. */
export function firstTaxSource(
  state: GameState,
  attacks: readonly { readonly attacker: ObjectId; readonly target: AttackTarget }[],
): ObjectId | null {
  const taxes = attackTaxes(state);
  for (const a of attacks) {
    const source = taxes.sourceOf(a.target, a.attacker);
    if (source !== null) return source;
  }
  return null;
}

/**
 * The state with the attackers tapped as CR 508.1f has them (a creature with vigilance stays untapped), which
 * is the state the cost is paid in (CR 508.1h). The combat that declaring records is not wanted here.
 */
export function withAttackersTapped(
  state: GameState,
  seat: SeatId,
  attacks: readonly { readonly attacker: ObjectId; readonly target: AttackTarget }[],
): GameState {
  return declareAttackers({ ...state, pending: null }, seat, attacks).state;
}

/**
 * Whether `seat` can pay `symbols`, the cost of the attack, with the attackers tapped (CR 508.1f, 508.1h).
 * A declaration with no tax is always payable.
 */
export function payableAttackTax(
  state: GameState,
  seat: SeatId,
  attacks: readonly { readonly attacker: ObjectId; readonly target: AttackTarget }[],
): boolean {
  const symbols = attackTaxSymbols(state, attacks);
  if (symbols.length === 0) return true;
  return (
    planFor(withAttackersTapped(state, seat, attacks), seat, symbols, { ability: true }) !== null
  );
}

/** What a target costs and how many attackers it can be paid for (`DeclareAttackersDecision.attackCosts`). */
export interface AttackCost {
  readonly target: AttackTarget;
  readonly cost: readonly string[];
  readonly affordable: number;
}

/**
 * For each taxed target the candidates can attack: the cost of one attacker and the most attackers that can
 * be paid for. Counted with every candidate tapped except those with vigilance (CR 508.1f, 702.20b), which is
 * a floor: attacking with fewer leaves more mana sources untapped, so a declaration within the number is
 * always payable (`payableAttackTax` is the exact check). Targets with no tax are left out.
 */
export function attackCostsFor(
  state: GameState,
  seat: SeatId,
  candidates: readonly { readonly attacker: ObjectId; readonly targets: readonly AttackTarget[] }[],
): AttackCost[] {
  const taxes = attackTaxes(state);
  const first = candidates[0]?.targets[0];
  if (first === undefined) return [];
  const tapped = withAttackersTapped(
    state,
    seat,
    candidates.flatMap((c) =>
      c.targets[0] === undefined ? [] : [{ attacker: c.attacker, target: c.targets[0] }],
    ),
  );
  const out: AttackCost[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    for (const target of c.targets) {
      const key = JSON.stringify(target);
      if (seen.has(key)) continue;
      seen.add(key);
      // The attackers that can attack this target and what each would pay: a per-counter tax makes the cost depend
      // on the creature. `cost` is the dearest one, and `affordable` counts the dearest attackers, so a declaration
      // of that many is payable whichever creatures it holds (a floor, as above).
      const costs = candidates
        .filter((x) => x.targets.some((t) => JSON.stringify(t) === key))
        .map((x) => taxes.costOf(target, x.attacker))
        .sort((a, b) => b.length - a.length);
      const cost = costs[0] ?? [];
      if (cost.length === 0) continue;
      let affordable = 0;
      while (affordable < costs.length) {
        const symbols = costs.slice(0, affordable + 1).flat();
        if (planFor(tapped, seat, symbols, { ability: true }) === null) break;
        affordable += 1;
      }
      out.push({ target, cost, affordable });
    }
  }
  return out;
}

/**
 * CR 508.1d: the targets of a creature that attacking costs nothing for. A creature that attacks each combat
 * if able is required to attack only when one of its targets is not taxed: a player is never required to pay.
 */
export function untaxedTargets(
  state: GameState,
  attacker: ObjectId,
  targets: readonly AttackTarget[],
): readonly AttackTarget[] {
  const taxes = attackTaxes(state);
  return targets.filter((t) => taxes.costOf(t, attacker).length === 0);
}
