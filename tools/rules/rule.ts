// `pnpm rule`: look up Comprehensive Rules (CR) text from docs/rules/comprehensive-rules.txt.
//
//   pnpm rule 702.19b            a rule or sub-rule with its sub-rules and examples
//   pnpm rule 702.19             the rule and all its lettered sub-rules
//   pnpm rule 702                the outline of a subsection (7 for a section)
//   pnpm rule --search trample   ranked matches in titles, rule text, examples and the glossary
//   pnpm rule --glossary trample a glossary entry
//   pnpm rule --check            parser diagnostics: counts, effective date, unparsed lines
//
// Exit codes: 0 ok, 1 not found / no matches / parse looks broken, 2 CR file missing or
// unreadable, 64 usage error.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { type CliIo, processIo } from './cli-io.ts';
import { decodeCrBytes, parseCr } from './cr.ts';
import { getRule, lookupGlossary, searchRules, suggestRuleNumbers } from './cr-lookup.ts';
import { normalizeRuleNumber } from './cr-text.ts';
import type { ParsedCr } from './cr-types.ts';
import {
  CR_FILE,
  CR_FILE_REPO_PATH,
  isMainModule,
  RULES_VERSION_REPO_PATH,
  SOURCE_FILE_REPO_PATH,
} from './paths.ts';
import {
  formatCheck,
  formatGlossary,
  formatOutline,
  formatRuleTree,
  formatSearch,
} from './rule-format.ts';

export type { CliIo } from './cli-io.ts';

export const EXIT_OK = 0;
export const EXIT_NOT_FOUND = 1;
export const EXIT_MISSING_FILE = 2;
export const EXIT_USAGE = 64;

export interface RuleCliOptions {
  /** Path of the CR text file. Defaults to docs/rules/comprehensive-rules.txt. */
  readonly crPath?: string;
  readonly io?: CliIo;
}

export const USAGE = [
  'Usage:',
  '  pnpm rule <number>...          rule, sub-rule or outline, for example 702.19b, 702.19, 702, 7',
  '  pnpm rule --search <text>      search rule titles, text, examples and the glossary',
  '  pnpm rule --glossary <term>    show a glossary entry',
  '  pnpm rule --check              parser diagnostics (counts, effective date, unparsed lines)',
  '',
  'Options:',
  `  --file <path>   read this CR text file instead of ${CR_FILE_REPO_PATH}`,
  '  --limit <n>     maximum search results (default 25)',
  '  --help          show this help',
  '',
  'Exit codes: 0 ok, 1 not found or parse problem, 2 CR file missing, 64 usage error.',
];

export function missingFileMessage(displayPath: string): string[] {
  return [
    `The Comprehensive Rules text file was not found: ${displayPath}`,
    '',
    'To get it, do one of these:',
    '  1. Run:  pnpm rules:fetch',
    '     It finds the current plain text link on https://magic.wizards.com/en/rules and downloads it.',
    '  2. Or save the plain text (.txt) Comprehensive Rules from https://magic.wizards.com/en/rules',
    `     by hand as ${CR_FILE_REPO_PATH}`,
    '',
    `Then update ${RULES_VERSION_REPO_PATH}: effective date, sha256 (see ${SOURCE_FILE_REPO_PATH}`,
    'after pnpm rules:fetch) and the Update Bulletins checked. Until that is done the rules baseline',
    'stays NOT VERIFIED (SPEC A17).',
  ];
}

export interface LoadedCr {
  readonly path: string;
  readonly byteSize: number;
  readonly encoding: string;
  readonly cr: ParsedCr;
}

export type LoadResult =
  | { readonly ok: true; readonly loaded: LoadedCr }
  | { readonly ok: false; readonly reason: 'missing' | 'unreadable'; readonly detail: string };

/** Reads, decodes and parses the CR file. Never throws. */
export function loadCr(crPath: string): LoadResult {
  let bytes: Uint8Array;
  try {
    bytes = readFileSync(crPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: code === 'ENOENT' ? 'missing' : 'unreadable', detail };
  }
  const decoded = decodeCrBytes(bytes);
  return {
    ok: true,
    loaded: {
      path: crPath,
      byteSize: bytes.byteLength,
      encoding: decoded.encoding,
      cr: parseCr(decoded.text),
    },
  };
}

type Mode = 'rules' | 'search' | 'glossary' | 'check' | 'help';

interface ParsedArgs {
  readonly mode: Mode;
  /** True when the person asked for help (as opposed to giving no arguments at all). */
  readonly helpRequested: boolean;
  readonly numbers: readonly string[];
  readonly text: string;
  readonly file: string | undefined;
  readonly limit: number;
  readonly errors: readonly string[];
}

const FLAG_MODES: Readonly<Record<string, Mode>> = {
  '--search': 'search',
  '-s': 'search',
  '--glossary': 'glossary',
  '-g': 'glossary',
  '--check': 'check',
  '--help': 'help',
  '-h': 'help',
};

