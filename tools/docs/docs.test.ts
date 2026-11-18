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
  'AGENTS.md': 0,
  'docs/SPEC.md': 0,
  'docs/ARCHITECTURE.md': 0,
  'docs/ROADMAP.md': 0,
  'docs/RULES_COVERAGE.md': 0,
  'docs/CARD_SUPPORT_PLAYBOOK.md': 0,
  '.claude/skills/deck-support/SKILL.md': 0,
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
