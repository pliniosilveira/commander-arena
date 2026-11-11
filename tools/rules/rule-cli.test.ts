// Tests for the `pnpm rule` CLI logic. They call runRuleCli directly (no child process) and read
// the SYNTHETIC fixture; none of the rule text asserted here is Wizards text.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import { CR_FILE, CR_FILE_REPO_PATH } from './paths.ts';
import {
  EXIT_MISSING_FILE,
  EXIT_NOT_FOUND,
  EXIT_OK,
  EXIT_USAGE,
  loadCr,
  parseArgs,
  runRuleCli,
} from './rule.ts';

const FIXTURE = path.join(import.meta.dirname, 'fixtures', 'synthetic-cr.txt');
const tempRoots: string[] = [];
afterAll(() => {
  for (const root of tempRoots) rmSync(root, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'rule-cli-'));
  tempRoots.push(dir);
  return dir;
}

interface Run {
  readonly code: number;
  readonly out: string;
  readonly err: string;
}

function run(argv: string[], crPath: string = FIXTURE): Run {
  const out: string[] = [];
  const err: string[] = [];
  const code = runRuleCli(argv, {
    crPath,
    io: { out: (t) => out.push(t), err: (t) => err.push(t) },
  });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

describe('pnpm rule <number>', () => {
  test('a sub-rule prints its text and examples with a citation and path', () => {
    const r = run(['702.2b']);
    expect(r.code).toBe(EXIT_OK);
    expect(r.out).toContain('CR 702.2b (Sprocket)');
    expect(r.out).toContain(
      'Path: 7. Additional Rules > 702. Keyword Abilities > 702.2. Sprocket > 702.2b',
    );
    expect(r.out).toContain('702.2b  If a synthetic widget has sprocket and cogwheel');
    expect(r.out).toContain(
      'Example: Synthetic example: a sprocket widget meets a cogwheel widget',
    );
    expect(r.out).not.toContain('702.2a');
    expect(r.err).toBe('');
  });

  test('a rule prints all of its lettered sub-rules', () => {
    const r = run(['702.2']);
    expect(r.code).toBe(EXIT_OK);
    for (const number of ['702.2a', '702.2b', '702.2c']) expect(r.out).toContain(number);
    expect(r.out).toContain('Example: Synthetic example: a sprocket widget');
    expect(r.out).not.toContain('702.3a');
    expect(r.out.indexOf('702.2a')).toBeLessThan(r.out.indexOf('702.2b'));
  });

  test('a subsection prints an outline of its rules, not their sub-rules', () => {
    const r = run(['702']);
    expect(r.code).toBe(EXIT_OK);
    expect(r.out).toContain('CR 702 (Keyword Abilities)');
    expect(r.out).toMatch(/702\.2 {2}Sprocket {2}\(3 sub-rules\)/);
    expect(r.out).toMatch(/702\.4 {2}Synthetic rule about gears/);
    expect(r.out).not.toContain('702.2a');
  });

  test('a section prints an outline of its subsections', () => {
    const r = run(['7']);
    expect(r.code).toBe(EXIT_OK);
    expect(r.out).toMatch(/701 {2}Keyword Actions {2}\(2 rules\)/);
    expect(r.out).toMatch(/703 {2}Turn-Based Widgets/);
  });

  test('several numbers are printed one after another', () => {
    const r = run(['100.1a', '101.2']);
    expect(r.code).toBe(EXIT_OK);
    expect(r.out.indexOf('100.1a')).toBeLessThan(r.out.indexOf('101.2'));
  });

  test('lines are wrapped at 100 columns and indented under the number', () => {
    const dir = tempDir();
    const file = path.join(dir, 'long.txt');
    const longText = `100.1. ${'synthetic words '.repeat(30)}end`;
    writeFileSync(file, ['Title', '', '1. One', '', '100. General', '', longText].join('\n'));
    const r = run(['100.1'], file);
    const body = r.out
      .split('\n')
      .filter((l) => l.includes('synthetic words') || l.includes('end'));
    expect(body.length).toBeGreaterThan(1);
    for (const line of body) expect(line.length).toBeLessThanOrEqual(100);
    expect(body[1]?.startsWith('       ')).toBe(true);
  });

  test('accepts what people type: lowercase, trailing period, "rule" prefix', () => {
    expect(run(['rule 702.2B']).out).toContain('702.2b');
    expect(run(['702.2b.']).code).toBe(EXIT_OK);
  });

  test('an unknown number exits 1 and suggests nearby numbers', () => {
    const r = run(['702.2d']);
    expect(r.code).toBe(EXIT_NOT_FOUND);
    expect(r.err).toContain('No rule 702.2d');
    expect(r.err).toContain('Nearby numbers: 702.2a, 702.2b, 702.2c');
    expect(r.out).toBe('');
  });

  test('text that is not a number is a usage error that points at --search', () => {
    const r = run(['trample']);
    expect(r.code).toBe(EXIT_USAGE);
    expect(r.err).toContain('is not a rule number');
    expect(r.err).toContain('pnpm rule --search');
  });
});

describe('pnpm rule --search', () => {
  test('prints ranked matches, title first', () => {
    const r = run(['--search', 'sprocket']);
    expect(r.code).toBe(EXIT_OK);
    const lines = r.out.split('\n');
    expect(lines[0]).toBe('10 matches for "sprocket":');
    expect(lines[1]).toMatch(/^ {2}702\.2 {5}Sprocket$/);
    expect(lines[2]).toMatch(/^ {2}glossary {2}Sprocket: A synthetic keyword ability/);
    expect(r.out.indexOf('702.2a')).toBeGreaterThan(r.out.indexOf('glossary'));
  });

  test('joins several words after --search into one query', () => {
    const r = run(['--search', 'golden', 'widget']);
    expect(r.code).toBe(EXIT_OK);
    expect(r.out).toContain('101 ');
  });

  test('--limit caps the output and says that more exist', () => {
    const r = run(['--search', 'widget', '--limit', '2']);
    expect(r.code).toBe(EXIT_OK);
    expect(r.out).toContain('First 2 matches');
    expect(r.out).toContain('raise --limit');
    expect(r.out.split('\n').filter((l) => /^ {2}\S/.test(l))).toHaveLength(2);
  });

  test('no matches exits 1', () => {
    const r = run(['--search', 'zzzxqv']);
    expect(r.code).toBe(EXIT_NOT_FOUND);
    expect(r.out).toBe('No matches for "zzzxqv".');
  });

  test('--search without text is a usage error', () => {
    expect(run(['--search']).code).toBe(EXIT_USAGE);
  });
});

describe('pnpm rule --glossary', () => {
  test('prints the entry', () => {
    const r = run(['--glossary', 'sprocket']);
    expect(r.code).toBe(EXIT_OK);
    expect(r.out).toContain(
      'Sprocket\n  A synthetic keyword ability that makes a widget turn clockwise.',
    );
  });

  test('prints numbered definitions on separate lines and related entries after', () => {
    const r = run(['-g', 'widget']);
    expect(r.out).toContain('  1. A synthetic object used in tests.\n  2. The synthetic thing');
    expect(r.out).toContain('Related entries:\nActive Widget, Inactive Widget');
  });

  test('an unknown term exits 1', () => {
    const r = run(['--glossary', 'trample']);
    expect(r.code).toBe(EXIT_NOT_FOUND);
    expect(r.out).toBe('No glossary entry matches "trample".');
  });
});

describe('pnpm rule --check', () => {
  test('prints counts, the effective date and the unparsed line', () => {
    const r = run(['--check']);
    expect(r.code).toBe(EXIT_OK);
    expect(r.out).toContain('Effective date:       March 3, 2099 (2099-03-03)');
    expect(r.out).toContain('Sections:             4');
    expect(r.out).toContain('Rules:                16 (plus 12 lettered sub-rules)');
    expect(r.out).toContain('Glossary entries:     5');
    expect(r.out).toContain('Unparsed lines:       1');
    expect(r.out).toContain('utf-8-bom');
    expect(r.out).toContain('unparsed-line: Line does not match any known CR line shape.');
    expect(r.out).toContain('> ~~ SYNTHETIC ODD LINE');
  });

  test('exits 1 when no numbered rules were recognized', () => {
    const dir = tempDir();
    const file = path.join(dir, 'notrules.txt');
    writeFileSync(file, 'This is not\nthe rules file.\n');
    const r = run(['--check'], file);
    expect(r.code).toBe(EXIT_NOT_FOUND);
    expect(r.out).toContain('Effective date:       NOT FOUND');
    expect(r.out).toContain('PROBLEM: no numbered rules were recognized');
  });

  test('truncates a long diagnostics list', () => {
    const dir = tempDir();
    const file = path.join(dir, 'noisy.txt');
    const noise = Array.from({ length: 30 }, (_, i) => `stray synthetic line ${i}`).flatMap((l) => [
      '',
      l,
    ]);
    writeFileSync(
      file,
      ['Title', '', '1. One', '', '100. General', '', '100.1. Rule.', ...noise].join('\n'),
    );
    const r = run(['--check'], file);
    expect(r.out).toContain('Unparsed lines:       30');
    expect(r.out).toContain('and 12 more');
  });
});

describe('missing or unreadable CR file', () => {
  test('a nonexistent path exits 2 and says exactly how to get the file', () => {
    const missing = path.join(tempDir(), 'nope', 'comprehensive-rules.txt');
    for (const argv of [['702.2b'], ['--search', 'x'], ['--glossary', 'x'], ['--check']]) {
      const r = run(argv, missing);
      expect(r.code).toBe(EXIT_MISSING_FILE);
      expect(r.out).toBe('');
      expect(r.err).toContain(missing);
      expect(r.err).toContain('pnpm rules:fetch');
      expect(r.err).toContain('https://magic.wizards.com/en/rules');
      expect(r.err).toContain(CR_FILE_REPO_PATH);
      expect(r.err).toContain('docs/rules/RULES_VERSION.md');
    }
  });

  test('--file overrides the default path', () => {
    const missing = path.join(tempDir(), 'other.txt');
    const r = run(['--file', missing, '702.2b'], FIXTURE);
    expect(r.code).toBe(EXIT_MISSING_FILE);
    expect(r.err).toContain(missing);
    expect(run([`--file=${FIXTURE}`, '702.2b'], missing).code).toBe(EXIT_OK);
  });

  test('a path that cannot be read as a file exits 2 with the reason', () => {
    const dir = tempDir();
    const asDirectory = path.join(dir, 'a-directory');
    mkdirSync(asDirectory);
    const r = run(['--check'], asDirectory);
    expect(r.code).toBe(EXIT_MISSING_FILE);
    expect(r.err).toContain('Could not read the Comprehensive Rules file');
    expect(r.err).not.toContain('pnpm rules:fetch');
  });

  test('loadCr reports missing and unreadable separately and never throws', () => {
    const dir = tempDir();
    const missing = loadCr(path.join(dir, 'missing.txt'));
    expect(missing).toMatchObject({ ok: false, reason: 'missing' });
    const unreadable = loadCr(dir);
    expect(unreadable).toMatchObject({ ok: false, reason: 'unreadable' });
    const good = loadCr(FIXTURE);
    expect(good.ok).toBe(true);
    if (good.ok) {
      expect(good.loaded.byteSize).toBeGreaterThan(1000);
      expect(good.loaded.encoding).toBe('utf-8-bom');
    }
  });

  test('the canonical CR file is docs/rules/comprehensive-rules.txt in the repo', () => {
    expect(CR_FILE.endsWith(path.join('docs', 'rules', 'comprehensive-rules.txt'))).toBe(true);
    expect(CR_FILE_REPO_PATH).toBe('docs/rules/comprehensive-rules.txt');
  });
});

describe('usage', () => {
  test('no arguments prints usage to stderr and exits 64', () => {
    const r = run([]);
    expect(r.code).toBe(EXIT_USAGE);
    expect(r.out).toBe('');
    expect(r.err).toContain('pnpm rule --search <text>');
  });

  test('--help prints usage to stdout and exits 0', () => {
    for (const flag of ['--help', '-h']) {
      const r = run([flag]);
      expect(r.code).toBe(EXIT_OK);
      expect(r.out).toContain('pnpm rule --glossary <term>');
      expect(r.err).toBe('');
    }
  });

  test('unknown options, conflicting modes and bad limits exit 64', () => {
    expect(run(['--bogus']).code).toBe(EXIT_USAGE);
    expect(run(['--search', 'a', '--check']).code).toBe(EXIT_USAGE);
    expect(run(['--check', '702']).code).toBe(EXIT_USAGE);
    expect(run(['--search', 'a', '--limit', 'abc']).code).toBe(EXIT_USAGE);
    expect(run(['--search', 'a', '--limit']).code).toBe(EXIT_USAGE);
    expect(run(['--file']).code).toBe(EXIT_USAGE);
  });

  test('a bare "--" separator is ignored', () => {
    expect(run(['--', '702.2b']).code).toBe(EXIT_OK);
  });

  test('parseArgs collects search words until the next flag', () => {
    const parsed = parseArgs(['--search', 'first', 'strike', '--limit=3', '--file', 'x.txt']);
    expect(parsed).toMatchObject({ mode: 'search', text: 'first strike', limit: 3, file: 'x.txt' });
    expect(parsed.errors).toEqual([]);
  });
});
