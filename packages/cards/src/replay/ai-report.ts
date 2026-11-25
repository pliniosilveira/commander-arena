/**
 * The replay an AI report carries (issue 627): a game as the web app played it, small enough to travel in a GitHub issue, so that a
 * tool rebuilds the exact position of the AI decision a player called a dumb move. The game is its seed, its settings, each seat's
 * deck as it was built (the decklist and where its card data is), and every action the engine accepted, in order, up to and including
 * the reported one: the engine is deterministic, so `createGame` and `applyAction` over these rebuild the same state.
 *
 * The web app writes the record (`apps/web/src/game/ai-report.ts`), compresses it and puts it in the issue; `tools/ai/report.ts`
 * finds it, decompresses it and replays it. Compression lives with each side (the browser's `CompressionStream`, Node's zlib), as for
 * the card data block (`corpus/issue-block.ts`); this module is the format both read. It lives in the cards package because a deck
 * carries the card data of an imported list as snapshot cards, whose schema is here; the AI package may not import this package.
 */
import type { Ability, Action } from '@commander-arena/engine';
import { z } from 'zod';
import { fencedPayload, fencedPayloadBlock } from '../corpus/issue-block';
import { type SnapshotCard, snapshotCardSchema } from '../precon/snapshot';

/** The version of the format; a reader refuses any other. */
export const AI_REPORT_FORMAT = 1;

/** The words that open the replay block; the reader finds the block by them. */
export const AI_REPORT_SUMMARY = 'Game replay for the AI coach';

/** How the payload is written: the gzip of `aiReportText`, in base64url. */
export const AI_REPORT_ENCODING = 'gzip+base64url';

/** The longest player comment the record keeps ("What should it have done?"), in characters. */
export const AI_REPORT_COMMENT_MAX = 280;

/**
 * One seat's deck as the game was built from it. A shipped precon (`precon`: its snapshot id, in `apps/web/src/precons/snapshots/`
 * or `challenges/`) resolves its names from the repository's snapshot; `cards` holds the card data the repository does not have (all
 * of a saved deck's cards, the cards a player added to a precon), with no images. A hidden test deck (`hidden`) is rebuilt from its id
 * alone and has no decklist.
 */
export interface ReplayDeck {
  /** The deck's name as the game showed it. */
  readonly name: string;
  /** The decklist exactly as the import pipeline read it; absent for a hidden test deck. */
  readonly decklist?: string;
  readonly precon?: string;
  readonly hidden?: string;
  readonly cards?: readonly SnapshotCard[];
}

export interface ReplayStep {
  readonly seat: number;
  readonly action: Action;
}

/** An emblem a seat owned from the start (the Medium and Hard challenges): `GameConfig.startingEmblems`. */
export interface ReplayEmblem {
  readonly seat: number;
  readonly text: string;
  readonly abilities: readonly Ability[];
}

/** What the game host knows of the game it plays: everything the replay needs but the report itself. */
export interface GameRecord {
  readonly seed: number;
  readonly freeMulligan: boolean;
  /** The agent that played the AI seats (`AiKind` of the web app). */
  readonly ai: 'casual' | 'normal';
  /** One per seat, seat 0 (the human) first. */
  readonly decks: readonly ReplayDeck[];
  readonly emblems: readonly ReplayEmblem[];
  /** Every action the engine accepted, in order. */
  readonly actions: readonly ReplayStep[];
}

export interface AiReport extends GameRecord {
  readonly format: typeof AI_REPORT_FORMAT;
  /** `ENGINE_VERSION` and `PARSER_VERSION` of the build that played the game. */
  readonly engine: number;
  readonly parser: number;
  /** The build's short commit (`dev` outside a real build). */
  readonly app: string;
  readonly seats: number;
  /** The AI seat whose decision is reported. */
  readonly aiSeat: number;
  /** The index in `actions` of the reported action; `actions` ends with it. */
  readonly reported: number;
  /** The player's line, one line of at most `AI_REPORT_COMMENT_MAX` characters; empty when none. */
  readonly comment: string;
}

