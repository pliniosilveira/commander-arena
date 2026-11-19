// `pnpm precon:from-comment`: puts the snapshot a "Deck support triage" comment carries, and the decklist of the issue, into the repository (D-608). The comment is
// untrusted until `decodeComment` has checked it: its hash, its id and that its decklist is the issue's. The skill that calls it also checks the comment's author.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { readPreconIssue } from './from-issue.ts';
import { type Io, REPO_ROOT } from './main.ts';
import { decodeComment } from './snapshot-comment.ts';

export const USAGE = `Usage: pnpm precon:from-comment --comment <comment file> --body <issue file> [--set <set name> --year <yyyy>] [--snapshots-dir <dir>] [--decks-dir <dir>]

Writes apps/web/src/precons/snapshots/<id>.json and decks/<id>.txt from the snapshot comment of a precon issue, after checking that the comment's hash,
id and decklist are right for that issue. Exit code: 0 written, 1 the comment cannot be trusted (nothing is written), 2 a usage error.
--set and --year record the product the deck came in (the set name and the year of its release, read from Scryfall) in the snapshot; a new deck needs both,
an update of a deck that has them keeps them. The deck list shows them under the blurb.`;

export async function run(argv: readonly string[], io: Io): Promise<number> {
  let values: ReturnType<typeof parseArgs>['values'];
  try {
    ({ values } = parseArgs({
      args: [...argv],
      options: {
        comment: { type: 'string' },
        body: { type: 'string' },
        set: { type: 'string' },
        year: { type: 'string' },
        'snapshots-dir': { type: 'string' },
        'decks-dir': { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    }));
  } catch (error) {
    io.err(`error: ${error instanceof Error ? error.message : error}\n\n${USAGE}`);
    return 2;
  }
  if (values.help === true) {
    io.out(USAGE);
    return 0;
  }
  if (typeof values.comment !== 'string' || typeof values.body !== 'string') {
    io.err(`error: --comment and --body are required\n\n${USAGE}`);
    return 2;
  }
  const request = readPreconIssue(await readFile(path.resolve(values.body), 'utf8'));
  if (typeof request === 'string') {
    io.err(`error: ${request}`);
    return 1;
  }
  const decoded = decodeComment(
    await readFile(path.resolve(values.comment), 'utf8'),
    request.decklist,
  );
  if (typeof decoded === 'string') {
    io.err(`error: ${decoded}`);
    return 1;
  }
  if (decoded.id !== request.id) {
    io.err('error: the id of the snapshot is not the one of the issue');
    return 1;
  }
  const snapshotsDir = path.resolve(
    typeof values['snapshots-dir'] === 'string'
      ? values['snapshots-dir']
      : path.join(REPO_ROOT, 'apps/web/src/precons/snapshots'),
  );
  const decksDir = path.resolve(
    typeof values['decks-dir'] === 'string' ? values['decks-dir'] : path.join(REPO_ROOT, 'decks'),
  );
  const file = path.join(snapshotsDir, `${decoded.id}.json`);
  const known = await readKnownProduct(file);
  const set = typeof values.set === 'string' ? values.set.trim() : known.set;
  const year =
    typeof values.year === 'string' && /^\d{4}$/.test(values.year)
      ? Number(values.year)
      : known.year;
  if (typeof values.year === 'string' && year === undefined) {
    io.err('error: --year must be a four-digit year');
    return 2;
  }
  if (set === undefined || set === '' || year === undefined) {
    io.err(`error: the snapshot needs its set and year: pass --set and --year\n\n${USAGE}`);
    return 1;
  }
  const snapshot: Record<string, unknown> = JSON.parse(decoded.text);
  const { set: _set, year: _year, ...rest } = snapshot;
  const withProduct: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    withProduct[key] = value;
    if (key === 'decklist') Object.assign(withProduct, { set, year });
  }
  await mkdir(snapshotsDir, { recursive: true });
  await mkdir(decksDir, { recursive: true });
  await writeFile(file, `${JSON.stringify(withProduct, null, 2)}\n`);
  await writeFile(path.join(decksDir, `${decoded.id}.txt`), request.decklist);
  io.out(JSON.stringify({ ok: true, id: decoded.id }));
  return 0;
}

/** The set and year a snapshot already on disk records (an update of a deck keeps them). */
async function readKnownProduct(file: string): Promise<{ set?: string; year?: number }> {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as { set?: unknown; year?: unknown };
    return {
      ...(typeof parsed.set === 'string' ? { set: parsed.set } : {}),
      ...(typeof parsed.year === 'number' ? { year: parsed.year } : {}),
    };
  } catch {
    return {};
  }
}
