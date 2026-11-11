/**
 * The cost of attacking (CR 508.1h, D-125): "Creatures can't attack you unless their controller pays {2} for
 * each creature they control that's attacking you". Before the declaration the decision lists each taxed
 * target with the cost of one attacker and how many the mana covers now (`attackCosts`; `affordable` is a
 * floor, the engine's answer is the truth); after it the engine asks `payMana` with `purpose: 'attackTax'`.
 * The words here read those fields and nothing else.
 */
import type {
  AttackTarget,
  DeclareAttackersDecision,
  ObjectId,
  PayManaDecision,
  SeatId,
} from '@commander-arena/engine';
import { symbolsText } from './cast-cost';
import { attackTargetLabel, type Index, nameOf, plural, sameAttackTarget } from './lookup';

type AttackPick = { readonly attacker: ObjectId; readonly target: AttackTarget };

/**
 * The symbols of several payments as one cost: the generic amounts added into one ({2} and {2} is {4}) in
 * front, the colored and hybrid symbols after them in their order ({1}{R} twice is {2}{R}{R}).
 */
export function combineSymbols(symbols: readonly string[]): readonly string[] {
  const generic = symbols.reduce((n, s) => (/^\d+$/.test(s) ? n + Number(s) : n), 0);
  const rest = symbols.filter((s) => !/^\d+$/.test(s));
  return generic > 0 ? [String(generic), ...rest] : rest;
}

/** "4" for a total that is all generic mana, else the symbols: "{2}{R}{R}". Never empty ("0"). */
export function totalText(symbols: readonly string[]): string {
  const total = combineSymbols(symbols);
  if (total.length === 0) return '0';
  const [only] = total;
  return total.length === 1 && only !== undefined && /^\d+$/.test(only) ? only : symbolsText(total);
}

/** What attacking one taxed target costs and how many of the chosen attackers go there. */
export interface TaxRow {
  readonly target: AttackTarget;
  readonly label: string;
  /** The symbols one attacker pays. */
  readonly cost: readonly string[];
  /** The most attackers the mana covers now (a floor). */
  readonly affordable: number;
  /** How many of the chosen attackers attack this target. */
  readonly attackers: number;
  /** The symbols of all of them: the cost, once for each attacker. */
  readonly total: readonly string[];
  /** True when more attackers are chosen than `affordable`: the engine may refuse the declaration. */
  readonly over: boolean;
}

/** One row for each taxed target the decision lists; none when nothing is taxed. */
export function taxRows(
  decision: Pick<DeclareAttackersDecision, 'attackCosts'>,
  picks: readonly AttackPick[],
  index: Index,
  viewer: SeatId,
): readonly TaxRow[] {
  return (decision.attackCosts ?? []).map((entry) => {
    const attackers = picks.filter((p) => sameAttackTarget(p.target, entry.target)).length;
    return {
      target: entry.target,
      label: attackTargetLabel(entry.target, index, viewer),
      cost: entry.cost,
      affordable: entry.affordable,
      attackers,
      total: combineSymbols(Array.from({ length: attackers }, () => entry.cost).flat()),
      over: attackers > entry.affordable,
    };
  });
}

/** "Attacking you costs {2} for each creature. Your mana covers 1 now." */
export function taxRowText(row: TaxRow): string {
  const cover =
    row.affordable === 0
      ? 'Your mana covers none now.'
      : `Your mana covers ${plural(row.affordable, 'creature')} now.`;
  return `Attacking ${row.label} costs ${symbolsText(row.cost)} for each creature. ${cover}`;
}

/** The warning for a row with too many attackers; null when the choice fits. */
export function taxRowWarning(row: TaxRow): string | null {
  if (!row.over) return null;
  return row.affordable === 0
    ? `You cannot pay to attack ${row.label} now: choose other targets or attackers.`
    : `You can pay for ${plural(row.affordable, 'creature')} attacking ${row.label}; ${row.attackers} are chosen, and the engine refuses an attack that cannot be paid.`;
}

/** The detail line of the declare bar for the taxes that bite: the total of the chosen attack, or null. */
export function taxDetail(rows: readonly TaxRow[]): string | null {
  const taxed = rows.filter((r) => r.attackers > 0);
  if (taxed.length === 0) return null;
  const total = combineSymbols(taxed.flatMap((r) => r.total));
  const warning = taxed.map(taxRowWarning).find((w) => w !== null);
  return `This attack costs ${symbolsText(total)}.${warning === undefined ? '' : ` ${warning}`}`;
}

/**
 * The cost of one attacker out of a payment's total, when every attacker pays the same: the total's symbols
 * split evenly and each part equal. Null when the attackers pay different amounts (some are untaxed).
 */
export function perAttackerCost(
  totalCost: readonly string[],
  attackers: number,
): readonly string[] | null {
  if (attackers < 1 || totalCost.length % attackers !== 0) return null;
  const size = totalCost.length / attackers;
  const first = totalCost.slice(0, size);
  for (let i = 1; i < attackers; i += 1) {
    if (totalCost.slice(i * size, (i + 1) * size).some((s, j) => s !== first[j])) return null;
  }
  return first;
}

/**
 * The bar prompt of the payment: "Pay {2} per attacking creature (4 total) so these creatures can attack:
 * tap your mana sources." For one attacker "Pay {2} so this creature can attack: ...". When the attackers pay
 * different amounts only the total is said.
 */
export function attackTaxPrompt(d: PayManaDecision): string {
  const count = d.attacks?.length ?? 0;
  const total = symbolsText(combineSymbols(d.totalCost));
  const each = perAttackerCost(d.totalCost, count);
  const what =
    count === 1
      ? `Pay ${total} so this creature can attack`
      : each === null || count === 0
        ? `Pay ${total} so these creatures can attack`
        : `Pay ${symbolsText(each)} per attacking creature (${totalText(d.totalCost)} total) so these creatures can attack`;
  return `${what}: tap your mana sources.`;
}

/** The dock line under the cost: who attacks and what asks for the payment. */
export function attackTaxDetail(d: PayManaDecision, index: Index): string {
  const names = (d.attacks ?? []).map((a) => nameOf(index, a.attacker));
  const who = names.length === 0 ? 'The attackers' : names.join(', ');
  return `${who} will attack once this is paid. The cost is from ${nameOf(index, d.source)}.`;
}

/** The label of Cancel at the payment: it asks for the attackers again and changes nothing. */
export const ATTACK_TAX_CANCEL = 'Choose other attackers';
