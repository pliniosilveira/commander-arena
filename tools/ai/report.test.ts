// tools/ai/report.ts (issue 627): an issue written by the web app's "That was a dumb move" button is decoded and its game replayed to
// the reported AI decision. The games are short games of the hidden test decks (fixtures, some cards SYNTHETIC); the precon test
// reads a real snapshot of the repository.

import { gzipSync } from 'node:zlib';
import { CasualAgent, runGame } from '@commander-arena/ai';
import {
  AI_REPORT_FORMAT,
  type AiReport,
  aiReportBlock,
  aiReportText,
  type GameRecord,
  PARSER_VERSION,
  replayCard,
} from '@commander-arena/cards';
import { ENGINE_VERSION } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { dumbMoveIssue } from '../../apps/web/src/game/ai-report.ts';
import { deckFor, preconById } from '../../apps/web/src/game/precons.ts';
import { readSnapshots } from './precons.ts';
import { reportText } from './report-main.ts';
import { rebuildDeck } from './report-replay.ts';

const version = { commit: 'test', date: '', engine: ENGINE_VERSION, parser: PARSER_VERSION };

/** A short game of two hidden test decks, and its last action of the AI seat. */
async function game(): Promise<{ record: GameRecord; reported: number }> {
  const run = await runGame(
    {
      seed: 21,
      decks: [deckFor(preconById('white-knights')), deckFor(preconById('swamp-forest'))],
      settings: { freeFirstMulligan: true },
    },
    [new CasualAgent({ seed: 1 }), new CasualAgent({ seed: 2 })],
    { maxTurns: 6, maxActions: 3000 },
  );
  const record: GameRecord = {
    seed: 21,
    freeMulligan: true,
    ai: 'casual',
    decks: [
      { name: 'white-knights', hidden: 'white-knights' },
      { name: 'swamp-forest', hidden: 'swamp-forest' },
    ],
    emblems: [],
    actions: run.log,
  };
  return { record, reported: run.log.findLastIndex((step) => step.seat === 1) };
}

const recorded = game();

function report(record: GameRecord, reported: number, over: Partial<AiReport> = {}): AiReport {
  return {
    format: AI_REPORT_FORMAT,
    engine: ENGINE_VERSION,
    parser: PARSER_VERSION,
    app: 'test',
    seats: record.decks.length,
    aiSeat: 1,
    reported,
    comment: '',
    ...record,
    actions: record.actions.slice(0, reported + 1),
    ...over,
  };
}

/** A description with the block written by hand (gzip and base64url, as the browser writes it). */
const bodyOf = (r: AiReport): string =>
  `Some words\n\n${aiReportBlock(gzipSync(aiReportText(r)).toString('base64url'), r.actions.length)}\n`;

describe('a report the web app wrote', () => {
  test('replays to the decision and prints the position from the AI seat', async () => {
    const { record, reported } = await recorded;
    const issue = await dumbMoveIssue({
      record,
      reported,
      summary: 'Opponent passes priority.',
      turn: "Opponent's turn 3",
      comment: 'Cast its creature first',
      version,
    });
    const markdown = await reportText(issue.body, false);
    expect(markdown.code).toBe(0);
    expect(markdown.text).toContain('**Replays: yes**');
    expect(markdown.text).toContain('### Seat 1 (the AI, reported)');
    expect(markdown.text).toContain('### Seat 0 (the player)');
    expect(markdown.text).toContain(`**Reported action** (#${reported}`);
    expect(markdown.text).toContain('**The player says it should have:** Cast its creature first');
    expect(markdown.text).toMatch(/- Hand: /);
    expect(markdown.text).toMatch(/- Mana: pool /);
    expect(markdown.text).not.toContain('> The report was made with');

    const json = await reportText(issue.body, true);
    expect(json.code).toBe(0);
    const parsed = JSON.parse(json.text);
    expect(parsed).toMatchObject({ replays: true, warnings: [], aiSeat: 1, seats: 2, seed: 21 });
    expect(parsed.position.reported.index).toBe(reported);
    expect(parsed.position.reported.action).toEqual(record.actions[reported]?.action);
    expect(parsed.position.lastActions.length).toBeLessThanOrEqual(10);
    expect(parsed.position.lastActions.at(-1)?.index).toBe(reported - 1);
    // The AI's own hand is listed, the player's is not (hidden from the AI).
    expect(Array.isArray(parsed.position.seats[1].hand)).toBe(true);
    expect(parsed.position.seats[0].hand).toBeNull();
    expect(parsed.position.seats[0].handCount).toBeGreaterThanOrEqual(0);
  });
});

