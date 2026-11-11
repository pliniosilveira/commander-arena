// Coverage numbers and the breakdown of why cards are unsupported. Pure functions over the
// result of analyze.ts.

import type { ImportedCard } from '@commander-arena/cards';
import type { CardRecord, CoverageStats, Share } from './types.ts';

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function shareOf(cards: readonly CardRecord[]): Share {
  let supported = 0;
  for (const card of cards) if (card.supported) supported += 1;
  return { supported, total: cards.length };
}

/** The `n` most popular ranked cards: lowest EDHREC rank first, ties by name. */
export function topByRank(cards: readonly CardRecord[], n: number): CardRecord[] {
  return cards
    .filter((card) => card.rank !== null)
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0) || compare(a.name, b.name))
    .slice(0, n);
}

export function coverageStats(cards: readonly CardRecord[]): CoverageStats {
  const ranked = cards.filter((card) => card.rank !== null).length;
  return {
    all: shareOf(cards),
    top500: shareOf(topByRank(cards, 500)),
    top1000: shareOf(topByRank(cards, 1000)),
    ranked,
    unranked: cards.length - ranked,
  };
}

// ---------------------------------------------------------------- why cards are unsupported

export const UNPARSED = 'unparsed abilities';

/** The category of one reason string from `support.reasons`, in the order the checks apply. */
export function reasonCategory(reason: string): string {
  if (/^(?:face \d+: )?layout\b|^card has no faces/.test(reason)) return 'layout';
  if (/^fixture (?:mismatch|differs)/.test(reason)) return 'fixture mismatch';
  if (/characteristic-defining|unsupported (?:power|toughness) value/.test(reason)) {
    return '* power or toughness';
  }
  if (/unsupported type or supertype|\.types:/.test(reason)) return 'card type';
  if (/\.spell: an instant or sorcery/.test(reason)) return 'spell without an effect';
  if (/unsupported (?:loyalty|defense) value|mana cost|mana symbol/.test(reason)) {
    return 'printed value (cost, loyalty, defense)';
  }
  return 'other engine validation';
}

export interface ReasonBreakdownRow {
  readonly category: string;
  /** Cards with at least one reason in this category. */
  readonly cards: number;
  /** Cards whose only category is this one. */
  readonly only: number;
}

/** Counts unsupported cards by category; a card can be in several categories. */
export function reasonBreakdown(unsupported: readonly ImportedCard[]): ReasonBreakdownRow[] {
  const rows = new Map<string, { cards: number; only: number }>();
  for (const card of unsupported) {
    const categories = new Set<string>();
    if (card.support.unparsed.length > 0) categories.add(UNPARSED);
    for (const reason of card.support.reasons) categories.add(reasonCategory(reason));
    for (const category of categories) {
      const row = rows.get(category) ?? { cards: 0, only: 0 };
      row.cards += 1;
      if (categories.size === 1) row.only += 1;
      rows.set(category, row);
    }
  }
  return [...rows.entries()]
    .map(([category, row]) => ({ category, ...row }))
    .sort((a, b) => b.cards - a.cards || compare(a.category, b.category));
}

export interface StopRow {
  readonly rule: string;
  readonly abilities: number;
}

/** Unparsed abilities grouped by the closest grammar rule that was tried (SPEC 7.3). */
export function stopPositions(unsupported: readonly ImportedCard[]): StopRow[] {
  const counts = new Map<string, number>();
  for (const card of unsupported) {
    for (const ability of card.support.unparsed) {
      counts.set(ability.closestRule, (counts.get(ability.closestRule) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([rule, abilities]) => ({ rule, abilities }))
    .sort((a, b) => b.abilities - a.abilities || compare(a.rule, b.rule));
}
