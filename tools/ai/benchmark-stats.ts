// The statistics of the AI benchmark (issue 624, phase 1): the score of the candidate agent against the
// baseline over paired seeds, with a 95% confidence interval and a verdict.
//
// A PAIR is one seed played twice with the seats swapped (`playMatch`): the unit of the sample, because the
// two games of a pair share the deal and are not independent. The candidate's score in a game is 1 for a win,
// 0 for a loss and 1/2 for a draw or a game without a result; the score of a pair is the mean of its two
// games. The interval is the normal approximation over the pair scores (mean +/- 1.96 standard errors),
// which is sound for the hundreds of pairs a benchmark plays.

/** One game of a pair, from the candidate's side. */
export type GameOutcome = 'win' | 'loss' | 'draw' | 'unfinished';

/** The two games of one seed: the candidate in seat 0, then in seat 1. */
export interface PairRecord {
  readonly seed: number;
  /** The deck entry the pair was played on (an index into the deck list of the run). */
  readonly deck: number;
  readonly games: readonly [GameOutcome, GameOutcome];
  /** The turn counter at the end of each game. */
  readonly turns: readonly [number, number];
}

export interface BenchmarkSummary {
  readonly pairs: number;
  readonly games: number;
  readonly wins: number;
  readonly losses: number;
  readonly draws: number;
  readonly unfinished: number;
  /** The candidate's mean score, in [0, 1]. */
  readonly score: number;
  /** The 95% confidence interval of the score, clamped to [0, 1]. */
  readonly low: number;
  readonly high: number;
  /** The Elo difference the score implies (positive: the candidate is stronger); null at a score of 0 or 1. */
  readonly elo: number | null;
  /** `better` when the whole interval is above 1/2, `worse` when it is below, `inconclusive` otherwise. */
  readonly verdict: 'better' | 'worse' | 'inconclusive';
  readonly averageTurns: number;
}

/** 1.96: the two-sided 95% quantile of the normal distribution. */
export const Z95 = 1.96;

export const gameScore = (outcome: GameOutcome): number =>
  outcome === 'win' ? 1 : outcome === 'loss' ? 0 : 0.5;

export const pairScore = (pair: PairRecord): number =>
  (gameScore(pair.games[0]) + gameScore(pair.games[1])) / 2;

/** The Elo difference of a score: 400 log10(p / (1 - p)). */
export function eloOf(score: number): number | null {
  if (score <= 0 || score >= 1) return null;
  return 400 * Math.log10(score / (1 - score));
}

export function summarize(pairs: readonly PairRecord[]): BenchmarkSummary {
  const n = pairs.length;
  const count = (o: GameOutcome) =>
    pairs.reduce((sum, p) => sum + p.games.filter((g) => g === o).length, 0);
  const scores = pairs.map(pairScore);
  const mean = n === 0 ? 0.5 : scores.reduce((a, b) => a + b, 0) / n;
  // The sample variance (n - 1); with one pair there is no spread to measure, so the interval is the whole range.
  const variance =
    n < 2 ? Number.POSITIVE_INFINITY : scores.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1);
  const half = n < 2 ? 1 : Z95 * Math.sqrt(variance / n);
  const low = Math.max(0, mean - half);
  const high = Math.min(1, mean + half);
  const turns = pairs.reduce((s, p) => s + p.turns[0] + p.turns[1], 0);
  return {
    pairs: n,
    games: 2 * n,
    wins: count('win'),
    losses: count('loss'),
    draws: count('draw'),
    unfinished: count('unfinished'),
    score: mean,
    low,
    high,
    elo: eloOf(mean),
    verdict: low > 0.5 ? 'better' : high < 0.5 ? 'worse' : 'inconclusive',
    averageTurns: n === 0 ? 0 : turns / (2 * n),
  };
}

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;

/** The Markdown report of a benchmark: the headline, the table, and the score of each deck entry. */
export function formatSummary(
  pairs: readonly PairRecord[],
  options: { candidate: string; baseline: string; deckNames?: readonly string[] },
): string {
  const s = summarize(pairs);
  const elo = s.elo === null ? 'n/a' : `${s.elo >= 0 ? '+' : ''}${s.elo.toFixed(0)}`;
  const lines = [
    `## AI benchmark: ${options.candidate} against ${options.baseline}`,
    '',
    `**Verdict: ${s.verdict}.** Candidate score ${pct(s.score)} (95% interval ${pct(s.low)} to ${pct(s.high)}), Elo ${elo}.`,
    '',
    '| Pairs | Games | Wins | Losses | Draws | Unfinished | Average turns |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    `| ${s.pairs} | ${s.games} | ${s.wins} | ${s.losses} | ${s.draws} | ${s.unfinished} | ${s.averageTurns.toFixed(1)} |`,
  ];
  const byDeck = new Map<number, PairRecord[]>();
  for (const p of pairs) byDeck.set(p.deck, [...(byDeck.get(p.deck) ?? []), p]);
  if (byDeck.size > 1) {
    lines.push('', '| Deck | Pairs | Score |', '| --- | --- | --- |');
    for (const [deck, list] of [...byDeck].sort((a, b) => a[0] - b[0])) {
      const name = options.deckNames?.[deck] ?? `deck ${deck}`;
      lines.push(`| ${name} | ${list.length} | ${pct(summarize(list).score)} |`);
    }
  }
  return lines.join('\n');
}
