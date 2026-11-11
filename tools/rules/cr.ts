// Pure parser for the text of the Magic: The Gathering Comprehensive Rules (CR).
// No I/O: pass the text in, get a structure out. See cr-lookup.ts for getRule / searchRules.
//
// IMPORTANT: this parser was written from public knowledge of the file layout and has only been
// tested against a SYNTHETIC fixture (tools/rules/fixtures/synthetic-cr.txt). It has NOT been run
// against the real CR download. Format assumptions are listed in docs/rules/README.md. The parser
// never throws on odd input: lines it cannot place are recorded in `diagnostics`.
//
// Layout assumed, in file order:
//   title line / "These rules are effective as of <date>." / introduction / "Contents" + a list of
//   section and subsection headings / body: "1. Game Concepts", "100. General", "100.1. text",
//   "100.1a text", "Example: text" / "Glossary" (term line, definition lines, blank line) /
//   "Credits" (free text).

import {
  checkContents,
  checkWholeFile,
  computeStats,
  deriveRuleTitles,
  linkRules,
} from './cr-finish.ts';
import { createState, diagnose, type MutableRule, type State } from './cr-state.ts';
import { normalizeCrText, parseEffectiveDate, softBreaksToNewlines } from './cr-text.ts';
import type { CrRule, CrRuleKind, ParsedCr } from './cr-types.ts';

export {
  getCitation,
  getRule,
  getSectionTitle,
  listHeadings,
  listUnparsedLines,
  lookupGlossary,
  searchRules,
  suggestRuleNumbers,
} from './cr-lookup.ts';
export type { CrEncoding, DecodedCr } from './cr-text.ts';
export {
  decodeCrBytes,
  normalizeCrText,
  normalizeRuleNumber,
  parseEffectiveDate,
} from './cr-text.ts';
export type * from './cr-types.ts';

const SECTION_HEADING = /^([1-9])\.\s+(\S[\s\S]*)$/;
const SUBSECTION_HEADING = /^(\d{3})\.\s+(\S[\s\S]*)$/;
// Real-file facts (CR effective 2026-09-25): a few lines contain U+2028 (LINE SEPARATOR) in the
// middle of the text, and `.` does not match it, so the text groups use [\s\S]. Rule 606.5 has
// no period after its number although every other rule has one, so the period is optional.
const RULE_LINE = /^(\d{3}\.\d+)\.?(?:\s+([\s\S]*))?$/;
const SUBRULE_LINE = /^(\d{3}\.\d+[a-z]{1,2})\.?(?:\s+([\s\S]*))?$/;
const EXAMPLE_LINE = /^Examples?:\s*([\s\S]*)$/;
const EFFECTIVE_LINE = /^These rules are effective as of\s+(.+?)\.?\s*$/i;
const CONTENTS_LINE = /^contents$/i;
const GLOSSARY_LINE = /^glossary$/i;
const CREDITS_LINE = /^credits$/i;

/**
 * Parses CR text. Accepts a string with or without a BOM, with CRLF, LF or CR line endings.
 * Never throws: anything unexpected becomes a diagnostic.
 */
export function parseCr(input: string): ParsedCr {
  const normalized = normalizeCrText(input);
  const lines = normalized.split('\n');
  const state = createState();

  lines.forEach((raw, index) => {
    processLine(state, raw.trim(), index + 1);
  });
  flushGlossaryBlock(state);

  linkRules(state);
  deriveRuleTitles(state);
  checkContents(state);
  checkWholeFile(state, normalized);

  const effectiveDate =
    state.effectiveDateText === null ? null : parseEffectiveDate(state.effectiveDateText);
  return {
    title: state.title,
    effectiveDateText: state.effectiveDateText,
    effectiveDate,
    rules: state.rules as ReadonlyMap<string, CrRule>,
    contentsTitles: state.contentsTitles,
    glossary: state.glossary,
    diagnostics: state.diagnostics,
    stats: computeStats(state, lines.length),
  };
}

function processLine(state: State, line: string, lineNo: number): void {
  switch (state.zone) {
    case 'credits':
      if (line !== '') state.creditsLines += 1;
      return;
    case 'glossary':
      processGlossaryLine(state, line, lineNo);
      return;
    case 'preamble':
      if (line !== '') processPreamble(state, line, lineNo);
      return;
    case 'contents':
      if (line !== '') processContents(state, line, lineNo);
      return;
    case 'body':
      if (line === '') state.cursor = null;
      else processBody(state, line, lineNo);
      return;
  }
}

function recordEffectiveDate(state: State, line: string): boolean {
  const m = EFFECTIVE_LINE.exec(line);
  if (!m) return false;
  state.effectiveDateText ??= m[1] ?? null;
  return true;
}

function looksLikeBodyLine(line: string): boolean {
  return (
    SECTION_HEADING.test(line) ||
    SUBSECTION_HEADING.test(line) ||
    RULE_LINE.test(line) ||
    SUBRULE_LINE.test(line)
  );
}

function processPreamble(state: State, line: string, lineNo: number): void {
  if (recordEffectiveDate(state, line)) return;
  if (CONTENTS_LINE.test(line)) {
    state.zone = 'contents';
    return;
  }
  if (looksLikeBodyLine(line)) {
    // No "Contents" heading: the file may be an excerpt. Treat this as the start of the body.
    state.zone = 'body';
    processBody(state, line, lineNo);
    return;
  }
  // The first line that is not otherwise recognized is the title. Later lines are introduction
  // text, which is deliberately not stored.
  if (state.title === null) state.title = line;
}

