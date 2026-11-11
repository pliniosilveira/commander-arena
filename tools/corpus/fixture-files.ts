// Writes SYNTHETIC cards to disk in the three input forms the tools accept.

import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

export interface Forms {
  readonly dir: string;
  readonly gz: string;
  readonly jsonl: string;
  readonly json: string;
}

export async function tempDir(prefix = 'corpus-test-'): Promise<string> {
  return mkdtemp(path.join(tmpdir(), prefix));
}

/** The same cards as `oracle.jsonl.gz`, `oracle.jsonl` and `oracle.json` (a JSON array). */
export async function writeForms(cards: readonly object[], dir?: string): Promise<Forms> {
  const target = dir ?? (await tempDir());
  const jsonlText = `${cards.map((card) => JSON.stringify(card)).join('\n')}\n`;
  const forms: Forms = {
    dir: target,
    gz: path.join(target, 'oracle.jsonl.gz'),
    jsonl: path.join(target, 'oracle.jsonl'),
    json: path.join(target, 'oracle.json'),
  };
  await writeFile(forms.gz, gzipSync(jsonlText));
  await writeFile(forms.jsonl, jsonlText);
  await writeFile(forms.json, JSON.stringify(cards, null, 1));
  return forms;
}

/** An in-memory async iterable of string chunks of fixed size, for the splitting tests. */
export async function* chunked(text: string, size: number): AsyncGenerator<string> {
  for (let i = 0; i < text.length; i += size) yield text.slice(i, i + size);
}
