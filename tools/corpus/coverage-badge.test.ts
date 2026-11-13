// The coverage site (D-396) from a SYNTHETIC set of numbers: nothing here is a real coverage run.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  badgeJson,
  colorOf,
  group,
  main,
  parseNumbers,
  percentText,
  renderIndex,
  renderSvg,
  sourceDate,
} from './coverage-badge.ts';
import { tempDir } from './fixture-files.ts';

const NUMBERS = {
  source: 'oracle_cards-2026-11-20T09-00-00-000-00-00.jsonl.gz',
  parserVersion: 99,
  all: { supported: 12345, total: 30000 },
  top500: { supported: 400, total: 500 },
  top1000: { supported: 620, total: 1000 },
};
const TEXT = JSON.stringify({ version: 1, scope: 'commander-legal', ...NUMBERS });

describe('the numbers', () => {
  test('are read from the baseline file, and a damaged one says what is wrong', () => {
    expect(parseNumbers(TEXT)).toMatchObject({ parserVersion: 99, all: { supported: 12345 } });
    expect(parseNumbers('{')).toBeInstanceOf(Error);
    expect(parseNumbers('{"source":"x"}')).toBeInstanceOf(Error);
    const noTotal = JSON.stringify({ ...NUMBERS, all: { supported: 1, total: 0 } });
    expect(parseNumbers(noTotal)).toBeInstanceOf(Error);
  });

  test('are written the same on any machine', () => {
    expect(group(11696)).toBe('11,696');
    expect(group(500)).toBe('500');
    expect(percentText(NUMBERS.all)).toBe('41.1%');
    expect(sourceDate(NUMBERS.source)).toBe('2026-11-20');
  });
});

describe('the badge', () => {
  test('is the endpoint format of shields.io, coloured by the share', () => {
    expect(JSON.parse(badgeJson('cards supported', NUMBERS.all))).toEqual({
      schemaVersion: 1,
      label: 'cards supported',
      message: '41.1% (12,345 of 30,000)',
      color: 'yellow',
    });
    expect(colorOf({ supported: 10, total: 100 })).toBe('red');
    expect(colorOf({ supported: 30, total: 100 })).toBe('orange');
    expect(colorOf({ supported: 70, total: 100 })).toBe('yellowgreen');
    expect(colorOf({ supported: 90, total: 100 })).toBe('green');
  });
});

describe('the image and the page', () => {
  test('the image shows the three shares, the date and the parser, and escapes what it prints', () => {
    const svg = renderSvg({ ...NUMBERS, source: 'a<b>&"c' }, '2026-11-20');
    expect(svg).toContain('41.1%');
    expect(svg).toContain('80.0%');
    expect(svg).toContain('62.0%');
    expect(svg).toContain('12,345 / 30,000');
    expect(svg).toContain('Updated 2026-11-20');
    expect(svg).toContain('parser version 99');
    expect(svg).toContain('a&lt;b&gt;&amp;&quot;c');
    expect(svg).not.toContain('a<b>');
    expect(svg).toContain('prefers-color-scheme: dark');
  });

  test('the page carries the report as text, escaped', () => {
    const html = renderIndex(NUMBERS, '2026-11-20', '# Card coverage\n| a | <b> |');
    expect(html).toContain('coverage.svg');
    expect(html).toContain('&lt;b&gt;');
    expect(html).not.toContain('<b> |');
  });
});

describe('the command line', () => {
  test('writes the whole site from a baseline and the two reports', async () => {
    const dir = await tempDir();
    await writeFile(path.join(dir, 'baseline.json'), TEXT);
    await writeFile(path.join(dir, 'coverage.md'), '# Card coverage\n');
    await writeFile(path.join(dir, 'backlog.md'), '# Backlog\n');
    const lines: string[] = [];
    const site = path.join(dir, 'site');
    const code = await main(
      [
        '--baseline',
        path.join(dir, 'baseline.json'),
        '--reports',
        dir,
        '--out',
        site,
        '--date',
        '2026-11-20',
      ],
      (t) => lines.push(t),
    );
    expect(code).toBe(0);
    expect(lines.join('\n')).toContain('41.1% of 30,000 cards');
    for (const name of [
      'coverage.json',
      'coverage-top500.json',
      'coverage-top1000.json',
      'coverage.svg',
      'index.html',
      'backlog.txt',
      'coverage-baseline.json',
    ]) {
      expect((await readFile(path.join(site, name), 'utf8')).length).toBeGreaterThan(5);
    }
  });

  test('refuses a missing argument, a bad date and damaged numbers', async () => {
    const dir = await tempDir();
    await writeFile(path.join(dir, 'bad.json'), '{}');
    const say = () => undefined;
    expect(await main([], say)).toBe(2);
    const args = (baseline: string, date: string) => [
      '--baseline',
      path.join(dir, baseline),
      '--reports',
      dir,
      '--out',
      path.join(dir, 'o'),
      '--date',
      date,
    ];
    expect(await main(args('bad.json', 'yesterday'), say)).toBe(2);
    expect(await main(args('bad.json', '2026-11-20'), say)).toBe(2);
  });
});
