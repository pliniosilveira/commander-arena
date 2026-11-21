/**
 * The GitHub issue a player files from the game screen's "Report issue" button: what they wrote, the build, the game log and the
 * stack. Like the deck-support issue (`deck-issue.ts`) it cannot be created by the app, which is a static site with no secret: it builds
 * the address of GitHub's "new issue" page with the title and the body already in it, and the player presses Submit there. No React.
 */
import type { LogEntry } from '../game/protocol';
import { type VersionInfo, versionLine } from '../version';
import { ISSUES_NEW_URL, MAX_ISSUE_BODY_LENGTH, MAX_ISSUE_URL_LENGTH } from './deck-issue';

/** The stack, top item first, as plain lines (the page's `stackLabel` and controller name, made by the caller). */
export interface StackLine {
  readonly label: string;
  readonly controller: string;
}

export interface BugReportInput {
  readonly description: string;
  readonly version: VersionInfo;
  readonly turn: number | null;
  readonly log: readonly LogEntry[];
  /** Top item first. */
  readonly stack: readonly StackLine[];
  /** True when a picture of the board is on the clipboard for the player to paste. */
  readonly screenshot?: boolean;
}

export interface BugReport {
  readonly title: string;
  readonly body: string;
  readonly url: string;
  /** False when `body` is too long for an address: the caller copies `body` to the clipboard before opening `url`. */
  readonly fitsInLink: boolean;
}

const TITLE_MAX = 80;

/** The title: the first line of the description, cut to a readable length. */
export function reportTitle(description: string): string {
  const first = description.trim().split('\n')[0] ?? '';
  const line = first.length > TITLE_MAX ? `${first.slice(0, TITLE_MAX - 1)}…` : first;
  return line === '' ? 'Issue report' : `Issue: ${line}`;
}

export function logText(log: readonly LogEntry[]): string {
  return log.map((e) => `T${e.turn} ${e.text}`).join('\n');
}

export function stackText(stack: readonly StackLine[]): string {
  if (stack.length === 0) return 'The stack is empty.';
  return stack.map((s, i) => `${i + 1}. ${s.label} (${s.controller})`).join('\n');
}

/** A fenced block that a line of backticks in `text` cannot close early. */
function fenced(text: string): string {
  const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = '`'.repeat(longest + 1);
  return `${fence}\n${text}\n${fence}`;
}

/** The newest lines that fit in `budget` characters; the cut is said in the first line. */
function lastLines(text: string, budget: number): string {
  if (text.length <= budget) return text;
  const lines = text.split('\n');
  const kept: string[] = [];
  let used = 0;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i] ?? '';
    if (used + line.length + 1 > budget - 60) break;
    kept.unshift(line);
    used += line.length + 1;
  }
  return [`(older lines cut: ${lines.length - kept.length} of ${lines.length})`, ...kept].join(
    '\n',
  );
}

export function bugReportBody(input: BugReportInput): string {
  const head = [
    input.description.trim() === '' ? '(no description)' : input.description.trim(),
    versionLine(input.version),
    input.turn === null ? '' : `Turn ${input.turn}`,
    input.screenshot === true ? 'Screenshot of the board: paste it here (Ctrl+V).' : '',
  ].filter((p) => p !== '');
  const stack = ['### Stack (top first)', fenced(stackText(input.stack))].join('\n');
  const fixed = [...head, stack].join('\n\n');
  // The log takes what is left; the fence and heading are about 40 characters.
  const budget = MAX_ISSUE_BODY_LENGTH - fixed.length - 60;
  const log = ['### Game log', fenced(lastLines(logText(input.log), Math.max(budget, 0)))].join(
    '\n',
  );
  return [...head, stack, log].join('\n\n');
}

const issueUrl = (title: string, body: string): string =>
  `${ISSUES_NEW_URL}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;

export function bugReport(input: BugReportInput): BugReport {
  const title = reportTitle(input.description);
  const body = bugReportBody(input);
  const full = issueUrl(title, body);
  if (full.length <= MAX_ISSUE_URL_LENGTH) return { title, body, url: full, fitsInLink: true };
  const short =
    'The full report (your description, the build, the stack and the game log) is too long for a link: press "Copy full report" in the report dialog of the game and paste it here, then submit.';
  return { title, body, url: issueUrl(title, short), fitsInLink: false };
}
