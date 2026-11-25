// The command of tools/ai/report.ts (issue 627): reads an issue description from a file, decodes its replay block, replays the game
// to the reported decision and prints the position as Markdown (or JSON with --json). Exit 0 when it replays, 1 when it does not
// (the reason is printed), 2 on bad arguments.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import type { AiReport } from '@commander-arena/cards';
import { positionMarkdown, positionOf } from './report-position.ts';
import { replayReport, reportOfBody, versionWarnings } from './report-replay.ts';

export interface Io {
  readonly out: (text: string) => void;
  readonly err: (text: string) => void;
}

export const USAGE = 'usage: node tools/ai/report.ts --body <issue description file> [--json]';

/** What the tool says about one description: the printed text and the exit code. */
export async function reportText(
  body: string,
  json: boolean,
): Promise<{ text: string; code: number }> {
  let report: AiReport;
  try {
    report = reportOfBody(body);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return failure(reason, [], json);
  }
  const warnings = versionWarnings(report);
  const replay = await replayReport(report);
  if (!replay.ok) return failure(replay.reason, warnings, json);
  const position = positionOf(report, replay.position, replay.steps);
  if (json) {
    const meta = {
      format: report.format,
      engine: report.engine,
      parser: report.parser,
      app: report.app,
      seed: report.seed,
      seats: report.seats,
      ai: report.ai,
      aiSeat: report.aiSeat,
    };
    return { text: JSON.stringify({ replays: true, warnings, ...meta, position }), code: 0 };
  }
  return { text: positionMarkdown(report, position, warnings), code: 0 };
}

function failure(
  reason: string,
  warnings: readonly string[],
  json: boolean,
): { text: string; code: number } {
  if (json) return { text: JSON.stringify({ replays: false, reason, warnings }), code: 1 };
  const lines = ['**Replays: no**', '', `Reason: ${reason}`];
  for (const w of warnings) lines.push('', `> ${w}`);
  return { text: lines.join('\n'), code: 1 };
}

export async function main(argv: readonly string[], io: Io): Promise<number> {
  let values: { body?: string; json?: boolean };
  try {
    ({ values } = parseArgs({
      args: [...argv],
      options: { body: { type: 'string' }, json: { type: 'boolean', default: false } },
    }));
  } catch (error) {
    io.err(`${error instanceof Error ? error.message : String(error)}\n${USAGE}`);
    return 2;
  }
  if (values.body === undefined) {
    io.err(USAGE);
    return 2;
  }
  let body: string;
  try {
    body = await readFile(path.resolve(values.body), 'utf8');
  } catch (error) {
    io.err(`cannot read ${values.body}: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
  const { text, code } = await reportText(body, values.json === true);
  io.out(text);
  return code;
}
