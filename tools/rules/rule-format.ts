// Text formatting for the `pnpm rule` CLI. Pure functions from parsed data to lines of text.

import { getCitation } from './cr-lookup.ts';
import { truncate } from './cr-text.ts';
import type {
  CrGlossaryEntry,
  CrGlossaryLookup,
  CrRule,
  CrRuleLookup,
  CrSearchHit,
  ParsedCr,
} from './cr-types.ts';

/** Output is wrapped at this many columns. */
export const WIDTH = 100;

/** Greedy word wrap. "\n" in the text starts a new paragraph. Words are never split. */
export function wrapText(
  text: string,
  width: number,
  firstIndent: string,
  restIndent: string,
): string[] {
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter((w) => w !== '');
    let current = out.length === 0 ? firstIndent : restIndent;
    let hasWord = false;
    for (const word of words) {
      if (hasWord && current.length + 1 + word.length > width) {
        out.push(current);
        current = restIndent + word;
      } else {
        current += (hasWord ? ' ' : '') + word;
      }
      hasWord = true;
    }
    out.push(current.trimEnd());
  }
  return out;
}

const DEPTH: Record<CrRule['kind'], number> = { section: 0, subsection: 1, rule: 2, subrule: 3 };

/** "7. Additional Rules", "702.2. Sprocket", "702.2b". */
function describe(rule: CrRule): string {
  if (rule.kind === 'section' || rule.kind === 'subsection') return `${rule.number}. ${rule.title}`;
  return rule.title ? `${rule.number}. ${rule.title}` : rule.number;
}

function citationLines(cr: ParsedCr, lookup: CrRuleLookup): string[] {
  const lines = [getCitation(cr, lookup.rule.number) ?? `CR ${lookup.rule.number}`];
  if (lookup.ancestors.length > 0) {
    lines.push(`Path: ${[...lookup.ancestors, lookup.rule].map(describe).join(' > ')}`);
  }
  return lines;
}

function ruleBlock(rule: CrRule, indent: string): string[] {
  const label = `${indent}${rule.number}  `;
  const rest = ' '.repeat(label.length);
  const lines = wrapText(rule.text, WIDTH, label, rest);
  for (const example of rule.examples) {
    lines.push(...wrapText(example, WIDTH, `${rest}Example: `, `${rest}         `));
  }
  return lines;
}

/** A rule or sub-rule with all of its descendants, each with its examples. */
export function formatRuleTree(cr: ParsedCr, lookup: CrRuleLookup): string[] {
  const lines = [...citationLines(cr, lookup), ''];
  const rootDepth = DEPTH[lookup.rule.kind];
  for (const item of [lookup.rule, ...lookup.descendants]) {
    const indent = '  '.repeat(DEPTH[item.kind] - rootDepth);
    lines.push(...ruleBlock(item, indent));
  }
  return lines;
}

function childLabel(child: CrRule): string {
  if (child.title !== null) return child.title;
  return truncate(child.text.replace(/\s+/g, ' '), 90);
}

/** The outline of a section or subsection: its direct children, one line each. */
export function formatOutline(cr: ParsedCr, lookup: CrRuleLookup): string[] {
  const lines = [...citationLines(cr, lookup), ''];
  const children = lookup.rule.children
    .map((n) => cr.rules.get(n))
    .filter((c): c is CrRule => c !== undefined);
  if (children.length === 0) {
    lines.push('(no entries under this heading)');
    return lines;
  }
  const width = Math.max(...children.map((c) => c.number.length));
  for (const child of children) {
    const count = child.children.length;
    const noun = child.kind === 'subsection' ? 'rules' : 'sub-rules';
    const suffix = count > 0 ? `  (${count} ${noun})` : '';
    lines.push(`  ${child.number.padEnd(width)}  ${childLabel(child)}${suffix}`);
  }
  return lines;
}

const FIELD_TAG: Partial<Record<CrSearchHit['matchedIn'], string>> = {
  example: ' (example)',
  'glossary-definition': ' (definition)',
};

