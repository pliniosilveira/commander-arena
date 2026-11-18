// The documents stay small (AGENTS.md, "Documentation duties"): the removed logs do not come back, and each document has a word ceiling.
// A ceiling is lowered when its document is trimmed and never raised to make room: to add, cut something first.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const REMOVED = [
  'docs/MECHANICS.md',
  'docs/DECISIONS.md',
  'docs/decisions',
  'docs/STATUS.md',
  'docs/progress',
];

/** Words, counted as `wc -w` counts them. */
const CEILINGS: Readonly<Record<string, number>> = {
  'AGENTS.md': 3900,
  'docs/SPEC.md': 8100,
  'docs/ARCHITECTURE.md': 16800,
  'docs/ROADMAP.md': 27800,
  'docs/RULES_COVERAGE.md': 45000,
  'docs/CARD_SUPPORT_PLAYBOOK.md': 2200,
  '.claude/skills/deck-support/SKILL.md': 4600,
};

test.each(REMOVED)('%s was removed and does not come back', (name) => {
  expect(existsSync(path.join(ROOT, name))).toBe(false);
});

test.each(Object.entries(CEILINGS))('%s has at most %i words', (name, ceiling) => {
  const words = readFileSync(path.join(ROOT, name), 'utf8').split(/\s+/).filter(Boolean).length;
  expect(words, `${name} has ${words} words; cut something before adding`).toBeLessThanOrEqual(
    ceiling,
  );
});
