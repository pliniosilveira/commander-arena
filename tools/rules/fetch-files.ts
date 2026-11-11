// Turning downloaded bytes into installed files: the rules-source.json record and an atomic write.

import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { decodeCrBytes, parseCr } from './cr.ts';
import { fileNameOfUrl } from './fetch-discover.ts';

export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = (error as { cause?: unknown }).cause;
  if (cause instanceof Error) {
    const code = (cause as { code?: unknown }).code;
    return `${error.message}: ${typeof code === 'string' ? `${code} ` : ''}${cause.message}`;
  }
  return error.message;
}

export interface RulesSource {
  readonly schema: 1;
  readonly sourceUrl: string;
  readonly requestedUrl: string;
  readonly discovery: 'rules-page' | 'explicit-url';
  readonly originalFileName: string;
  readonly sha256: string;
  readonly byteSize: number;
  readonly fetchedAt: string;
  readonly encoding: string;
  readonly effectiveDate: string | null;
  readonly effectiveDateText: string | null;
  readonly parse: {
    readonly sections: number;
    readonly subsections: number;
    readonly rules: number;
    readonly subrules: number;
    readonly glossaryEntries: number;
    readonly unparsedLines: number;
    readonly diagnostics: number;
  };
}

export interface SourceInput {
  readonly bytes: Uint8Array;
  readonly sourceUrl: string;
  readonly requestedUrl: string;
  readonly discovery: RulesSource['discovery'];
  readonly fetchedAt: string;
}

/** Decodes and parses the downloaded bytes and describes them (hash, size, effective date). */
export function buildRulesSource(input: SourceInput): RulesSource {
  const decoded = decodeCrBytes(input.bytes);
  const { stats, effectiveDate, effectiveDateText } = parseCr(decoded.text);
  return {
    schema: 1,
    sourceUrl: input.sourceUrl,
    requestedUrl: input.requestedUrl,
    discovery: input.discovery,
    originalFileName: fileNameOfUrl(input.sourceUrl),
    sha256: createHash('sha256').update(input.bytes).digest('hex'),
    byteSize: input.bytes.byteLength,
    fetchedAt: input.fetchedAt,
    encoding: decoded.encoding,
    effectiveDate,
    effectiveDateText,
    parse: {
      sections: stats.sectionCount,
      subsections: stats.subsectionCount,
      rules: stats.ruleCount,
      subrules: stats.subruleCount,
      glossaryEntries: stats.glossaryCount,
      unparsedLines: stats.unparsedLineCount,
      diagnostics: stats.diagnosticCount,
    },
  };
}

function removeQuietly(file: string): void {
  try {
    rmSync(file, { force: true });
  } catch {
    // Best effort: a temporary file that cannot be removed must not hide the original error.
  }
}

export type InstallResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly detail: string; readonly crInstalled: boolean };

/** Writes both files through temporary names, then renames them. Never leaves a partial file. */
export function installFiles(
  files: { readonly crPath: string; readonly sourcePath: string },
  bytes: Uint8Array,
  source: RulesSource,
): InstallResult {
  const suffix = `.${randomBytes(4).toString('hex')}.tmp`;
  const tmpCr = `${files.crPath}${suffix}`;
  const tmpSource = `${files.sourcePath}${suffix}`;
  let crInstalled = false;
  try {
    mkdirSync(path.dirname(files.crPath), { recursive: true });
    writeFileSync(tmpCr, bytes, { flag: 'wx' });
    writeFileSync(tmpSource, `${JSON.stringify(source, null, 2)}\n`, { flag: 'wx' });
    renameSync(tmpCr, files.crPath);
    crInstalled = true;
    renameSync(tmpSource, files.sourcePath);
    return { ok: true };
  } catch (error) {
    removeQuietly(tmpCr);
    removeQuietly(tmpSource);
    return { ok: false, detail: describeError(error), crInstalled };
  }
}
