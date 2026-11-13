// `node tools/corpus/coverage-badge.ts --baseline <json> --reports <dir> --out <dir> --date <YYYY-MM-DD>` (D-396): turns the numbers of a
// coverage run (the baseline JSON that `pnpm coverage:cards --update-baseline --baseline <file>` writes) into what the repository's front
// page shows, a small site for GitHub Pages: `coverage.json`, `coverage-top500.json` and `coverage-top1000.json` (the endpoint format of
// shields.io, for a README badge), `coverage.svg` (a self-contained image of the three shares), and `index.html` with the full report as
// text. The weekly workflow `coverage-report.yml` runs it and deploys the folder, so the README never needs a pull request to stay current.
// No network and no dependency; the date is an argument, never the clock.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

interface Share {
  readonly supported: number;
  readonly total: number;
}

export interface CoverageNumbers {
  readonly source: string;
  readonly parserVersion: number;
  readonly all: Share;
  readonly top500: Share;
  readonly top1000: Share;
}

const isShare = (v: unknown): v is Share => {
  if (typeof v !== 'object' || v === null) return false;
  const { supported, total } = v as Record<string, unknown>;
  return Number.isInteger(supported) && Number.isInteger(total) && (total as number) > 0;
};

/** The numbers of a baseline file's text, or an Error that says what is wrong. */
export function parseNumbers(text: string): CoverageNumbers | Error {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return new Error('the coverage numbers are not JSON');
  }
  const v = (value ?? {}) as Record<string, unknown>;
  if (typeof v.source !== 'string' || !Number.isInteger(v.parserVersion)) {
    return new Error('the coverage numbers lack their source or parser version');
  }
  if (!isShare(v.all) || !isShare(v.top500) || !isShare(v.top1000)) {
    return new Error('the coverage numbers lack a share (all, top500, top1000)');
  }
  return {
    source: v.source,
    parserVersion: v.parserVersion as number,
    all: v.all,
    top500: v.top500,
    top1000: v.top1000,
  };
}

/** `11696` as `11,696` (no locale: the output must not depend on the machine). */
export function group(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export const percentOf = (s: Share): number => (s.supported / s.total) * 100;
export const percentText = (s: Share): string => `${percentOf(s).toFixed(1)}%`;

/** A shields.io colour name for a share. */
export function colorOf(s: Share): string {
  const p = percentOf(s);
  if (p < 20) return 'red';
  if (p < 40) return 'orange';
  if (p < 60) return 'yellow';
  if (p < 80) return 'yellowgreen';
  return 'green';
}

/** The endpoint JSON that shields.io draws as a badge (https://shields.io/badges/endpoint-badge). */
export function badgeJson(label: string, s: Share): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    label,
    message: `${percentText(s)} (${group(s.supported)} of ${group(s.total)})`,
    color: colorOf(s),
  })}\n`;
}

const FILL: Record<string, string> = {
  red: '#d1242f',
  orange: '#e16f24',
  yellow: '#bf8700',
  yellowgreen: '#6f9a1f',
  green: '#1a7f37',
};

const esc = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The date a bulk file was made, from its name ("oracle_cards-2026-10-22T21-..."), or the name itself. */
export function sourceDate(source: string): string {
  return /(\d{4}-\d{2}-\d{2})/.exec(source)?.[1] ?? source;
}

/** A self-contained image of the three shares; it follows a dark or light page through `prefers-color-scheme`. */
export function renderSvg(n: CoverageNumbers, updated: string): string {
  const rows: { label: string; share: Share }[] = [
    { label: 'All Commander cards', share: n.all },
    { label: 'Top 500 by EDHREC rank', share: n.top500 },
    { label: 'Top 1,000 by EDHREC rank', share: n.top1000 },
  ];
  const barX = 200;
  const barW = 220;
  const body = rows
    .map((r, i) => {
      const y = 52 + i * 34;
      const w = Math.max(1, Math.round((barW * r.share.supported) / r.share.total));
      return [
        `<text class="t" x="16" y="${y + 13}">${esc(r.label)}</text>`,
        `<rect class="track" x="${barX}" y="${y}" width="${barW}" height="18" rx="3"/>`,
        `<rect x="${barX}" y="${y}" width="${w}" height="18" rx="3" fill="${FILL[colorOf(r.share)]}"/>`,
        `<text class="t b" x="${barX + barW + 12}" y="${y + 13}">${percentText(r.share)}</text>`,
        `<text class="m" x="${barX + barW + 64}" y="${y + 13}">${group(r.share.supported)} / ${group(r.share.total)}</text>`,
      ].join('');
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="168" viewBox="0 0 640 168" role="img" aria-label="Share of Commander cards the engine fully supports">
<style>
.bg{fill:#ffffff;stroke:#d0d7de}.t{fill:#1f2328;font:14px sans-serif}.b{font-weight:700}.m{fill:#59636e;font:12px sans-serif}.track{fill:#eaeef2}
@media (prefers-color-scheme: dark){.bg{fill:#0d1117;stroke:#3d444d}.t{fill:#f0f6fc}.m{fill:#9198a1}.track{fill:#262c36}}
</style>
<rect class="bg" x="0.5" y="0.5" width="639" height="167" rx="6"/>
<text class="t b" x="16" y="30" font-size="15">Cards the engine fully supports</text>
${body}
<text class="m" x="16" y="154">Updated ${esc(updated)} · card list of ${esc(sourceDate(n.source))} · parser version ${n.parserVersion}</text>
</svg>
`;
}

