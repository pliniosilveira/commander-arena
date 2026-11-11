// Mutable working state of the CR parser. Internal to cr.ts and cr-finish.ts.

import { truncate } from './cr-text.ts';
import type { CrDiagnostic, CrDiagnosticKind, CrGlossaryEntry, CrRuleKind } from './cr-types.ts';

export type Zone = 'preamble' | 'contents' | 'body' | 'glossary' | 'credits';

export interface MutableRule {
  number: string;
  kind: CrRuleKind;
  title: string | null;
  text: string;
  examples: string[];
  parent: string | null;
  children: string[];
  line: number;
}

export type Cursor =
  | { target: 'rule'; rule: MutableRule }
  | { target: 'example'; rule: MutableRule }
  | null;

export interface State {
  zone: Zone;
  title: string | null;
  effectiveDateText: string | null;
  rules: Map<string, MutableRule>;
  contentsTitles: Map<string, string>;
  glossary: CrGlossaryEntry[];
  glossaryBlock: { line: number; lines: string[] } | null;
  diagnostics: CrDiagnostic[];
  /** The rule an "Example:" line attaches to. Cleared by headings and duplicates. */
  lastRule: MutableRule | null;
  /** What a line of unknown shape directly after a non-blank line would extend. */
  cursor: Cursor;
  /** Rules and sub-rules seen so far. Guards against "Glossary" appearing as a Contents entry. */
  ruleLineCount: number;
  creditsLines: number;
}

export function diagnose(
  state: State,
  kind: CrDiagnosticKind,
  line: number | null,
  text: string,
  message: string,
): void {
  state.diagnostics.push({ kind, line, text: truncate(text, 160), message });
}

export function createState(): State {
  return {
    zone: 'preamble',
    title: null,
    effectiveDateText: null,
    rules: new Map(),
    contentsTitles: new Map(),
    glossary: [],
    glossaryBlock: null,
    diagnostics: [],
    lastRule: null,
    cursor: null,
    ruleLineCount: 0,
    creditsLines: 0,
  };
}
