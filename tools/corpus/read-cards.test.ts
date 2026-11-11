// SYNTHETIC input only. The reader must give the same cards for the three file forms, split
// correctly at any chunk boundary, and skip (not die on) malformed entries.

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, test } from 'vitest';
import { chunked, tempDir, writeForms } from './fixture-files.ts';
import { arrayElements, lines, readCardObjects } from './read-cards.ts';
import { syntheticCards } from './synthetic.ts';

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of iterable) out.push(item);
  return out;
}

describe('readCardObjects', () => {
  test('reads gzipped JSON Lines, plain JSON Lines and a JSON array alike', async () => {
    const cards = syntheticCards();
    const forms = await writeForms(cards);
    const expected = cards.map((card) => ({
      kind: 'card',
      value: JSON.parse(JSON.stringify(card)),
    }));
    for (const file of [forms.gz, forms.jsonl, forms.json]) {
      expect(await collect(readCardObjects(file))).toEqual(expected);
    }
  });

  test('recognises gzip by content, not by the file name', async () => {
    const dir = await tempDir();
    const file = path.join(dir, 'looks-plain.txt');
    await writeFile(file, gzipSync('{"a":1}\n{"a":2}\n'));
    expect(await collect(readCardObjects(file))).toEqual([
      { kind: 'card', value: { a: 1 } },
      { kind: 'card', value: { a: 2 } },
    ]);
  });

  test('reads a gzipped JSON array too', async () => {
    const dir = await tempDir();
    const file = path.join(dir, 'array.json.gz');
    await writeFile(file, gzipSync('[{"a":1},\n{"a":2}]'));
    expect((await collect(readCardObjects(file))).map((item) => item.kind)).toEqual([
      'card',
      'card',
    ]);
  });

  test('skips a malformed line, reports where, and carries on', async () => {
    const dir = await tempDir();
    const file = path.join(dir, 'bad.jsonl');
    await writeFile(file, '{"a":1}\n{"a": oops}\n\n   \n{"a":3}\r\n');
    const items = await collect(readCardObjects(file));
    expect(items).toHaveLength(3);
    expect(items[0]).toEqual({ kind: 'card', value: { a: 1 } });
    expect(items[1]).toMatchObject({ kind: 'bad', where: 'line 2' });
    expect(items[2]).toEqual({ kind: 'card', value: { a: 3 } });
  });

  test('skips a malformed array element', async () => {
    const dir = await tempDir();
    const file = path.join(dir, 'bad.json');
    await writeFile(file, '[{"a":1}, {"a": }, {"a":3}]');
    const items = await collect(readCardObjects(file));
    expect(items.map((item) => item.kind)).toEqual(['card', 'bad', 'card']);
    expect(items[1]).toMatchObject({ where: 'array element 2' });
  });

  test('accepts a final line without a newline and a byte order mark', async () => {
    const dir = await tempDir();
    const file = path.join(dir, 'bom.jsonl');
    await writeFile(file, '﻿{"a":1}\n{"a":2}');
    expect((await collect(readCardObjects(file))).map((item) => item.kind)).toEqual([
      'card',
      'card',
    ]);
  });

  test('rejects a missing file and a file that is not an array or lines', async () => {
    const dir = await tempDir();
    await expect(collect(readCardObjects(path.join(dir, 'missing.jsonl.gz')))).rejects.toThrow();
    const broken = path.join(dir, 'broken.json');
    await writeFile(broken, '[{"a":1}, {"a":2}');
    await expect(collect(readCardObjects(broken))).rejects.toThrow('not terminated');
  });

  test('an empty file yields nothing', async () => {
    const dir = await tempDir();
    const file = path.join(dir, 'empty.jsonl');
    await writeFile(file, '');
    expect(await collect(readCardObjects(file))).toEqual([]);
  });
});

describe('lines', () => {
  test('splits at every chunk size, keeping multi-byte text whole', async () => {
    const text = 'α\nbeta\n\nγγγ\nlast';
    for (const size of [1, 2, 3, 5, 100]) {
      expect(await collect(lines(chunked(text, size)))).toEqual(['α', 'beta', '', 'γγγ', 'last']);
    }
  });
});

describe('arrayElements', () => {
  const text = JSON.stringify([
    { name: 'a "quoted" } ] , name', n: [1, 2, { x: '\\' }] },
    { text: 'line\nbreak, with [brackets] and {braces}' },
    7,
    'str, with comma',
    [1, [2, 3]],
  ]);

  test('finds each element at every chunk size, strings and nesting included', async () => {
    for (const size of [1, 2, 3, 7, 1000]) {
      const elements = await collect(arrayElements(chunked(text, size)));
      expect(elements.map((e) => JSON.parse(e))).toEqual(JSON.parse(text));
    }
  });

  test('an empty array has no elements', async () => {
    expect(await collect(arrayElements(chunked(' [ ] ', 2)))).toEqual([]);
  });

  test('text that is not an array is an error', async () => {
    await expect(collect(arrayElements(chunked('{"a":1}', 3)))).rejects.toThrow('JSON array');
    await expect(collect(arrayElements(chunked('[1] x', 3)))).rejects.toThrow('after the end');
  });
});
