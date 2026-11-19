// `pnpm precon:from-issue`: the snapshot of the precon a "Precon issues" issue asks for, made from the issue's own text (the decklist above its first `---`
// rule, the id and the name its "Add it to the ready-made decks" or "Update the precon" section gives, the marker at its end) and Scryfall's bulk file. The
// "Deck support triage" workflow runs it on a runner, which can reach Scryfall; the deck-support routine then takes the files into its pull request.
//
// The issue text is data, never a command: the values go into an argument list, never into a shell, and the id is checked before it names a file.

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { readDeck } from '../corpus/decks.ts';
import { downloadOracleCards } from '../corpus/download.ts';
import { displayName } from './archidekt.ts';
import { type Io, REPO_ROOT, run as runSnapshot } from './main.ts';
import { encodeComment } from './snapshot-comment.ts';

export const USAGE = `Usage: pnpm precon:from-issue --body <issue file> (--file <oracle_cards file> | --download) [--snapshots-dir <dir>] [--decks-dir <dir>]

Reads a precon issue (the text the "Precon issues" workflow writes), writes decks/<id>.txt and apps/web/src/precons/snapshots/<id>.json
(the folders can be changed) and prints one line of JSON: { ok, id, name, blurb, update, snapshot, decklist, problems }.
A precon the app already has keeps its blurb; a new one gets "A Commander precon led by <commander>.".
--comment-out also writes the comment that carries the snapshot (compressed, in a block; pnpm precon:from-comment reads it back).
--download fetches the bulk file into .cache/corpus/ first (a runner can reach Scryfall; the cloud session of the agent cannot).
Exit code: 0 written, 1 the issue or the cards could not give a snapshot (nothing is written), 2 a usage error.`;

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface PreconRequest {
  readonly id: string;
  readonly name: string;
  readonly update: boolean;
  /** The decklist of the issue: the Commander and Mainboard sections above the first rule. */
  readonly decklist: string;
}

/** What the issue asks for, or a message that says why it is not a precon issue the tool can use. */
export function readPreconIssue(body: string): PreconRequest | string {
  const text = body.replace(/\r\n/g, '\n');
  const marker = /<!-- precon-issues:deck=\d+:(add|update:[0-9a-z]+) -->/.exec(text);
  if (marker === null) return 'the issue has no precon-issues marker';
  const update = marker[1]?.startsWith('update') === true;
  const cut = text.search(/^---$/m);
  if (cut < 0) return 'the issue has no decklist above its first rule';
  const decklist = `${text.slice(0, cut).trim()}\n`;
  let id: string | undefined;
  let name: string | undefined;
  if (update) {
    const heading = /^## Update the precon "([^"\n]+)"\n\n[^\n]*\(id `([a-z0-9-]+)`\)/m.exec(text);
    name = heading?.[1];
    id = heading?.[2];
  } else {
    const line = /^- id `([a-z0-9-]+)`, name "([^"\n]+)"/m.exec(text);
    id = line?.[1];
    name = line?.[2];
  }
  if (id === undefined || name === undefined) return 'the issue does not give the id and the name';
  if (!ID.test(id)) return `"${id}" is not a usable id`;
  return { id, name: displayName(name), update, decklist };
}

/** "A Commander precon led by Giada, Font of Hope.": what the decklist itself says, never a guess. */
export function blurbFor(decklist: string, id: string): string | null {
  const commanders = readDeck(id, decklist)
    .lines.filter((line) => line.section === 'commander')
    .map((line) => line.name);
  const unique = [...new Set(commanders)];
  return unique.length === 0 ? null : `A Commander precon led by ${unique.join(' and ')}.`;
}

async function existingBlurb(dir: string, id: string): Promise<string | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path.join(dir, `${id}.json`), 'utf8'));
    const blurb = (parsed as { blurb?: unknown }).blurb;
    return typeof blurb === 'string' && blurb !== '' ? blurb : null;
  } catch {
    return null;
  }
}