describe('a report that does not replay', () => {
  test('without a block, or with a damaged one', async () => {
    const { record, reported } = await recorded;
    const none = await reportText('Just words', false);
    expect(none.code).toBe(1);
    expect(none.text).toContain('**Replays: no**');
    expect(none.text).toContain('no "Game replay for the AI coach" block');

    const body = bodyOf(report(record, reported));
    const lines = body.split('\n');
    const at = lines.findIndex((l) => l === '```text') + 2;
    lines[at] = (lines[at] ?? '').split('').reverse().join('');
    const damaged = await reportText(lines.join('\n'), true);
    expect(damaged.code).toBe(1);
    expect(JSON.parse(damaged.text)).toMatchObject({ replays: false });
    expect(JSON.parse(damaged.text).reason).toMatch(/decompress|JSON/);
  });

  test('of another format', async () => {
    const { record, reported } = await recorded;
    const text = JSON.stringify({ ...report(record, reported), format: 99 });
    const body = `${aiReportBlock(gzipSync(text).toString('base64url'), 1)}`;
    const out = await reportText(body, false);
    expect(out.code).toBe(1);
    expect(out.text).toContain('format 99; this tree reads format 1');
  });

  test('when an action is not legal where the log puts it', async () => {
    const { record, reported } = await recorded;
    const actions = record.actions.map((step, i) =>
      i === 3
        ? { seat: step.seat, action: { kind: 'declareBlockers' as const, blocks: [] } }
        : step,
    );
    const out = await reportText(bodyOf(report({ ...record, actions }, reported)), false);
    expect(out.code).toBe(1);
    expect(out.text).toMatch(/action 3 \(seat \d, declareBlockers\) was refused/);
  });

  test('when a deck is not in this tree', async () => {
    const { record, reported } = await recorded;
    const decks = [
      record.decks[0] ?? { name: '', hidden: '' },
      { name: 'x', hidden: 'no-such-deck' },
    ];
    const out = await reportText(bodyOf(report({ ...record, decks }, reported)), false);
    expect(out.code).toBe(1);
    expect(out.text).toContain('seat 1: there is no hidden test deck "no-such-deck" in this tree');
  });
});

describe('versions', () => {
  test('a newer engine or an older parser is a warning that says which, not a failure', async () => {
    const { record, reported } = await recorded;
    const r = report(record, reported, { engine: ENGINE_VERSION + 1, parser: PARSER_VERSION - 1 });
    const out = await reportText(bodyOf(r), false);
    expect(out.code).toBe(0);
    expect(out.text).toContain(
      `engine ${ENGINE_VERSION + 1}, newer than this tree's ${ENGINE_VERSION}`,
    );
    expect(out.text).toContain(
      `card parser ${PARSER_VERSION - 1}, older than this tree's ${PARSER_VERSION}`,
    );
  });
});

describe('decks', () => {
  const snapshot = readSnapshots().snapshots[0];

  test('a shipped precon is rebuilt from its snapshot, a saved deck from the card data it carries', async () => {
    if (snapshot === undefined) throw new Error('expected a precon snapshot in the repository');
    const shipped = await rebuildDeck(
      { name: snapshot.name, precon: snapshot.id, decklist: snapshot.decklist },
      0,
    );
    expect(shipped.cards).toHaveLength(100);
    const saved = await rebuildDeck(
      { name: 'Saved', decklist: snapshot.decklist, cards: snapshot.cards.map(replayCard) },
      1,
    );
    expect(saved.cards.map((c) => c.name)).toEqual(shipped.cards.map((c) => c.name));
    await expect(
      rebuildDeck({ name: 'x', precon: 'no-such-precon', decklist: '1 Forest' }, 1),
    ).rejects.toThrow('seat 1: there is no precon "no-such-precon" in this tree');
    await expect(rebuildDeck({ name: 'Saved', decklist: snapshot.decklist }, 1)).rejects.toThrow(
      /seat 1: "Saved" cannot be played/,
    );
  });
});