function processContents(state: State, line: string, lineNo: number): void {
  if (recordEffectiveDate(state, line)) return;
  if (CREDITS_LINE.test(line)) {
    // "Credits" is the last Contents entry; the body starts after it.
    state.zone = 'body';
    return;
  }
  if (GLOSSARY_LINE.test(line)) return;
  const heading = SUBSECTION_HEADING.exec(line) ?? SECTION_HEADING.exec(line);
  if (heading) {
    const number = heading[1] ?? '';
    if (state.contentsTitles.has(number)) {
      // A heading seen twice: the Contents list is over and this is the first body heading.
      state.zone = 'body';
      processBody(state, line, lineNo);
      return;
    }
    state.contentsTitles.set(number, (heading[2] ?? '').trim());
    return;
  }
  if (RULE_LINE.test(line) || SUBRULE_LINE.test(line)) {
    state.zone = 'body';
    processBody(state, line, lineNo);
    return;
  }
  diagnose(state, 'unparsed-line', lineNo, line, 'Line inside the Contents list is not a heading.');
}

function addEntry(
  state: State,
  entry: { number: string; kind: CrRuleKind; title: string | null; text: string },
  lineNo: number,
  raw: string,
): MutableRule | null {
  const { number, kind, title, text } = entry;
  if (state.rules.has(number)) {
    const firstLine = state.rules.get(number)?.line ?? 0;
    diagnose(
      state,
      'duplicate-number',
      lineNo,
      raw,
      `${number} already defined on line ${firstLine}; the first definition is kept.`,
    );
    state.cursor = null;
    state.lastRule = null;
    return null;
  }
  const rule: MutableRule = {
    number,
    kind,
    title,
    text,
    examples: [],
    parent: null,
    children: [],
    line: lineNo,
  };
  state.rules.set(number, rule);
  return rule;
}

function processBody(state: State, line: string, lineNo: number): void {
  if (GLOSSARY_LINE.test(line) || CREDITS_LINE.test(line)) {
    if (state.ruleLineCount > 0) {
      state.zone = GLOSSARY_LINE.test(line) ? 'glossary' : 'credits';
      state.glossaryBlock = null;
      state.cursor = null;
      state.lastRule = null;
    } else {
      diagnose(state, 'unparsed-line', lineNo, line, 'Glossary or Credits before any rule.');
    }
    return;
  }

  const subrule = SUBRULE_LINE.exec(line);
  const rule = subrule ? null : RULE_LINE.exec(line);
  const numbered = subrule ?? rule;
  if (numbered) {
    const entry = {
      number: numbered[1] ?? '',
      kind: subrule ? ('subrule' as const) : ('rule' as const),
      title: null,
      text: softBreaksToNewlines((numbered[2] ?? '').trim()),
    };
    const created = addEntry(state, entry, lineNo, line);
    if (created) {
      state.ruleLineCount += 1;
      state.lastRule = created;
      state.cursor = { target: 'rule', rule: created };
    }
    return;
  }

  const heading = SUBSECTION_HEADING.exec(line) ?? SECTION_HEADING.exec(line);
  if (heading) {
    const number = heading[1] ?? '';
    const kind = number.length === 1 ? ('section' as const) : ('subsection' as const);
    addEntry(state, { number, kind, title: (heading[2] ?? '').trim(), text: '' }, lineNo, line);
    state.lastRule = null;
    state.cursor = null;
    return;
  }

  const example = EXAMPLE_LINE.exec(line);
  if (example) {
    if (state.lastRule) {
      state.lastRule.examples.push(softBreaksToNewlines((example[1] ?? '').trim()));
      state.cursor = { target: 'example', rule: state.lastRule };
    } else {
      diagnose(state, 'orphan-example', lineNo, line, 'Example with no rule above it.');
      state.cursor = null;
    }
    return;
  }

  const cursor = state.cursor;
  if (cursor) {
    if (cursor.target === 'rule') {
      const tidy = softBreaksToNewlines(line);
      cursor.rule.text = cursor.rule.text === '' ? tidy : `${cursor.rule.text}\n${tidy}`;
    } else {
      const last = cursor.rule.examples.length - 1;
      cursor.rule.examples[last] =
        `${cursor.rule.examples[last] ?? ''}\n${softBreaksToNewlines(line)}`;
    }
    diagnose(
      state,
      'continuation-line',
      lineNo,
      line,
      `Appended to the ${cursor.target} above (no blank line in between).`,
    );
    return;
  }
  diagnose(state, 'unparsed-line', lineNo, line, 'Line does not match any known CR line shape.');
}

function processGlossaryLine(state: State, line: string, lineNo: number): void {
  if (line === '') {
    flushGlossaryBlock(state);
    return;
  }
  if (state.glossaryBlock === null) {
    if (CREDITS_LINE.test(line)) {
      state.zone = 'credits';
      return;
    }
    state.glossaryBlock = { line: lineNo, lines: [line] };
    return;
  }
  state.glossaryBlock.lines.push(line);
}

function flushGlossaryBlock(state: State): void {
  const block = state.glossaryBlock;
  state.glossaryBlock = null;
  const term = block?.lines[0];
  if (!block || term === undefined) return;
  const definition = softBreaksToNewlines(block.lines.slice(1).join('\n'));
  const parts = term.split(/,\s+/).map((p) => p.trim());
  const names = parts.length > 1 ? [term, ...parts.filter((p) => p !== '')] : [term];
  if (definition === '') {
    diagnose(
      state,
      'glossary-term-without-definition',
      block.line,
      term,
      'Glossary block has a term line and no definition lines.',
    );
  }
  state.glossary.push({ term, names, definition, line: block.line });
}