export function formatSearch(query: string, hits: readonly CrSearchHit[], more: boolean): string[] {
  if (hits.length === 0) return [`No matches for "${query}".`];
  const lines = [`${more ? 'First ' : ''}${hits.length} matches for "${query}":`];
  const width = Math.max(...hits.map((h) => (h.number ?? 'glossary').length));
  for (const hit of hits) {
    const label = (hit.number ?? 'glossary').padEnd(width);
    const tag = FIELD_TAG[hit.matchedIn] ?? '';
    const body = hit.kind === 'glossary' ? `${hit.term}: ${hit.snippet}` : hit.snippet;
    lines.push(...wrapText(`${body}${tag}`, WIDTH, `  ${label}  `, `  ${' '.repeat(width)}  `));
  }
  if (more) lines.push('(more matches exist; raise --limit to see them)');
  return lines;
}

function glossaryBlock(entry: CrGlossaryEntry): string[] {
  const lines = [entry.term];
  if (entry.definition === '') lines.push('  (no definition lines in the file)');
  else lines.push(...wrapText(entry.definition, WIDTH, '  ', '  '));
  return lines;
}

export function formatGlossary(query: string, found: CrGlossaryLookup): string[] {
  if (found.exact.length === 0 && found.related.length === 0) {
    return [`No glossary entry matches "${query}".`];
  }
  const lines: string[] = [];
  for (const entry of found.exact) lines.push(...glossaryBlock(entry), '');
  if (found.related.length > 0) {
    lines.push(
      found.exact.length > 0
        ? 'Related entries:'
        : `No exact entry for "${query}". Related entries:`,
    );
    for (const entry of found.related) lines.push(...glossaryBlock(entry), '');
  }
  return lines.slice(0, -1);
}

export interface CheckInput {
  readonly path: string;
  readonly byteSize: number;
  readonly encoding: string;
  readonly cr: ParsedCr;
}

/** The `--check` report. `ok` is false when the parse looks broken (no numbered rules at all). */
export function formatCheck(
  input: CheckInput,
  maxDiagnostics = 20,
): { lines: string[]; ok: boolean } {
  const { cr, path, byteSize, encoding } = input;
  const s = cr.stats;
  const byKind = new Map<string, number>();
  for (const d of cr.diagnostics) byKind.set(d.kind, (byKind.get(d.kind) ?? 0) + 1);
  const kinds = [...byKind].map(([k, n]) => `${k}: ${n}`).join(', ');
  const date = cr.effectiveDateText
    ? `${cr.effectiveDateText}${cr.effectiveDate ? ` (${cr.effectiveDate})` : ' (not in "Month D, YYYY" form)'}`
    : 'NOT FOUND';
  const row = (label: string, value: string | number) => `  ${`${label}:`.padEnd(22)}${value}`;
  const lines = [
    'Comprehensive Rules parser check',
    row('File', path),
    row('Size, encoding', `${byteSize} bytes, ${encoding}`),
    row('Title line', cr.title ?? 'NOT FOUND'),
    row('Effective date', date),
    row('Sections', s.sectionCount),
    row('Subsections', s.subsectionCount),
    row('Rules', `${s.ruleCount} (plus ${s.subruleCount} lettered sub-rules)`),
    row('Examples', s.exampleCount),
    row('Glossary entries', s.glossaryCount),
    row('Credits lines', s.creditsLineCount),
    row('Unparsed lines', s.unparsedLineCount),
    row('Continuation lines', s.continuationLineCount),
    row('Diagnostics', s.diagnosticCount === 0 ? '0' : `${s.diagnosticCount} (${kinds})`),
  ];
  if (cr.diagnostics.length > 0) {
    lines.push('', `Diagnostics (first ${Math.min(maxDiagnostics, cr.diagnostics.length)}):`);
    for (const d of cr.diagnostics.slice(0, maxDiagnostics)) {
      const where = d.line === null ? 'file' : `line ${d.line}`;
      lines.push(`  ${where}  ${d.kind}: ${d.message}`);
      if (d.text !== '') lines.push(`    > ${d.text}`);
    }
    if (cr.diagnostics.length > maxDiagnostics) {
      lines.push(`  ... and ${cr.diagnostics.length - maxDiagnostics} more`);
    }
  }
  const ok = s.ruleCount + s.subruleCount > 0;
  lines.push(
    '',
    ok
      ? 'Parsed. The parser format assumptions are listed in docs/rules/README.md; compare the counts above with the file.'
      : 'PROBLEM: no numbered rules were recognized. The file format may differ from what the parser expects.',
  );
  return { lines, ok };
}
