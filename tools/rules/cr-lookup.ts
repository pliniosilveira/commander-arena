// Lookup helpers over a ParsedCr: rule lookup, citations, search and glossary. Pure functions.

import { escapeRegExp, foldForSearch, normalizeRuleNumber, parentNumber } from './cr-text.ts';
import type {
  CrDiagnostic,
  CrGlossaryEntry,
  CrGlossaryLookup,
  CrMatchField,
  CrRule,
  CrRuleKind,
  CrRuleLookup,
  CrSearchHit,
  CrSearchOptions,
  ParsedCr,
} from './cr-types.ts';

/**
 * Finds a rule, section or subsection by number and returns it with its ancestors and all of its
 * descendants (depth first, document order). The number is normalized first, so "702.19B",
 * "rule 702.19." and " 702.19 " all work. Returns undefined when the number is not in the file.
 */
export function getRule(cr: ParsedCr, number: string): CrRuleLookup | undefined {
  const canonical = normalizeRuleNumber(number);
  const rule = canonical === null ? undefined : cr.rules.get(canonical);
  if (!rule) return undefined;

  const ancestors: CrRule[] = [];
  for (let p = rule.parent; p !== null; ) {
    const ancestor = cr.rules.get(p);
    if (!ancestor) break;
    ancestors.unshift(ancestor);
    p = ancestor.parent;
  }

  const descendants: CrRule[] = [];
  const visit = (parent: CrRule) => {
    for (const childNumber of parent.children) {
      const child = cr.rules.get(childNumber);
      if (!child) continue;
      descendants.push(child);
      visit(child);
    }
  };
  visit(rule);
  return { rule, ancestors, descendants };
}

/**
 * A citation in the project's convention (SPEC A15): "CR 702.19b (Trample)". The title is the
 * rule's own title or the nearest ancestor's. Returns undefined when the number is not in the file.
 */
export function getCitation(cr: ParsedCr, number: string): string | undefined {
  const found = getRule(cr, number);
  if (!found) return undefined;
  const titled = [found.rule, ...[...found.ancestors].reverse()].find((r) => r.title !== null);
  return titled?.title ? `CR ${found.rule.number} (${titled.title})` : `CR ${found.rule.number}`;
}

/** The title of a section or subsection ("702" -> "Keyword Abilities"), if it exists. */
export function getSectionTitle(cr: ParsedCr, number: string): string | undefined {
  const canonical = normalizeRuleNumber(number);
  const heading = canonical === null ? undefined : cr.rules.get(canonical);
  return heading && (heading.kind === 'section' || heading.kind === 'subsection')
    ? (heading.title ?? undefined)
    : undefined;
}

/** All sections and subsections in document order, or only one of the two kinds. */
export function listHeadings(cr: ParsedCr, kind?: 'section' | 'subsection'): CrRule[] {
  const wanted = (k: CrRuleKind) =>
    kind === undefined ? k === 'section' || k === 'subsection' : k === kind;
  return [...cr.rules.values()].filter((r) => wanted(r.kind));
}

/** Lines the parser could not place anywhere (diagnostic kind "unparsed-line"). */
export function listUnparsedLines(cr: ParsedCr): CrDiagnostic[] {
  return cr.diagnostics.filter((d) => d.kind === 'unparsed-line');
}

/**
 * Numbers to suggest when a number was not found: the children of the nearest existing ancestor
 * ("702.2d" -> the sub-rules of 702.2, "705.1" with no 705 -> the subsections of section 7).
 * Used for "did you mean" hints.
 */
export function suggestRuleNumbers(cr: ParsedCr, number: string, limit = 8): string[] {
  const canonical = normalizeRuleNumber(number);
  if (canonical === null) return [];
  for (let p = parentNumber(canonical); p !== null; p = parentNumber(p)) {
    const ancestor = cr.rules.get(p);
    if (ancestor && ancestor.children.length > 0) return ancestor.children.slice(0, limit);
  }
  return [];
}

const WORD_CHAR = '[\\p{L}\\p{N}]';

function matchesAtWordBoundary(folded: string, query: string): boolean {
  const re = new RegExp(`(?<!${WORD_CHAR})${escapeRegExp(query)}(?!${WORD_CHAR})`, 'u');
  return re.test(folded);
}

/** Score for a name-like field (rule title, glossary term). 0 means no match. */
function scoreName(folded: string, query: string, tokens: readonly string[]): number {
  if (folded === query) return 1000;
  if (folded.startsWith(query)) return 900;
  if (matchesAtWordBoundary(folded, query)) return 800;
  if (folded.includes(query)) return 700;
  if (tokens.every((t) => folded.includes(t))) return 600;
  return 0;
}

interface BodyScore {
  readonly score: number;
  /** Index of the phrase in the folded text, or -1 when only the words matched. */
  readonly index: number;
}

/** Score for a body-like field (rule text, example, glossary definition). */
function scoreBody(
  folded: string,
  query: string,
  tokens: readonly string[],
  phrase: number,
  words: number,
): BodyScore {
  const index = folded.indexOf(query);
  if (index !== -1) {
    const boundary = matchesAtWordBoundary(folded, query) ? 100 : 0;
    const earliness = 20 - Math.min(20, Math.floor(index / 10));
    return { score: phrase + boundary + earliness, index };
  }
  if (tokens.every((t) => folded.includes(t))) return { score: words, index: -1 };
  return { score: 0, index: -1 };
}