/** The page the badge links to: the numbers, the image and the report as text. */
export function renderIndex(n: CoverageNumbers, updated: string, report: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Commander Arena: card coverage</title>
<style>body{font:16px/1.5 sans-serif;max-width:60rem;margin:2rem auto;padding:0 1rem}pre{overflow:auto;background:#8881;padding:1rem;border-radius:6px}</style>
</head><body>
<h1>Card coverage</h1>
<p>The share of Commander-legal cards that the engine of <a href="https://github.com/pliniosilveira/commander-arena">Commander Arena</a> fully supports. Updated ${esc(updated)}, every week, from Scryfall's card list of ${esc(sourceDate(n.source))} (parser version ${n.parserVersion}).</p>
<p><img src="coverage.svg" alt="Share of Commander cards the engine fully supports" width="640" height="168"></p>
<p><a href="backlog.txt">The ranked list of what blocks the most cards</a> · <a href="coverage-baseline.json">the numbers</a></p>
<h2>The report</h2>
<pre>${esc(report)}</pre>
</body></html>
`;
}

/** The command line: reads the numbers and the reports, writes the site, returns the exit code. */
export async function main(argv: readonly string[], out: (text: string) => void): Promise<number> {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      baseline: { type: 'string' },
      reports: { type: 'string' },
      out: { type: 'string' },
      date: { type: 'string' },
    },
  });
  if (!values.baseline || !values.reports || !values.out || !values.date) {
    out(
      'usage: coverage-badge.ts --baseline <json> --reports <dir> --out <dir> --date <YYYY-MM-DD>',
    );
    return 2;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.date)) {
    out('error: --date must be YYYY-MM-DD');
    return 2;
  }
  const text = await readFile(values.baseline, 'utf8');
  const numbers = parseNumbers(text);
  if (numbers instanceof Error) {
    out(`error: ${numbers.message}`);
    return 2;
  }
  const report = await readFile(path.join(values.reports, 'coverage.md'), 'utf8');
  const backlog = await readFile(path.join(values.reports, 'backlog.md'), 'utf8');
  const outDir = values.out;
  await mkdir(outDir, { recursive: true });
  const put = (name: string, content: string) => writeFile(path.join(outDir, name), content);
  await put('coverage.json', badgeJson('cards supported', numbers.all));
  await put('coverage-top500.json', badgeJson('top 500 supported', numbers.top500));
  await put('coverage-top1000.json', badgeJson('top 1000 supported', numbers.top1000));
  await put('coverage.svg', renderSvg(numbers, values.date));
  await put('index.html', renderIndex(numbers, values.date, report));
  await put('backlog.txt', backlog);
  await put('coverage-baseline.json', text);
  out(
    `wrote the coverage site to ${values.out}: ${percentText(numbers.all)} of ${group(numbers.all.total)} cards`,
  );
  return 0;
}
