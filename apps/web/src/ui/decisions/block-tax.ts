/**
 * The cost of blocking (CR 509.1d, D-149): "Creatures can't block unless their controller pays {1} for each of those creatures".
 * Before the declaration the decision says what one blocker costs and how many the mana covers now (`blockCost`: `affordable` is
 * exact for mana from lands and a floor for mana from the blockers themselves, which may tap for it); after it the engine asks
 * `payMana` with `purpose: 'blockTax'`. The mirror of the cost of attacking (`attack-tax.ts`); the words read those fields and
 * nothing else. A declaration with more blockers than `affordable` is refused by the engine, so Confirm waits for one that fits.
 */
import type { DeclareBlockersDecision, PayManaDecision } from '@commander-arena/engine';
import { combineSymbols, perAttackerCost, totalText } from './attack-tax';
import type { BlockPick } from './block';
import { symbolsText } from './cast-cost';
import { type Index, nameOf, plural } from './lookup';

/** What blocking costs and how many of the chosen blockers pay it. */
export interface BlockCostRow {
  /** The symbols one blocker pays. */
  readonly cost: readonly string[];
  /** The most blockers the mana covers now. */
  readonly affordable: number;
  /** The permanent that taxes blocking (named in the words). */
  readonly sourceName: string;
  /** How many blockers are chosen. */
  readonly blockers: number;
  /** The symbols of all of them: the cost, once for each blocker. */
  readonly total: readonly string[];
  /** True when more blockers are chosen than `affordable`: the engine refuses the declaration. */
  readonly over: boolean;
}

/** The row for the chosen blocks; null when nothing taxes blocking. */
export function blockCostRow(
  decision: Pick<DeclareBlockersDecision, 'blockCost'>,
  blocks: readonly Pick<BlockPick, 'blocker'>[],
  index: Index,
): BlockCostRow | null {
  const info = decision.blockCost;
  if (info === undefined) return null;
  const blockers = new Set(blocks.map((b) => b.blocker)).size;
  return {
    cost: info.cost,
    affordable: info.affordable,
    sourceName: nameOf(index, info.source),
    blockers,
    total: combineSymbols(Array.from({ length: blockers }, () => info.cost).flat()),
    over: blockers > info.affordable,
  };
}

/** "Blocking costs {1} per creature (Archangel of Tithes). Your mana covers 1 creature now." */
export function blockCostText(row: BlockCostRow): string {
  const cover =
    row.affordable === 0
      ? 'Your mana covers none now.'
      : `Your mana covers ${plural(row.affordable, 'creature')} now.`;
  return `Blocking costs ${symbolsText(combineSymbols(row.cost))} per creature (${row.sourceName}). ${cover}`;
}

/** The warning for too many blockers; null when the choice fits. */
export function blockCostWarning(row: BlockCostRow): string | null {
  if (!row.over) return null;
  return row.affordable === 0
    ? `You cannot pay to block now: declare no blockers, or free some mana.`
    : `You can pay for ${plural(row.affordable, 'blocking creature')}; ${row.blockers} are chosen. Release a blocker to continue.`;
}

/** The detail line of the declare bar: "These blocks cost {2}." with the warning, or null when no creature is chosen. */
export function blockCostDetail(row: BlockCostRow | null): string | null {
  if (row === null || row.blockers === 0) return null;
  const warning = blockCostWarning(row);
  return `These blocks cost ${symbolsText(row.total)}.${warning === null ? '' : ` ${warning}`}`;
}

/** Why Confirm is disabled for the cost, or null when the blocks can be paid. */
export function blockCostHint(row: BlockCostRow | null): string | null {
  if (row === null || !row.over) return null;
  return row.affordable === 0
    ? 'You cannot pay for any blocker'
    : `You can pay for at most ${plural(row.affordable, 'blocker')}`;
}

/**
 * The bar prompt of the payment: "Pay {1} per blocking creature ({2} total) so these creatures can block: tap your mana sources."
 * For one blocker "Pay {1} so this creature can block: ...".
 */
export function blockTaxPrompt(d: PayManaDecision): string {
  const count = d.blocks?.length ?? 0;
  const total = symbolsText(combineSymbols(d.totalCost));
  const each = perAttackerCost(d.totalCost, count);
  const what =
    count === 1
      ? `Pay ${total} so this creature can block`
      : each === null || count === 0
        ? `Pay ${total} so these creatures can block`
        : `Pay ${symbolsText(each)} per blocking creature (${totalText(d.totalCost)} total) so these creatures can block`;
  return `${what}: tap your mana sources.`;
}

/** The dock line under the cost: who blocks and what asks for the payment. */
export function blockTaxDetail(d: PayManaDecision, index: Index): string {
  const names = (d.blocks ?? []).map((b) => nameOf(index, b.blocker));
  const who = names.length === 0 ? 'The blockers' : names.join(', ');
  return `${who} will block once this is paid. The cost is from ${nameOf(index, d.source)}.`;
}

/** The label of Cancel at the payment: it asks for the blockers again and changes nothing. */
export const BLOCK_TAX_CANCEL = 'Choose other blockers';
