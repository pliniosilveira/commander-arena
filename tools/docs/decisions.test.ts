// docs/decisions/ stays small: five topic files and a README, each decision one bullet of at most 60 words (docs/decisions/README.md).

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs/decisions');
const TOPICS = ['ai.md', 'cards.md', 'engine.md', 'repo.md', 'web.md'];
const LIMIT = 60;

test('the folder holds only the topic files and the README: a decision is a bullet, not a new file', () => {
  const extra = readdirSync(DIR).filter((name) => name !== 'README.md' && !TOPICS.includes(name));
  expect(extra).toEqual([]);
});

test.each(TOPICS)(`every bullet of %s has at most ${LIMIT} words`, (name) => {
  const long = readFileSync(path.join(DIR, name), 'utf8')
    .split('\n')
    .filter((line) => line.startsWith('- '))
    .map((line) => ({ words: line.split(/\s+/).length - 1, start: line.slice(0, 60) }))
    .filter((bullet) => bullet.words > LIMIT);
  expect(long).toEqual([]);
});
