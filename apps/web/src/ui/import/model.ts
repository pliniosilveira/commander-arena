/** Pure view-models of the import screens, tested without a DOM (M4, SPEC 6, 7.1). */
import {
  convertManaCost,
  type DeckValidation,
  type ImportedCard,
  type IssueSeverity,
  type ValidationIssue,
} from '@commander-arena/cards';
import type {
  Coverage,
  ImportedEntry,
  ImportProgress,
  ImportReport,
  NameProblem,
} from '../../import/types';

// ---------------------------------------------------------------- progress

export function phaseLabel(progress: ImportProgress): string {
  const count = `${progress.done} of ${progress.total}`;
  switch (progress.phase) {
    case 'parsing':
      return 'Reading your list';
    case 'resolving':
      return `Resolving cards (${count})`;
    case 'converting':
      return `Checking which abilities the engine understands (${count})`;
    case 'validating':
      return 'Checking the deck against the Commander rules';
    case 'done':
      return 'Done';
  }
}

/** The fraction of the bar to fill, from 0 to 1. A phase with nothing to count shows an empty bar. */
export function progressFraction(progress: ImportProgress): number {
  if (progress.phase === 'done') return 1;
  if (progress.total <= 0) return 0;
  return Math.min(1, Math.max(0, progress.done / progress.total));
}

// ---------------------------------------------------------------- coverage

const plural = (n: number, one: string, many = `${one}s`): string => (n === 1 ? one : many);

/** "N of M cards supported", counting every copy (SPEC 7.3 style). */
export function coverageHeadline(coverage: Coverage): string {
  return `${coverage.supportedCopies} of ${coverage.copies} ${plural(coverage.copies, 'card')} supported`;
}

/** The lines under the headline: distinct cards, and the percentage over nonbasic cards. */
export function coverageDetails(coverage: Coverage): readonly string[] {
  return [
    `${coverage.supportedDistinct} of ${coverage.distinctCards} distinct ${plural(coverage.distinctCards, 'card')} supported`,
    `${coverage.percentCopies}% of all copies, basic lands included`,
    `${coverage.percentNonbasic}% of the distinct cards that are not basic lands`,
  ];
}

/** The status of a card in words. */
export function supportLabel(entry: ImportedEntry): string {
  return isSupported(entry) ? 'Supported' : 'Unsupported';
}

/** What produced a card's support, for the "Why unsupported?" dialog. */
export function sourceLabel(source: ImportedCard['support']['source']): string {
  switch (source) {
    case 'parser':
      return 'the Oracle text parser';
    case 'fixture':
      return "the engine's test fixture";
  }
}

export type CoverageFilter = 'all' | 'unsupported';

export const isSupported = (entry: ImportedEntry): boolean =>
  entry.card.support.status === 'supported';

