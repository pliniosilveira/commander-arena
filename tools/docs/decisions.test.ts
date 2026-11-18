// docs/decisions/ stays one short file: a decision is a bullet of at most 60 words in README.md, and only when no other document covers it.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs/decisions');
const LIMIT = 60;

test('the folder holds only README.md: a decision is a bullet, not a new file', () => {
  expect(readdirSync(DIR)).toEqual(['README.md']);
});

test(`every decision bullet has at most ${LIMIT} words`, () => {
  const long = readFileSync(path.join(DIR, 'README.md'), 'utf8')
    .split('\n')
    .filter((line) => line.startsWith('- '))
    .map((line) => ({ words: line.split(/\s+/).length - 1, start: line.slice(0, 60) }))
    .filter((bullet) => bullet.words > LIMIT);
  expect(long).toEqual([]);
});
