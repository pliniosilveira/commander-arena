// tools/ai/try-move.ts (issue 627): the engine check of the AI coach lists the legal actions of a reported decision and plays the
// reported action and an alternative out from it. A short game of the hidden test decks (fixtures, some cards SYNTHETIC), as in
// report.test.ts; one sample and one turn keep it fast.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CasualAgent, runGame } from '@commander-arena/ai';
import { PARSER_VERSION } from '@commander-arena/cards';
import { ENGINE_VERSION } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { dumbMoveIssue } from '../../apps/web/src/game/ai-report.ts';
import { deckFor, preconById } from '../../apps/web/src/game/precons.ts';

const SCRIPT = fileURLToPath(new URL('./try-move.ts', import.meta.url));
const version = { commit: 'test', date: '', engine: ENGINE_VERSION, parser: PARSER_VERSION };

async function bodyFile(): Promise<string> {
  const run = await runGame(
    {
      seed: 21,
      decks: [deckFor(preconById('white-knights')), deckFor(preconById('swamp-forest'))],
      settings: { freeFirstMulligan: true },
    },
    [new CasualAgent({ seed: 1 }), new CasualAgent({ seed: 2 })],
    { maxTurns: 6, maxActions: 3000 },
  );
  const reported = run.log.findLastIndex((step) => step.seat === 1);
  const issue = await dumbMoveIssue({
    record: {
      seed: 21,
      freeMulligan: true,
      ai: 'casual',
      decks: [
        { name: 'white-knights', hidden: 'white-knights' },
        { name: 'swamp-forest', hidden: 'swamp-forest' },
      ],
      emblems: [],
      actions: run.log,
    },
    reported,
    summary: 'Opponent passes priority.',
    turn: "Opponent's turn 3",
    comment: '',
    version,
  });
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'try-move-')), 'issue.md');
  writeFileSync(file, issue.body);
  return file;
}

const run = (args: readonly string[]): string =>
  execFileSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', timeout: 120_000 });

test('lists the legal actions, and plays the reported one and an alternative out', async () => {
  const file = await bodyFile();
  const options = run(['--body', file, '--options'])
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as { index: number; summary: string; action: unknown });
  expect(options.length).toBeGreaterThan(0);
  expect(options[0]).toMatchObject({ index: 0 });
  const alternative = JSON.stringify(options.at(-1)?.action);
  const table = run(['--body', file, '--samples', '1', '--turns', '1', '--try', alternative]);
  expect(table).toContain('| Action | Wins | Losses | Mean score | Lowest | Highest |');
  expect(table).toMatch(/\| reported: /);
  // The reported row and the alternative's row.
  expect(
    table
      .trim()
      .split('\n')
      .filter(
        (line) =>
          line.startsWith('| ') && !line.startsWith('| Action') && !line.startsWith('| ---'),
      ),
  ).toHaveLength(2);
}, 180_000);
