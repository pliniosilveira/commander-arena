// Canonical locations for the CR text and its metadata, and a "was this file run directly" test.

import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = path.resolve(here, '..', '..');
export const RULES_DIR = path.join(REPO_ROOT, 'docs', 'rules');

/**
 * The CR plain text file. Canonical name; the fetch tool writes it and `pnpm rule` reads it. The file is Wizards' text and is not
 * committed (D-246); `COMMANDER_ARENA_CR_FILE` points to a copy kept anywhere else (a private checkout, a session's scratch folder).
 */
export const CR_FILE =
  process.env.COMMANDER_ARENA_CR_FILE ?? path.join(RULES_DIR, 'comprehensive-rules.txt');
/** Metadata about the downloaded file: URL, sha256, size, fetch time, effective date. */
export const SOURCE_FILE = path.join(RULES_DIR, 'rules-source.json');

/** Repo-relative forms, for messages. */
export const CR_FILE_REPO_PATH = 'docs/rules/comprehensive-rules.txt';
export const SOURCE_FILE_REPO_PATH = 'docs/rules/rules-source.json';
export const RULES_VERSION_REPO_PATH = 'docs/rules/RULES_VERSION.md';

/** The page that links to the current Comprehensive Rules downloads. */
export const RULES_PAGE_URL = 'https://magic.wizards.com/en/rules';

/** True when the module at `metaUrl` is the script node was started with. */
export function isMainModule(metaUrl: string): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(metaUrl));
  } catch {
    return false;
  }
}