/** Commanders first, then by name; the filter keeps only unsupported cards when asked. */
export function filterEntries(
  entries: readonly ImportedEntry[],
  filter: CoverageFilter,
): readonly ImportedEntry[] {
  const kept = filter === 'unsupported' ? entries.filter((e) => !isSupported(e)) : [...entries];
  return kept.sort((a, b) => {
    if (a.section !== b.section) return a.section === 'commander' ? -1 : 1;
    const x = a.card.stored.name;
    const y = b.card.stored.name;
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

export interface BlockSplit {
  /** Unsupported cards blocked only by the grammar (nothing recognised failed to run). */
  readonly grammarOnly: number;
  /** Unsupported cards blocked only by the engine: the grammar reads every dropped ability. */
  readonly engineOnly: number;
  /** Unsupported cards with both kinds of dropped ability. */
  readonly both: number;
  /** Unsupported cards with no classifiable ability (a layout or card type reason, or schema 1). */
  readonly other: number;
}

/**
 * How many unsupported cards are blocked by the grammar, by the engine, or by both (D-064). Per
 * card, look at the `reason` of every unparsed ability: `unrecognised` and `unboundReference` are
 * grammar gaps (the grammar could not read or bind the text), `notRunnable` is an engine gap (the
 * grammar read it, the engine lacks a feature). A card with a grammar gap and no engine gap is
 * grammar-only; an engine gap and no grammar gap, engine-only; both kinds, both. A card with
 * neither (no unparsed ability, or only schema 1 abilities without a `reason`) counts as other, so
 * the four numbers add up to the unsupported cards. Supported cards are ignored.
 */
export function blockSplit(entries: readonly ImportedEntry[]): BlockSplit {
  let grammarOnly = 0;
  let engineOnly = 0;
  let both = 0;
  let other = 0;
  for (const e of entries) {
    if (isSupported(e)) continue;
    const reasons = e.card.support.unparsed.map((u) => u.reason);
    const grammar = reasons.some((r) => r === 'unrecognised' || r === 'unboundReference');
    const engine = reasons.includes('notRunnable');
    if (grammar && engine) both++;
    else if (grammar) grammarOnly++;
    else if (engine) engineOnly++;
    else other++;
  }
  return { grammarOnly, engineOnly, both, other };
}

/** The split in one sentence for the template panel; null when there is nothing unsupported. */
export function blockSplitLine(split: BlockSplit): string | null {
  const total = split.grammarOnly + split.engineOnly + split.both + split.other;
  if (total === 0) return null;
  const parts = [
    `${split.grammarOnly} blocked only by the grammar`,
    `${split.engineOnly} blocked only by the engine`,
    `${split.both} blocked by both`,
  ];
  if (split.other > 0) parts.push(`${split.other} for another reason`);
  return `Of ${total} unsupported ${plural(total, 'card')}: ${parts.join(', ')}.`;
}

/** The mana cost of each face of a card as symbol lists (null for a face with no cost). */
export function costSymbols(card: ImportedCard): readonly (readonly string[] | null)[] {
  return card.stored.faces.map((face) => convertManaCost(face.manaCost).symbols);
}

// ---------------------------------------------------------------- validation

export interface IssueGroup {
  readonly severity: IssueSeverity;
  readonly title: string;
  readonly issues: readonly ValidationIssue[];
}

const GROUP_TITLES: Readonly<Record<IssueSeverity, string>> = {
  error: 'Errors',
  warning: 'Warnings',
  info: 'Information',
};

/** Issues grouped by severity, errors first; empty groups are left out. */
export function groupIssues(validation: DeckValidation): readonly IssueGroup[] {
  const order: readonly IssueSeverity[] = ['error', 'warning', 'info'];
  return order
    .map((severity) => ({
      severity,
      title: GROUP_TITLES[severity],
      issues: validation.issues.filter((i) => i.severity === severity),
    }))
    .filter((g) => g.issues.length > 0);
}

/** The state in words, never only a color. */
export function validationSummary(validation: DeckValidation): string {
  const errors = validation.issues.filter((i) => i.severity === 'error').length;
  const warnings = validation.issues.filter((i) => i.severity === 'warning').length;
  if (validation.ok) {
    return warnings === 0
      ? 'Deck is valid: no errors, no warnings.'
      : `Deck is valid, with ${warnings} ${plural(warnings, 'warning')}.`;
  }
  return `Deck is not valid: ${errors} ${plural(errors, 'error')}.`;
}

// ---------------------------------------------------------------- problems with names

/** Names Scryfall answered "not found" for, apart from names it could not look up at all. */
export function splitNameProblems(problems: readonly NameProblem[]): {
  readonly notFound: readonly NameProblem[];
  readonly failures: readonly NameProblem[];
} {
  return {
    notFound: problems.filter((p) => p.reason === 'not-found'),
    failures: problems.filter((p) => p.reason !== 'not-found'),
  };
}

/** True when nothing could be resolved because Scryfall could not be reached. */
export function looksOffline(report: ImportReport): boolean {
  const { failures } = splitNameProblems(report.notFound);
  return failures.length > 0 && report.entries.length === 0;
}

// ---------------------------------------------------------------- playing

/** Why the deck cannot be played yet, in words; empty when it is playable. */
export function playBlockers(report: ImportReport): readonly string[] {
  if (report.playable) return [];
  const out: string[] = [];
  const unresolved = report.notFound.length;
  if (unresolved > 0) {
    out.push(`${unresolved} ${plural(unresolved, 'name')} could not be resolved.`);
  }
  const pending = report.fuzzy.length;
  if (pending > 0) {
    out.push(`${pending} close ${plural(pending, 'match', 'matches')} still need your answer.`);
  }
  const unsupported = report.coverage.unsupported.length;
  if (unsupported > 0) {
    out.push(
      `${unsupported} ${plural(unsupported, 'card')} ${
        unsupported === 1 ? 'has' : 'have'
      } abilities the engine cannot run yet. A deck with such a card cannot be played: replace ${
        unsupported === 1 ? 'it' : 'them'
      }.`,
    );
  }
  if (report.commanders.length === 0) out.push('No commander is chosen yet.');
  if (report.validation !== null && !report.validation.ok) {
    out.push('The deck has validation errors.');
  }
  if (report.entries.length === 0 && out.length === 0) out.push('There are no cards yet.');
  return out;
}

/** The sample list of the import screen: the real list of the first installed precon, or null. */
export function sampleOf(
  precons: readonly { readonly name: string; readonly decklist: string }[],
): { readonly name: string; readonly text: string } | null {
  const first = precons[0];
  return first === undefined ? null : { name: first.name, text: first.decklist };
}
