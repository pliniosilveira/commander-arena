// Data structures produced by the Comprehensive Rules (CR) parser in cr.ts.
// Everything here is plain data. Nothing in this file does I/O.
//
// The layout of the real CR file is assumed from public knowledge and has NOT been verified
// against the real download (see docs/rules/README.md, "Format assumptions").

/**
 * What a numbered entry is:
 * - `section`: "1. Game Concepts" (one digit)
 * - `subsection`: "100. General" (three digits)
 * - `rule`: "100.1." (subsection number, a dot, a counter)
 * - `subrule`: "100.1a" (a rule number followed by letters)
 */
export type CrRuleKind = 'section' | 'subsection' | 'rule' | 'subrule';

export interface CrRule {
  /** Canonical number without a trailing period, letters lowercase: "702.19b". */
  readonly number: string;
  readonly kind: CrRuleKind;
  /**
   * Heading title. Always set for sections and subsections. For a rule it is set only when the
   * rule looks like a heading: it has sub-rules, its text is short and it is not a sentence
   * (for example "702.19. Trample"). Null for everything else.
   */
  readonly title: string | null;
  /** The rule text. Empty for sections and subsections. Continuation lines are joined with "\n". */
  readonly text: string;
  /** Text of each "Example:" line attached to this rule, without the "Example:" prefix. */
  readonly examples: readonly string[];
  /** Number of the nearest existing ancestor, or null for a section. */
  readonly parent: string | null;
  /** Numbers of the direct children, in document order. */
  readonly children: readonly string[];
  /** 1-based line number in the normalized source text. */
  readonly line: number;
}

export interface CrGlossaryEntry {
  /** The whole term line as written. */
  readonly term: string;
  /** The term plus, when the line lists several comma-separated names, each name. */
  readonly names: readonly string[];
  /** Definition lines joined with "\n". Empty when the term had no definition lines. */
  readonly definition: string;
  /** 1-based line number of the term line. */
  readonly line: number;
}

export type CrDiagnosticKind =
  /** A line the parser could not place anywhere. */
  | 'unparsed-line'
  /** A line with no recognizable shape that was appended to the rule or example above it. */
  | 'continuation-line'
  /** An "Example:" line with no rule to attach to. */
  | 'orphan-example'
  /** A number that appeared twice. The first occurrence is kept. */
  | 'duplicate-number'
  /** A rule whose structural parent (for example "100.1" for "100.1a") does not exist. */
  | 'missing-parent'
  /** A glossary block with a term line and no definition lines. */
  | 'glossary-term-without-definition'
  /** The Contents list and the body headings disagree. */
  | 'contents-mismatch'
  | 'missing-effective-date'
  | 'no-rules-found'
  | 'no-glossary-found'
  | 'suspected-mojibake'
  | 'replacement-character';

export interface CrDiagnostic {
  readonly kind: CrDiagnosticKind;
  /** 1-based line number, or null for a whole-file observation. */
  readonly line: number | null;
  /** The offending line (truncated), or an empty string for whole-file observations. */
  readonly text: string;
  readonly message: string;
}

export interface CrStats {
  readonly lineCount: number;
  readonly sectionCount: number;
  readonly subsectionCount: number;
  /** Numbered rules ("100.1") only. */
  readonly ruleCount: number;
  /** Lettered sub-rules ("100.1a") only. */
  readonly subruleCount: number;
  readonly exampleCount: number;
  readonly glossaryCount: number;
  readonly unparsedLineCount: number;
  readonly continuationLineCount: number;
  readonly diagnosticCount: number;
  /** Non-blank lines after the "Credits" heading. */
  readonly creditsLineCount: number;
}

export interface ParsedCr {
  /** First non-blank line of the file, normally "Magic: The Gathering Comprehensive Rules". */
  readonly title: string | null;
  /** The date as written after "These rules are effective as of", for example "September 25, 2026". */
  readonly effectiveDateText: string | null;
  /** The same date as YYYY-MM-DD, or null when absent or not in "Month D, YYYY" form. */
  readonly effectiveDate: string | null;
  /** Every numbered entry (sections, subsections, rules, sub-rules) in document order. */
  readonly rules: ReadonlyMap<string, CrRule>;
  /** Section and subsection titles listed in the Contents section, keyed by number. */
  readonly contentsTitles: ReadonlyMap<string, string>;
  readonly glossary: readonly CrGlossaryEntry[];
  readonly diagnostics: readonly CrDiagnostic[];
  readonly stats: CrStats;
}

/** Result of getRule: the rule, its ancestors (outermost first) and its descendants. */
export interface CrRuleLookup {
  readonly rule: CrRule;
  /** From the section down to the parent. Empty for a section. */
  readonly ancestors: readonly CrRule[];
  /** Every descendant in document order (depth first). Empty for a leaf. */
  readonly descendants: readonly CrRule[];
}

export type CrMatchField = 'title' | 'text' | 'example' | 'glossary-term' | 'glossary-definition';

export interface CrSearchHit {
  readonly kind: 'rule' | 'glossary';
  /** Rule number for a rule hit, null for a glossary hit. */
  readonly number: string | null;
  /** Glossary term for a glossary hit, null for a rule hit. */
  readonly term: string | null;
  /** Heading title of the rule (see CrRule.title), when it has one. */
  readonly title: string | null;
  readonly matchedIn: CrMatchField;
  /** Higher is better. Title and glossary-term matches always outrank text matches. */
  readonly score: number;
  /** A short excerpt around the match, whitespace collapsed. */
  readonly snippet: string;
}

export interface CrSearchOptions {
  /** Maximum number of hits. Default 25. */
  readonly limit?: number;
}

export interface CrGlossaryLookup {
  /** Entries whose term (or one of its names) equals the query. */
  readonly exact: readonly CrGlossaryEntry[];
  /** Entries whose term contains the query, excluding the exact ones. */
  readonly related: readonly CrGlossaryEntry[];
}