/** Parses argv (without node and script). Never throws; problems go in `errors`. */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const errors: string[] = [];
  const modes = new Set<Mode>();
  const positional: string[] = [];
  const words: Record<'search' | 'glossary', string[]> = { search: [], glossary: [] };
  let collecting: 'search' | 'glossary' | null = null;
  let file: string | undefined;
  let limit = 25;
  let pendingValue: 'file' | 'limit' | null = null;

  const setValue = (name: 'file' | 'limit', value: string) => {
    if (name === 'file') file = value;
    else if (/^[1-9]\d*$/.test(value)) limit = Number(value);
    else errors.push(`--limit needs a positive whole number, got "${value}".`);
  };

  for (const arg of argv) {
    if (pendingValue !== null) {
      setValue(pendingValue, arg);
      pendingValue = null;
      continue;
    }
    if (arg === '--') continue; // some package manager versions pass the separator through
    const withValue = /^--(file|limit)=(.*)$/.exec(arg);
    if (withValue) {
      setValue(withValue[1] === 'file' ? 'file' : 'limit', withValue[2] ?? '');
      continue;
    }
    if (arg === '--file' || arg === '--limit') {
      pendingValue = arg === '--file' ? 'file' : 'limit';
      continue;
    }
    const flagMode = FLAG_MODES[arg];
    if (flagMode !== undefined) {
      modes.add(flagMode);
      collecting = flagMode === 'search' || flagMode === 'glossary' ? flagMode : null;
      continue;
    }
    if (arg.startsWith('-')) {
      errors.push(`Unknown option: ${arg}`);
    } else if (collecting !== null) {
      words[collecting].push(arg);
    } else {
      positional.push(arg);
    }
  }
  if (pendingValue !== null) errors.push(`--${pendingValue} needs a value.`);

  const helpRequested = modes.has('help');
  const chosen = [...modes].filter((m) => m !== 'help');
  let mode: Mode = positional.length > 0 ? 'rules' : 'help';
  if (helpRequested) mode = 'help';
  else if (chosen.length > 1) errors.push('Use only one of --search, --glossary and --check.');
  else if (chosen[0] !== undefined) mode = chosen[0];
  if (!helpRequested && chosen.length === 1 && positional.length > 0) {
    errors.push(`Unexpected argument: ${positional.join(' ')}`);
  }
  const text = mode === 'search' || mode === 'glossary' ? words[mode].join(' ').trim() : '';
  if ((mode === 'search' || mode === 'glossary') && text === '') {
    errors.push(`--${mode} needs some text.`);
  }
  return { mode, helpRequested, numbers: positional, text, file, limit, errors };
}

function printRule(cr: ParsedCr, input: string, io: CliIo): 'ok' | 'not-found' | 'not-a-number' {
  const canonical = normalizeRuleNumber(input);
  if (canonical === null) {
    io.err(`"${input}" is not a rule number. Examples: 702.19b, 702.19, 702, 7.`);
    io.err('To search text use: pnpm rule --search <text>');
    return 'not-a-number';
  }
  const found = getRule(cr, canonical);
  if (!found) {
    io.err(`No rule ${canonical} in this file.`);
    const near = suggestRuleNumbers(cr, canonical);
    if (near.length > 0) io.err(`Nearby numbers: ${near.join(', ')}`);
    return 'not-found';
  }
  const heading = found.rule.kind === 'section' || found.rule.kind === 'subsection';
  const lines = heading ? formatOutline(cr, found) : formatRuleTree(cr, found);
  io.out(lines.join('\n'));
  return 'ok';
}

/**
 * Runs the CLI and returns the exit code. All output goes through `options.io` (default: the
 * process streams), so tests can call this without a child process.
 */
export function runRuleCli(argv: readonly string[], options: RuleCliOptions = {}): number {
  const io = options.io ?? processIo;
  const args = parseArgs(argv);

  if (args.mode === 'help') {
    for (const line of USAGE) (args.helpRequested ? io.out : io.err)(line);
    return args.helpRequested ? EXIT_OK : EXIT_USAGE;
  }
  if (args.errors.length > 0) {
    for (const error of args.errors) io.err(error);
    io.err('');
    for (const line of USAGE) io.err(line);
    return EXIT_USAGE;
  }

  const crPath = path.resolve(args.file ?? options.crPath ?? CR_FILE);
  const result = loadCr(crPath);
  if (!result.ok) {
    if (result.reason === 'missing') {
      const shown = crPath === CR_FILE ? `${CR_FILE_REPO_PATH} (${crPath})` : crPath;
      for (const line of missingFileMessage(shown)) io.err(line);
    } else {
      io.err(`Could not read the Comprehensive Rules file ${crPath}: ${result.detail}`);
    }
    return EXIT_MISSING_FILE;
  }
  const { cr } = result.loaded;

  switch (args.mode) {
    case 'check': {
      const report = formatCheck(result.loaded);
      io.out(report.lines.join('\n'));
      return report.ok ? EXIT_OK : EXIT_NOT_FOUND;
    }
    case 'search': {
      const hits = searchRules(cr, args.text, { limit: args.limit + 1 });
      const more = hits.length > args.limit;
      io.out(formatSearch(args.text, hits.slice(0, args.limit), more).join('\n'));
      return hits.length === 0 ? EXIT_NOT_FOUND : EXIT_OK;
    }
    case 'glossary': {
      const found = lookupGlossary(cr, args.text);
      io.out(formatGlossary(args.text, found).join('\n'));
      return found.exact.length + found.related.length === 0 ? EXIT_NOT_FOUND : EXIT_OK;
    }
    default: {
      const outcomes = args.numbers.map((n, i) => {
        if (i > 0) io.out('');
        return printRule(cr, n, io);
      });
      if (outcomes.includes('not-a-number')) return EXIT_USAGE;
      return outcomes.includes('not-found') ? EXIT_NOT_FOUND : EXIT_OK;
    }
  }
}

if (isMainModule(import.meta.url)) {
  process.exitCode = runRuleCli(process.argv.slice(2));
}
