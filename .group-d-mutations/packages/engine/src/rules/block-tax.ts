/**
 * "As long as this creature is attacking, creatures can't block unless their controller pays {1} for each of those creatures" (CR 509.1b,
 * 509.1d, D-149): what blocking costs, and whether the defending player can pay it. The `blockTax` static ability is read from the derived
 * abilities of the battlefield permanents (CR 604.1), so a permanent that lost its abilities taxes nothing; with `whileAttacking` the permanent
 * must be a creature declared as an attacker and still in combat (CR 506.4).
 *
 * - Whose block: every creature declared as a blocker costs the whole tax to its controller (CR 509.1d: the total cost to block is locked in
 *   once the blockers are chosen). Several taxes add up.
 * - Paying: blocking does not tap the creature, so the cost is planned on the state as it is (a blocker may tap for mana to pay it, as a
 *   tapped blocker still blocks). `payableBlockTax` plans it with the same planner as every other mana payment.
 * - A requirement (CR 509.1c): a player is not required to pay a cost to block; the engine has no "blocks if able" requirement yet.
 */
import type { ObjectId, SeatId } from '../ids';
import { getObject } from '../state/ops';
import type { GameState } from '../state/types';
import { manaSymbolsOf } from './alt-costs';
import { derive } from './derive';
import { planFor } from './mana-engine';

interface Tax {
  readonly source: ObjectId;
  readonly symbols: readonly string[];
}

/** Whether the permanent is a creature declared as an attacker that is still on the battlefield and in combat (CR 506.4). */
function isAttacking(state: GameState, id: ObjectId): boolean {
  return (
    state.objects[id]?.zone === 'battlefield' &&
    (state.combat?.attackers ?? []).some((a) => a.object === id)
  );
}

/** Every `blockTax` ability in force on the battlefield, in battlefield order. */
function taxesOnBoard(state: GameState): Tax[] {
  const out: Tax[] = [];
  for (const id of state.battlefield) {
    const obj = getObject(state, id);
    for (const a of derive(state, obj).abilities) {
      if (a.kind !== 'static' || a.static.kind !== 'blockTax') continue;
      if (a.static.whileAttacking === true && !isAttacking(state, id)) continue;
      out.push({ source: id, symbols: manaSymbolsOf(a.static.cost) });
    }
  }
  return out;
}

/** What each creature that blocks costs: the symbols of every tax in force (empty: blocking is free), and the first permanent that taxes. */
export function blockTax(state: GameState): {
  readonly cost: readonly string[];
  readonly source: ObjectId | null;
} {
  const taxes = taxesOnBoard(state);
  return { cost: taxes.flatMap((t) => [...t.symbols]), source: taxes[0]?.source ?? null };
}

/** The total cost of declaring `blockers` creatures (CR 509.1d): the tax of each. */
export function blockTaxSymbols(state: GameState, blockers: number): string[] {
  const { cost } = blockTax(state);
  return Array.from({ length: blockers }, () => cost).flat();
}

/** Whether `seat` can pay for `blockers` blocking creatures. A declaration with no tax is always payable. */
export function payableBlockTax(state: GameState, seat: SeatId, blockers: number): boolean {
  const symbols = blockTaxSymbols(state, blockers);
  if (symbols.length === 0) return true;
  return planFor(state, seat, symbols, { ability: true }) !== null;
}

/** The most blockers `seat` can pay for now, at most `candidates` of them. */
export function affordableBlockers(
  state: GameState,
  seat: SeatId,
  cost: readonly string[],
  candidates: number,
): number {
  let affordable = 0;
  while (affordable < candidates) {
    const symbols = Array.from({ length: affordable + 1 }, () => cost).flat();
    if (planFor(state, seat, symbols, { ability: true }) === null) break;
    affordable += 1;
  }
  return affordable;
}
