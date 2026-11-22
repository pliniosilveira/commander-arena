/**
 * The GitHub issue a player files from the game screen's "Report issue" button: what they wrote, the build, the game log and the
 * stack. Like the deck-support issue (`deck-issue.ts`) it cannot be created by the app, which is a static site with no secret: it builds
 * the address of GitHub's "new issue" page with the title and the body already in it, and the player presses Submit there. No React.
 */
import { type VersionInfo, versionLine } from '../version';
import { ISSUES_NEW_URL, MAX_ISSUE_URL_LENGTH } from './deck-issue';

export interface BugReportInput {
  readonly description: string;
  readonly version: VersionInfo;
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

export function bugReportBody(input: BugReportInput): string {
  return [
    input.description.trim() === '' ? '(no description)' : input.description.trim(),
    versionLine(input.version),
    input.screenshot === true ? 'Screenshot of the board: paste it below (Ctrl+V).' : '',
  ]
    .filter((p) => p !== '')
    .join('\n\n');
}

/** The label the issue gets (GitHub's "new issue" page applies an existing label named in `labels`). */
export const REPORT_LABEL = 'possible-issue';

const issueUrl = (title: string, body: string): string =>
  `${ISSUES_NEW_URL}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}&labels=${encodeURIComponent(REPORT_LABEL)}`;

export function bugReport(input: BugReportInput): BugReport {
  const title = reportTitle(input.description);
  const body = bugReportBody(input);
  const full = issueUrl(title, body);
  if (full.length <= MAX_ISSUE_URL_LENGTH) return { title, body, url: full, fitsInLink: true };
  const short =
    'The full report (your description and the build) is too long for a link: press "Copy full report" in the report dialog of the game and paste it here, then submit.';
  return { title, body, url: issueUrl(title, short), fitsInLink: false };
}