/** The player's line as the record keeps it: one line, spaces collapsed, cut to the limit. */
export function reportComment(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > AI_REPORT_COMMENT_MAX ? line.slice(0, AI_REPORT_COMMENT_MAX) : line;
}

/** The card data a replay carries: the engine reads no image, so the images and artists are dropped to keep the issue short. */
export function replayCard(card: SnapshotCard): SnapshotCard {
  return {
    ...card,
    faces: card.faces.map((face) => ({ ...face, imageUris: null, artist: null })),
  };
}

const seat = z.number().int().min(0).max(3);

// An action is checked for its shape only: the engine itself refuses an action that is not legal when the tool replays it.
const step = z.strictObject({
  seat,
  action: z.looseObject({ kind: z.string().min(1) }),
});

const deck = z
  .strictObject({
    name: z.string(),
    decklist: z.string().min(1).optional(),
    precon: z.string().min(1).optional(),
    hidden: z.string().min(1).optional(),
    cards: z.array(snapshotCardSchema).optional(),
  })
  .refine((d) => (d.hidden === undefined) !== (d.decklist === undefined), {
    message: 'a deck has a decklist or is a hidden test deck, not both',
  });

const emblem = z.strictObject({
  seat,
  text: z.string(),
  abilities: z.array(z.looseObject({ kind: z.string() })),
});

const report = z.strictObject({
  format: z.literal(AI_REPORT_FORMAT),
  engine: z.number().int().min(0),
  parser: z.number().int().min(0),
  app: z.string(),
  seed: z.number().int(),
  seats: z.number().int().min(2).max(4),
  freeMulligan: z.boolean(),
  ai: z.enum(['casual', 'normal']),
  aiSeat: seat,
  decks: z.array(deck),
  emblems: z.array(emblem),
  actions: z.array(step).min(1),
  reported: z.number().int().min(0),
  comment: z.string().max(AI_REPORT_COMMENT_MAX),
});

/** The text that is compressed: the record as JSON. */
export function aiReportText(record: AiReport): string {
  return JSON.stringify(record);
}

/** The record of a decompressed text. Throws, saying what is wrong, when it is not a record of this format. */
export function parseAiReportText(text: string): AiReport {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('the replay is not JSON');
  }
  const format = (raw as { format?: unknown } | null)?.format;
  if (format !== AI_REPORT_FORMAT) {
    throw new Error(
      `the replay is format ${String(format)}; this tree reads format ${AI_REPORT_FORMAT}`,
    );
  }
  const parsed = report.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where =
      issue === undefined ? '' : ` at ${issue.path.join('.') || 'top level'}: ${issue.message}`;
    throw new Error(`the replay is not a well-formed record${where}`);
  }
  const record = parsed.data as unknown as AiReport;
  if (record.decks.length !== record.seats) {
    throw new Error(
      `the replay names ${record.seats} seats but carries ${record.decks.length} decks`,
    );
  }
  if (record.aiSeat === 0 || record.aiSeat >= record.seats) {
    throw new Error(`seat ${record.aiSeat} is not an AI seat of this game`);
  }
  if (record.reported !== record.actions.length - 1) {
    throw new Error('the reported action is not the last action of the replay');
  }
  if (record.actions[record.reported]?.seat !== record.aiSeat) {
    throw new Error('the reported action is not an action of the AI seat');
  }
  return record;
}

/** The block around an encoded payload, as the issue's description shows it (collapsed). */
export function aiReportBlock(payload: string, actions: number): string {
  return fencedPayloadBlock(
    `${AI_REPORT_SUMMARY} (format ${AI_REPORT_FORMAT}, ${actions} actions, ${AI_REPORT_ENCODING})`,
    payload,
  );
}

/** The payload of the replay block in an issue's description, or null when it has none. Throws when the block is damaged. */
export function aiReportPayload(description: string): string | null {
  return fencedPayload(description, AI_REPORT_SUMMARY, 'replay');
}
