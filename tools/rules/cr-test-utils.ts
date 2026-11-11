// Shared helpers for the CR parser tests. Everything here is SYNTHETIC test input.

import { readFileSync } from 'node:fs';
import { decodeCrBytes, type ParsedCr, parseCr } from './cr.ts';

export const fixtureBytes = readFileSync(new URL('./fixtures/synthetic-cr.txt', import.meta.url));
export const decoded = decodeCrBytes(fixtureBytes);
export const cr = parseCr(decoded.text);

export function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`expected ${what} to exist`);
  return value;
}

/** SYNTHETIC mini document builder: pass body lines, get a complete small file. */
export function miniDoc(body: readonly string[], opts: { glossary?: boolean } = {}): string {
  const lines = [
    'Synthetic Mini Title',
    '',
    'These rules are effective as of January 5, 2099.',
    '',
    'Contents',
    '',
    '1. One',
    '100. General',
    'Glossary',
    'Credits',
    '',
    '1. One',
    '',
    '100. General',
    '',
    ...body,
  ];
  if (opts.glossary !== false) {
    lines.push('', 'Glossary', '', 'Thing', 'A synthetic thing.');
  }
  lines.push('', 'Credits', '', 'Synthetic credit line.');
  return lines.join('\n');
}

export function kinds(parsed: ParsedCr): string[] {
  return parsed.diagnostics.map((d) => d.kind);
}
