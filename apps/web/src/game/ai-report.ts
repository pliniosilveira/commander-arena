/**
 * The "That was a dumb move" report (issue 627): the GitHub issue a player files about one decision of the AI opponent, with a replay
 * of the game up to that decision so that the position can be studied later (`node tools/ai/report.ts`). Like the deck-support issue
 * (`import/deck-issue.ts`) the app cannot create it, being a static site with no secret: it builds the address of GitHub's "new issue"
 * page with the title, the labels and the body already in it, and the player presses Submit there. Nothing is sent by the app. No React.
 */
import {
  AI_REPORT_FORMAT,
  type AiReport,
  aiReportBlock,
  aiReportText,
  type GameRecord,
  reportComment,
} from '@commander-arena/cards';
import {
  gzipBase64url,
  ISSUES_NEW_URL,
  MAX_ISSUE_BODY_LENGTH,
  MAX_ISSUE_URL_LENGTH,
} from '../import/deck-issue';
import { type VersionInfo, versionLine } from '../version';

/** The labels the issue gets (GitHub's "new issue" page applies the existing labels named in `labels`). */
export const AI_REPORT_LABELS = ['ai-report', 'AI opponent'] as const;

const TITLE_MAX = 80;

export interface DumbMoveInput {
  readonly record: GameRecord;
  /** The index in `record.actions` of the reported action (an action of an AI seat). */
  readonly reported: number;
  /** What the game log says the action did, in one line. */
  readonly summary: string;
  /** The turn as the log heads it ("Opponent's turn 4"). */
  readonly turn: string;
  /** The player's line, "What should it have done?" (may be empty). */
  readonly comment: string;
  readonly version: VersionInfo;
}

export interface DumbMoveIssue {
  readonly title: string;
  readonly body: string;
  readonly url: string;
  /** False when `body` is too long for an address: the caller copies `body` to the clipboard before opening `url`. */
  readonly fitsInLink: boolean;
  /** False when the replay is too big even for an issue's description (GitHub's limit): the issue then has no replay. */
  readonly fitsInIssue: boolean;
}

/** The title: "Dumb move: " and the action as the log says it, cut to a readable length. */
export function dumbMoveTitle(summary: string): string {
  const line = summary.replace(/\s+/g, ' ').trim();
  const cut = line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1)}…` : line;
  return `Dumb move: ${cut === '' ? 'an AI decision' : cut}`;
}

/** The replay record of the report: the game up to and including the reported action. */
export function dumbMoveRecord(input: DumbMoveInput): AiReport {
  const { record, reported } = input;
  const step = record.actions[reported];
  if (step === undefined) throw new Error(`there is no action ${reported} in this game`);
  return {
    format: AI_REPORT_FORMAT,
    engine: input.version.engine,
    parser: input.version.parser,
    app: input.version.commit,
    seats: record.decks.length,
    aiSeat: step.seat,
    reported,
    comment: reportComment(input.comment),
    seed: record.seed,
    freeMulligan: record.freeMulligan,
    ai: record.ai,
    decks: record.decks,
    emblems: record.emblems,
    actions: record.actions.slice(0, reported + 1),
  };
}

const issueUrl = (title: string, body: string): string =>
  `${ISSUES_NEW_URL}?title=${encodeURIComponent(title)}&labels=${encodeURIComponent(AI_REPORT_LABELS.join(','))}&body=${encodeURIComponent(body)}`;

/** The issue of one reported decision: the human part, then the build and the compressed replay. */
export async function dumbMoveIssue(input: DumbMoveInput): Promise<DumbMoveIssue> {
  const report = dumbMoveRecord(input);
  const comment = report.comment === '' ? '(no answer)' : report.comment;
  const head = [
    `**What the AI did** (${input.turn}): ${input.summary.trim()}`,
    `**What should it have done?** ${comment}`,
    'Reported from the game with "That was a dumb move". The replay below rebuilds the exact position of that decision: `node tools/ai/report.ts --body <file with this description>`.',
    versionLine(input.version),
  ];
  const title = dumbMoveTitle(input.summary);
  const block = aiReportBlock(await gzipBase64url(aiReportText(report)), report.actions.length);
  let body = [...head, block].join('\n\n');
  const fitsInIssue = body.length <= MAX_ISSUE_BODY_LENGTH;
  if (!fitsInIssue) {
    body = [
      ...head,
      'The replay of this game is too big for an issue, so it is not included: the position cannot be rebuilt from this report.',
    ].join('\n\n');
  }
  const full = issueUrl(title, body);
  if (full.length <= MAX_ISSUE_URL_LENGTH) {
    return { title, body, url: full, fitsInLink: true, fitsInIssue };
  }
  const short =
    'The full report (what the AI did, your answer and the replay of the game) was copied to your clipboard when you pressed the button: paste it here, replacing this line, then submit.';
  return { title, body, url: issueUrl(title, short), fitsInLink: false, fitsInIssue };
}
