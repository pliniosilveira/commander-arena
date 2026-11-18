// Issue 283: a deck's AI game suite (`packages/ai/test/*-games.test.ts`) is nightly by default. A new one must be classified on purpose: listed in
// `pr-excluded.json` (nightly), or named here as cheap enough to stay in the PR tier. Without this a suite slips into the PR tier just by being added.

import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const AI_TESTS = new URL('../../packages/ai/test/', import.meta.url);
const excluded = JSON.parse(
  readFileSync(new URL('./pr-excluded.json', import.meta.url), 'utf8'),
) as string[];

/** Game suites that stay in the PR tier, each with why. */
const KEPT_IN_PR: Readonly<Record<string, string>> = {
  'enchant-player-games.test.ts': 'one short game, about 4 seconds',
};

test('every AI game suite is either nightly (pr-excluded.json) or kept in the PR tier on purpose', () => {
  const unclassified = readdirSync(AI_TESTS)
    .filter((name) => name.endsWith('-games.test.ts'))
    .filter((name) => !excluded.includes(name) && !(name in KEPT_IN_PR));
  expect(unclassified).toEqual([]);
});

test('a suite is not both nightly and kept', () => {
  expect(Object.keys(KEPT_IN_PR).filter((name) => excluded.includes(name))).toEqual([]);
});