export async function run(argv: readonly string[], io: Io): Promise<number> {
  let values: ReturnType<typeof parseArgs>['values'];
  try {
    ({ values } = parseArgs({
      args: [...argv],
      options: {
        body: { type: 'string' },
        file: { type: 'string' },
        download: { type: 'boolean' },
        'snapshots-dir': { type: 'string' },
        'decks-dir': { type: 'string' },
        'comment-out': { type: 'string' },
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
  const download = values.download === true;
  if (typeof values.body !== 'string' || (typeof values.file === 'string') === download) {
    io.err(`error: give --body and one of --file or --download\n\n${USAGE}`);
    return 2;
  }
  const snapshotsDir = path.resolve(
    typeof values['snapshots-dir'] === 'string'
      ? values['snapshots-dir']
      : path.join(REPO_ROOT, 'apps/web/src/precons/snapshots'),
  );
  const decksDir = path.resolve(
    typeof values['decks-dir'] === 'string' ? values['decks-dir'] : path.join(REPO_ROOT, 'decks'),
  );
  const fail = (problems: string[]): number => {
    io.out(JSON.stringify({ ok: false, problems }));
    return 1;
  };

  let bulk: string;
  if (typeof values.file === 'string') {
    bulk = values.file;
  } else {
    try {
      bulk = await downloadOracleCards({
        cacheDir: path.join(REPO_ROOT, '.cache/corpus'),
        log: (message) => io.err(message),
      });
    } catch (error) {
      return fail([
        `Scryfall's bulk file could not be fetched: ${error instanceof Error ? error.message : error}`,
      ]);
    }
  }

  const request = readPreconIssue(await readFile(path.resolve(values.body), 'utf8'));
  if (typeof request === 'string') return fail([request]);
  const blurb =
    (request.update ? await existingBlurb(snapshotsDir, request.id) : null) ??
    blurbFor(request.decklist, request.id);
  if (blurb === null) return fail(['the decklist has no Commander section, so there is no blurb']);

  // The snapshot tool reads the decklist from a file: a temporary one, so that nothing of the repository is touched unless a snapshot comes out.
  const work = await mkdtemp(path.join(tmpdir(), 'precon-issue-'));
  const lines: string[] = [];
  const errors: string[] = [];
  let code: number;
  try {
    const tempDeck = path.join(work, `${request.id}.txt`);
    await writeFile(tempDeck, request.decklist);
    code = await runSnapshot(
      [
        '--file',
        bulk,
        '--deck',
        tempDeck,
        '--id',
        request.id,
        '--name',
        request.name,
        '--blurb',
        blurb,
        '--out',
        snapshotsDir,
      ],
      { out: (t) => lines.push(t), err: (t) => errors.push(t) },
      { repoRoot: REPO_ROOT },
    );
  } finally {
    await rm(work, { recursive: true, force: true });
  }
  if (code !== 0) return fail(errors.length > 0 ? errors : ['the snapshot could not be made']);
  const snapshotFile = path.join(snapshotsDir, `${request.id}.json`);
  if (typeof values['comment-out'] === 'string') {
    try {
      const comment = encodeComment(request.id, request.name, await readFile(snapshotFile, 'utf8'));
      await writeFile(path.resolve(values['comment-out']), comment);
    } catch (error) {
      return fail([error instanceof Error ? error.message : String(error)]);
    }
  }
  const deckFile = path.join(decksDir, `${request.id}.txt`);
  await mkdir(decksDir, { recursive: true });
  await writeFile(deckFile, request.decklist);
  io.out(
    JSON.stringify({
      ok: true,
      id: request.id,
      name: request.name,
      blurb,
      update: request.update,
      snapshot: snapshotFile,
      decklist: deckFile,
      problems: lines.filter((line) => line.startsWith('warning: ')),
    }),
  );
  return 0;
}
