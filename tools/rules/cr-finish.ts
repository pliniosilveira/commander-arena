// Passes that run after every line has been read: link rules into a tree, derive titles, compare
// the Contents list with the body, look for whole-file problems and count things.

import { diagnose, type State } from './cr-state.ts';
import { foldForSearch, parentNumber } from './cr-text.ts';
import type { CrDiagnosticKind, CrRuleKind, CrStats } from './cr-types.ts';

const MOJIBAKE = /â(?:€|\u0080)/;

/** Sets each rule's parent (nearest existing ancestor) and fills the children lists. */
export function linkRules(state: State): void {
  for (const rule of state.rules.values()) {
    const structural = parentNumber(rule.number);
    let parent = structural;
    while (parent !== null && !state.rules.has(parent)) parent = parentNumber(parent);
    if (structural !== null && parent !== structural) {
      diagnose(
        state,
        'missing-parent',
        rule.line,
        rule.number,
        parent === null
          ? `${rule.number} has no parent ${structural} and no other ancestor.`
          : `${rule.number} has no parent ${structural}; attached to ${parent}.`,
      );
    }
    rule.parent = parent;
    if (parent !== null) state.rules.get(parent)?.children.push(rule.number);
  }
}

/** A rule such as "702.19. Trample" (short, not a sentence, has sub-rules) gets a title. */
export function deriveRuleTitles(state: State): void {
  for (const rule of state.rules.values()) {
    if (rule.kind !== 'rule' || rule.children.length === 0) continue;
    if (rule.text.length === 0 || rule.text.length > 80 || rule.text.includes('\n')) continue;
    if (/[.:;!?]$/.test(rule.text)) continue;
    rule.title = rule.text;
  }
}

export function checkContents(state: State): void {
  if (state.contentsTitles.size === 0) return;
  for (const [number, title] of state.contentsTitles) {
    const heading = state.rules.get(number);
    if (!heading || (heading.kind !== 'section' && heading.kind !== 'subsection')) {
      diagnose(
        state,
        'contents-mismatch',
        null,
        `${number}. ${title}`,
        'Listed in Contents but there is no such heading in the body.',
      );
    } else if (foldForSearch(heading.title ?? '') !== foldForSearch(title)) {
      diagnose(
        state,
        'contents-mismatch',
        heading.line,
        `${number}. ${heading.title ?? ''}`,
        `Body title differs from the Contents title "${title}".`,
      );
    }
  }
  for (const rule of state.rules.values()) {
    if (rule.kind !== 'section' && rule.kind !== 'subsection') continue;
    if (!state.contentsTitles.has(rule.number)) {
      diagnose(
        state,
        'contents-mismatch',
        rule.line,
        `${rule.number}. ${rule.title ?? ''}`,
        'Heading is in the body but not listed in Contents.',
      );
    }
  }
}

function lineOfIndex(text: string, index: number): number {
  let line = 1;
  for (let i = text.indexOf('\n'); i !== -1 && i < index; i = text.indexOf('\n', i + 1)) line += 1;
  return line;
}

export function checkWholeFile(state: State, normalized: string): void {
  let numbered = 0;
  for (const rule of state.rules.values()) {
    if (rule.kind === 'rule' || rule.kind === 'subrule') numbered += 1;
  }
  if (state.effectiveDateText === null) {
    diagnose(
      state,
      'missing-effective-date',
      null,
      '',
      'No line of the form "These rules are effective as of <date>." was found before the body.',
    );
  }
  if (numbered === 0) {
    diagnose(state, 'no-rules-found', null, '', 'No numbered rules were recognized.');
  }
  if (state.glossary.length === 0) {
    diagnose(state, 'no-glossary-found', null, '', 'No glossary entries were recognized.');
  }
  const mojibake = MOJIBAKE.exec(normalized);
  if (mojibake) {
    const line = lineOfIndex(normalized, mojibake.index);
    diagnose(
      state,
      'suspected-mojibake',
      line,
      '',
      'Text looks UTF-8 that was decoded as Windows-1252 (for example "â€™"). Re-save the file as UTF-8.',
    );
  }
  const replacement = normalized.indexOf('�');
  if (replacement !== -1) {
    diagnose(
      state,
      'replacement-character',
      lineOfIndex(normalized, replacement),
      '',
      'Text contains U+FFFD: some bytes were not valid in the encoding used to decode the file.',
    );
  }
}

export function computeStats(state: State, lineCount: number): CrStats {
  const counts: Record<CrRuleKind, number> = { section: 0, subsection: 0, rule: 0, subrule: 0 };
  let exampleCount = 0;
  for (const rule of state.rules.values()) {
    counts[rule.kind] += 1;
    exampleCount += rule.examples.length;
  }
  const countKind = (kind: CrDiagnosticKind) =>
    state.diagnostics.filter((d) => d.kind === kind).length;
  return {
    lineCount,
    sectionCount: counts.section,
    subsectionCount: counts.subsection,
    ruleCount: counts.rule,
    subruleCount: counts.subrule,
    exampleCount,
    glossaryCount: state.glossary.length,
    unparsedLineCount: countKind('unparsed-line'),
    continuationLineCount: countKind('continuation-line'),
    diagnosticCount: state.diagnostics.length,
    creditsLineCount: state.creditsLines,
  };
}
