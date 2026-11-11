// Streams Scryfall card objects out of an `oracle_cards` bulk file with constant memory.
//
// Three input forms are accepted and recognised by content, not by file name:
//   gzipped JSON Lines (what Scryfall serves today, D-048): first two bytes are 1f 8b
//   plain JSON Lines: one card object per line
//   a JSON array of card objects (the older bulk format)
// A gzip stream wrapped around either plain form works too. A line or array element that is not
// valid JSON is reported as a `bad` item and skipped; it never stops the run.

import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';

export type CardItem =
  | { readonly kind: 'card'; readonly value: unknown }
  | { readonly kind: 'bad'; readonly where: string; readonly message: string };

const GZIP_MAGIC = [0x1f, 0x8b];

async function isGzip(file: string): Promise<boolean> {
  const handle = await open(file, 'r');
  try {
    const head = Buffer.alloc(2);
    const { bytesRead } = await handle.read(head, 0, 2, 0);
    return bytesRead === 2 && head[0] === GZIP_MAGIC[0] && head[1] === GZIP_MAGIC[1];
  } finally {
    await handle.close();
  }
}

/** The decoded text of the file as an async stream of string chunks. */
async function textChunks(file: string): Promise<AsyncIterable<string>> {
  const gzip = await isGzip(file);
  const input = createReadStream(file);
  let source: Readable = input;
  if (gzip) {
    const gunzip = createGunzip();
    // pipe() does not forward errors: a missing or unreadable file must still reject the reader.
    input.on('error', (error) => gunzip.destroy(error));
    source = input.pipe(gunzip);
  }
  source.setEncoding('utf8');
  return source as AsyncIterable<string>;
}

/** Splits chunks into lines without ever holding more than one line and one chunk. */
export async function* lines(chunks: AsyncIterable<string>): AsyncGenerator<string> {
  let rest = '';
  for await (const chunk of chunks) {
    rest += chunk;
    let start = 0;
    for (let nl = rest.indexOf('\n', start); nl !== -1; nl = rest.indexOf('\n', start)) {
      yield rest.slice(start, nl);
      start = nl + 1;
    }
    rest = rest.slice(start);
  }
  if (rest.length > 0) yield rest;
}

const isWhitespace = (c: number) => c === 32 || c === 10 || c === 13 || c === 9;

/**
 * The text of each element of a top-level JSON array, one at a time. Tracks nesting and strings
 * only; it does not parse. Throws when the text is not a single array (that is not a bad line:
 * nothing after it can be trusted).
 */
export async function* arrayElements(chunks: AsyncIterable<string>): AsyncGenerator<string> {
  let opened = false;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let started = false;
  let parts: string[] = [];
  for await (const chunk of chunks) {
    let from = 0;
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk.charCodeAt(i);
      if (inString) {
        if (escaped) escaped = false;
        else if (c === 92) escaped = true;
        else if (c === 34) inString = false;
        continue;
      }
      if (!opened) {
        if (isWhitespace(c)) continue;
        if (c !== 91) throw new Error('expected a JSON array of card objects');
        opened = true;
        depth = 1;
        continue;
      }
      if (depth === 0) {
        if (isWhitespace(c)) continue;
        throw new Error('unexpected text after the end of the JSON array');
      }
      if (!started) {
        if (isWhitespace(c) || c === 44) continue;
        if (c === 93) {
          depth = 0;
          continue;
        }
        started = true;
        from = i;
      }
      if (c === 34) {
        inString = true;
      } else if (c === 123 || c === 91) {
        depth += 1;
      } else if (c === 125 || c === 93) {
        depth -= 1;
        if (depth <= 1) {
          // `}` or `]` closing an object or array element (depth 1), or the final `]` after a
          // scalar element (depth 0).
          const end = depth === 1 ? i + 1 : i;
          yield parts.join('') + chunk.slice(from, end);
          parts = [];
          started = false;
        }
      } else if (c === 44 && depth === 1) {
        yield parts.join('') + chunk.slice(from, i);
        parts = [];
        started = false;
      }
    }
    if (started) {
      parts.push(chunk.slice(from));
    }
  }
  if (!opened || depth !== 0 || started) throw new Error('the JSON array is not terminated');
}

/** Reads the first non-blank character without losing it: returns it and a replaying iterable. */
async function sniff(
  chunks: AsyncIterable<string>,
): Promise<{ first: string | undefined; all: AsyncIterable<string> }> {
  const iterator = chunks[Symbol.asyncIterator]();
  const buffered: string[] = [];
  let first: string | undefined;
  for (;;) {
    const next = await iterator.next();
    if (next.done) break;
    buffered.push(next.value);
    const text = next.value.replace(/^﻿/, '').trimStart();
    if (text.length > 0) {
      first = text[0];
      break;
    }
  }
  async function* replay(): AsyncGenerator<string> {
    yield* buffered;
    for (;;) {
      const next = await iterator.next();
      if (next.done) return;
      yield next.value;
    }
  }
  return { first, all: replay() };
}

function parseJson(text: string, where: string): CardItem {
  try {
    return { kind: 'card', value: JSON.parse(text) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { kind: 'bad', where, message };
  }
}

/** Every card object of the file, in file order, with malformed entries as `bad` items. */
export async function* readCardObjects(file: string): AsyncGenerator<CardItem> {
  const { first, all } = await sniff(await textChunks(file));
  if (first === '[') {
    let index = 0;
    for await (const element of arrayElements(all)) {
      index += 1;
      yield parseJson(element, `array element ${index}`);
    }
    return;
  }
  let lineNumber = 0;
  for await (const raw of lines(all)) {
    lineNumber += 1;
    const text = raw.replace(/^﻿/, '').trim();
    if (text.length === 0) continue;
    yield parseJson(text, `line ${lineNumber}`);
  }
}
