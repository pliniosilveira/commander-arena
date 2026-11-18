// The comment in which the "Deck support triage" workflow keeps the snapshot of a precon (D-608): the snapshot file, gzip-compressed and written in base64url,
// in a fenced block (the format of the card data block of an issue, D-245), with the id and the sha256 of the file in a marker. A comment holds at most 65,536
// characters; a snapshot of 100 cards takes about 20,000 once compressed. Only a comment of `github-actions[bot]` counts (the reader of the skill checks the
// author): anyone can write the marker, nobody else can write as the bot, and the reader checks the content too (the hash, the id, the decklist of the issue).

import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { parsePreconSnapshot } from '@commander-arena/cards';

export const SNAPSHOT_COMMENT_MARKER = '<!-- precon-snapshot -->';

/** GitHub takes a comment of at most 65,536 characters. */
export const COMMENT_LIMIT = 65536;

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

/** The comment for a snapshot file's text, or a message when it would not fit. */
export function encodeComment(id: string, name: string, snapshotText: string): string {
  const payload = gzipSync(Buffer.from(snapshotText, 'utf8'), { level: 9 }).toString('base64url');
  const lines: string[] = [];
  for (let i = 0; i < payload.length; i += 76) lines.push(payload.slice(i, i + 76));
  const comment = [
    `${SNAPSHOT_COMMENT_MARKER}<!-- precon-snapshot:id=${id}:sha256=${sha256(snapshotText)} -->`,
    `The snapshot of the precon "${name}" (id \`${id}\`) is made from the current card data of Scryfall. The deck-support routine takes it into its pull request, with the decklist, once every card of the deck is supported.`,
    '',
    '<details>',
    '<summary>Snapshot (gzip+base64url)</summary>',
    '',
    '```',
    ...lines,
    '```',
    '',
    '</details>',
    '',
  ].join('\n');
  if (comment.length > COMMENT_LIMIT) {
    throw new Error(
      `the snapshot takes ${comment.length} characters, a comment holds ${COMMENT_LIMIT}`,
    );
  }
  return comment;
}

export interface DecodedSnapshot {
  readonly id: string;
  /** The text of the snapshot file, byte for byte as the workflow made it. */
  readonly text: string;
  /** The decklist the snapshot holds. */
  readonly decklist: string;
}

/**
 * The snapshot a comment carries, or a message that says why it cannot be trusted: no marker, a payload that does not decompress, a hash that does not match,
 * a file that is not a snapshot, an id that is not the marker's, or a decklist that is not the one of the issue (`issueDecklist`, when given).
 */
export function decodeComment(comment: string, issueDecklist?: string): DecodedSnapshot | string {
  const text = comment.replace(/\r\n/g, '\n');
  const marker =
    /^<!-- precon-snapshot --><!-- precon-snapshot:id=([a-z0-9-]+):sha256=([0-9a-f]{64}) -->/.exec(
      text,
    );
  if (marker === null) return 'the comment is not a precon snapshot comment';
  const id = marker[1] ?? '';
  if (!ID.test(id)) return `"${id}" is not a usable id`;
  const block = /```\n([A-Za-z0-9_-]+(?:\n[A-Za-z0-9_-]+)*)\n```/.exec(text);
  if (block === null) return 'the comment has no snapshot block';
  let json: string;
  try {
    json = gunzipSync(Buffer.from((block[1] ?? '').replace(/\n/g, ''), 'base64url')).toString(
      'utf8',
    );
  } catch {
    return 'the snapshot block does not decompress';
  }
  if (sha256(json) !== marker[2]) return 'the snapshot does not match its hash';
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return 'the snapshot is not JSON';
  }
  const parsed = parsePreconSnapshot(value);
  if (!parsed.ok) return `the snapshot is not valid: ${parsed.error}`;
  if (parsed.snapshot.id !== id) return 'the id of the snapshot is not the one of the marker';
  const decklist = parsed.snapshot.decklist;
  if (issueDecklist !== undefined && decklist.trim() !== issueDecklist.trim()) {
    return 'the decklist of the snapshot is not the one of the issue';
  }
  return { id, text: json, decklist };
}