function flatten(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** An excerpt of already flattened text, about `width` characters around `index`. */
function makeSnippet(flat: string, index: number, width = 140): string {
  if (flat.length <= width) return flat;
  const start = Math.max(0, Math.min(index - 40, flat.length - width));
  const end = Math.min(flat.length, start + width);
  return `${start > 0 ? '…' : ''}${flat.slice(start, end).trim()}${end < flat.length ? '…' : ''}`;
}

interface Candidate {
  score: number;
  field: CrMatchField;
  snippet: string;
}

function bestOf(a: Candidate | null, b: Candidate | null): Candidate | null {
  if (a === null) return b;
  if (b === null) return a;
  return b.score > a.score ? b : a;
}

function bodyCandidate(
  original: string,
  field: CrMatchField,
  query: string,
  tokens: readonly string[],
  phrase: number,
  words: number,
): Candidate | null {
  const flat = flatten(original);
  const found = scoreBody(foldForSearch(flat), query, tokens, phrase, words);
  if (found.score === 0) return null;
  return { score: found.score, field, snippet: makeSnippet(flat, found.index) };
}

function searchRule(rule: CrRule, query: string, tokens: readonly string[]): Candidate | null {
  let best: Candidate | null = null;
  if (rule.title !== null) {
    const score = scoreName(foldForSearch(rule.title), query, tokens);
    if (score > 0) {
      const snippet = rule.text === '' || rule.text === rule.title ? rule.title : rule.text;
      best = { score, field: 'title', snippet: makeSnippet(flatten(snippet), 0) };
    }
  }
  if (rule.text !== '')
    best = bestOf(best, bodyCandidate(rule.text, 'text', query, tokens, 300, 200));
  for (const example of rule.examples) {
    best = bestOf(best, bodyCandidate(example, 'example', query, tokens, 150, 100));
  }
  return best;
}

function searchGlossaryEntry(
  entry: CrGlossaryEntry,
  query: string,
  tokens: readonly string[],
): Candidate | null {
  let best: Candidate | null = null;
  for (const name of entry.names) {
    const score = scoreName(foldForSearch(name), query, tokens);
    if (score > 0 && (best === null || score > best.score)) {
      best = {
        score,
        field: 'glossary-term',
        snippet: makeSnippet(flatten(entry.definition || entry.term), 0),
      };
    }
  }
  if (entry.definition !== '') {
    best = bestOf(
      best,
      bodyCandidate(entry.definition, 'glossary-definition', query, tokens, 160, 90),
    );
  }
  return best;
}

/**
 * Case-insensitive search over rule titles, rule text, examples, glossary terms and glossary
 * definitions. Quotes and dashes are folded, so a straight apostrophe finds a curly one.
 *
 * Ranking, best first: title or glossary-term matches (exact, prefix, whole word, substring, all
 * words), then rule text, then examples and glossary definitions. Ties keep document order, with
 * rules before glossary entries. A query with only whitespace returns no hits.
 */
export function searchRules(
  cr: ParsedCr,
  query: string,
  options: CrSearchOptions = {},
): CrSearchHit[] {
  const folded = foldForSearch(query).replace(/\s+/g, ' ').trim();
  if (folded === '') return [];
  const tokens = folded.split(' ');
  const limit = Math.max(1, options.limit ?? 25);

  const scored: { order: number; hit: CrSearchHit }[] = [];
  let order = 0;
  for (const rule of cr.rules.values()) {
    const found = searchRule(rule, folded, tokens);
    order += 1;
    if (found === null) continue;
    scored.push({
      order,
      hit: {
        kind: 'rule',
        number: rule.number,
        term: null,
        title: rule.title,
        matchedIn: found.field,
        score: found.score,
        snippet: found.snippet,
      },
    });
  }
  for (const entry of cr.glossary) {
    const found = searchGlossaryEntry(entry, folded, tokens);
    order += 1;
    if (found === null) continue;
    scored.push({
      order,
      hit: {
        kind: 'glossary',
        number: null,
        term: entry.term,
        title: null,
        matchedIn: found.field,
        score: found.score,
        snippet: found.snippet,
      },
    });
  }
  scored.sort((a, b) => b.hit.score - a.hit.score || a.order - b.order);
  return scored.slice(0, limit).map((s) => s.hit);
}

/**
 * Glossary lookup. `exact` holds entries whose term (or any of its comma-separated names) equals
 * the query ignoring case and quote style. `related` holds entries whose term merely contains it.
 */
export function lookupGlossary(cr: ParsedCr, query: string): CrGlossaryLookup {
  const folded = foldForSearch(query).replace(/\s+/g, ' ').trim();
  if (folded === '') return { exact: [], related: [] };
  const exact: CrGlossaryEntry[] = [];
  const related: CrGlossaryEntry[] = [];
  for (const entry of cr.glossary) {
    const names = entry.names.map((n) => foldForSearch(n));
    if (names.includes(folded)) exact.push(entry);
    else if (names.some((n) => n.includes(folded))) related.push(entry);
  }
  return { exact, related };
}
