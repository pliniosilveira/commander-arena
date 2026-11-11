// The ranked work order (SPEC 7.3, A21, D-057): unparsed ability shapes, each with the cards it
// blocks and the popularity of those cards, plus the shapes that are the ONLY blocker of some
// cards (learning that one shape makes those cards supported).
//
// Popularity weight of a card: 1 / edhrecRank (rank 1 weighs 1, rank 1,000 weighs 0.001). A card
// without a rank weighs UNRANKED_WEIGHT, the weight of rank 100,000, far below any real rank.
// A template's weight is the sum over the distinct cards it blocks, so a shape that appears twice
// on one card counts that card once.

import { analyzeTemplates, type ImportedCard, templateOf } from '@commander-arena/cards';
import type { CardRecord } from './types.ts';

export const UNRANKED_WEIGHT = 1 / 100_000;
/** Card names kept per template in the reports. */
export const NAMES_PER_TEMPLATE = 10;

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function cardWeight(rank: number | null): number {
  return rank !== null && rank > 0 ? 1 / rank : UNRANKED_WEIGHT;
}

/** Rounded so the written reports do not depend on floating point noise. */
export function round6(value: number): number {
  return Number(value.toFixed(6));
}

export interface BacklogRow {
  readonly template: string;
  /** Distinct cards with an ability of this shape. */
  readonly cards: number;
  readonly weight: number;
  /** Abilities of this shape over all cards. */
  readonly abilities: number;
  readonly example: string;
  /** The most popular cards first, at most NAMES_PER_TEMPLATE. */
  readonly topCards: readonly string[];
  /** Cards that have no other blocker than this one shape (they become supported with it). */
  readonly soloCards: number;
  readonly soloWeight: number;
  readonly soloTopCards: readonly string[];
}

export interface Backlog {
  /** Every template, ranked by weight, then cards, then text. */
  readonly rows: readonly BacklogRow[];
  /** The rows with soloCards > 0, ranked by soloWeight, then soloCards, then text. */
  readonly solo: readonly BacklogRow[];
}

interface Popularity {
  readonly name: string;
  readonly weight: number;
}

const byPopularity = (a: Popularity, b: Popularity) =>
  b.weight - a.weight || compare(a.name, b.name);

/** Sums in a fixed order (most popular first, then by name), whatever order the file had. */
function summarize(names: readonly string[], weights: ReadonlyMap<string, number>) {
  const ordered = names
    .map((name) => ({ name, weight: weights.get(name) ?? UNRANKED_WEIGHT }))
    .sort(byPopularity);
  let sum = 0;
  for (const item of ordered) sum += item.weight;
  return {
    weight: round6(sum),
    top: ordered.slice(0, NAMES_PER_TEMPLATE).map((item) => item.name),
  };
}

export function buildBacklog(
  unsupported: readonly ImportedCard[],
  records: readonly CardRecord[],
): Backlog {
  const weights = new Map<string, number>();
  for (const record of records) {
    const weight = cardWeight(record.rank);
    weights.set(record.name, Math.max(weights.get(record.name) ?? 0, weight));
  }

  // Cards whose only blocker is one unparsed shape: no other shape and no other reason.
  const soloNames = new Map<string, string[]>();
  for (const card of unsupported) {
    if (card.support.reasons.length > 0) continue;
    const shapes = new Set(card.support.unparsed.map((u) => templateOf(u.text)));
    const [only] = shapes;
    if (shapes.size !== 1 || only === undefined) continue;
    const names = soloNames.get(only) ?? [];
    names.push(card.stored.name);
    soloNames.set(only, names);
  }

  // Most popular card first, then by name: the example text of a template comes from the most
  // popular card that has it, and does not depend on the order of the file.
  const analysis = analyzeTemplates(
    [...unsupported].sort(
      (a, b) =>
        (weights.get(b.stored.name) ?? 0) - (weights.get(a.stored.name) ?? 0) ||
        compare(a.stored.name, b.stored.name),
    ),
  );
  const rows: BacklogRow[] = analysis.templates.map((row) => {
    const all = summarize(row.cards, weights);
    const solo = summarize([...new Set(soloNames.get(row.template) ?? [])], weights);
    return {
      template: row.template,
      cards: row.cards.length,
      weight: all.weight,
      abilities: row.abilities,
      example: row.example,
      topCards: all.top,
      soloCards: new Set(soloNames.get(row.template) ?? []).size,
      soloWeight: solo.weight,
      soloTopCards: solo.top,
    };
  });
  rows.sort((a, b) => b.weight - a.weight || b.cards - a.cards || compare(a.template, b.template));
  const solo = rows
    .filter((row) => row.soloCards > 0)
    .sort(
      (a, b) =>
        b.soloWeight - a.soloWeight || b.soloCards - a.soloCards || compare(a.template, b.template),
    );
  return { rows, solo };
}
