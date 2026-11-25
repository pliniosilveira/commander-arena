/**
 * "That was a dumb move" (issue 627): the host keeps the game as a replay, the log ties each line to its action, and the report
 * becomes a prefilled GitHub issue with the labels, the player's line and the compressed replay. The hidden test decks are
 * fixtures; the long decklist of the size test is SYNTHETIC.
 */
import { gunzipSync } from 'node:zlib';
import { RandomLegalAgent, replayGame } from '@commander-arena/ai';
import { aiReportPayload, type GameRecord, parseAiReportText } from '@commander-arena/cards';
import { getView } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { AI_REPORT_LABELS, dumbMoveIssue, dumbMoveTitle } from '../src/game/ai-report';
import { GameHost } from '../src/game/host';
import { deckFor, preconById } from '../src/game/precons';
import type { LogEntry, Snapshot } from '../src/game/protocol';
import { MAX_ISSUE_URL_LENGTH } from '../src/import/deck-issue';
import { aiMoves, firstLinesOfAiMoves, moveLabel } from '../src/ui/panels/dumb-move-model';

const clock = () => 0;
const options = { seed: 11, humanDeck: 'white-knights', aiDeck: 'swamp-forest' };
const version = { commit: 'abc1234', date: '2026-11-20', engine: 5, parser: 6 };

/** A short game: the human answers at random for `answers` decisions. */
async function played(
  answers: number,
): Promise<{ host: GameHost; snap: Snapshot; log: LogEntry[] }> {
  const host = new GameHost({ clock });
  let snap = (await host.newGame(options)).snapshot;
  const log = [...snap.log];
  const human = new RandomLegalAgent({ seed: 3 });
  for (let i = 0; i < answers && snap.view.result === null; i++) {
    const decision = snap.view.pending;
    if (decision === null) break;
    snap = await host.act(await human.decide(snap.view, decision, { budgetMs: 1000, now: clock }));
    log.push(...snap.log);
  }
  return { host, snap, log };
}

async function recordOf(host: GameHost): Promise<GameRecord> {
  const record = await host.gameRecord();
  if (record === null) throw new Error('expected a record');
  return record;
}

describe('the game record of the host', () => {
  test('is null before a game, and replays to the very position the player sees', async () => {
    expect(await new GameHost({ clock }).gameRecord()).toBeNull();
    const { host, snap } = await played(40);
    const record = await recordOf(host);
    expect(record.seed).toBe(11);
    expect(record.decks).toEqual([
      { name: 'white-knights', hidden: 'white-knights' },
      { name: 'swamp-forest', hidden: 'swamp-forest' },
    ]);
    expect(record.actions).toHaveLength(snap.actionCount);
    const decks = [deckFor(preconById('white-knights')), deckFor(preconById('swamp-forest'))];
    const state = replayGame(
      { seed: 11, decks, settings: { freeFirstMulligan: true } },
      record.actions,
    );
    expect(getView(state, 0)).toEqual(snap.view);
  });

  test('a deck of known cards whose origin the options do not give cannot be replayed', async () => {
    const host = new GameHost({ clock });
    await host.newGame({ ...options, aiCards: deckFor(preconById('swamp-forest')) });
    expect(await host.gameRecord()).toBeNull();
  });

  test('the log ties each line written by an action to it and its seat', async () => {
    const { host, log } = await played(40);
    const record = await recordOf(host);
    const tied = log.filter((entry) => entry.action !== undefined);
    expect(tied.some((entry) => entry.action?.seat === 1)).toBe(true);
    expect(tied.some((entry) => entry.action?.seat === 0)).toBe(true);
    for (const entry of tied) {
      expect(record.actions[entry.action?.index ?? -1]?.seat).toBe(entry.action?.seat);
    }
  });
});

describe('the AI moves of the log', () => {
  const line = (
    id: number,
    index: number | null,
    seat: number,
    level: 'major' | 'detail',
    text: string,
  ) => ({
    id,
    turn: 2,
    activeSeat: 1,
    round: 1,
    seat,
    level,
    text,
    objects: [],
    rule: null,
    ...(index === null ? {} : { action: { index, seat } }),
  });

  test('one per AI action, the latest first, worded by its major lines', () => {
    const log = [
      line(1, 3, 0, 'major', 'You play Plains.'),
      line(2, 4, 1, 'major', 'Opponent casts Synthetic Bolt.'),
      line(3, 4, 1, 'detail', 'Synthetic Bolt targets you.'),
      line(4, null, 1, 'major', 'Opponent draws a card.'),
      line(5, 9, 1, 'detail', 'Opponent orders triggers.'),
    ];
    const moves = aiMoves(log, 0);
    expect(moves.map((m) => m.index)).toEqual([9, 4]);
    expect(moves[1]?.text).toBe('Opponent casts Synthetic Bolt.');
    expect(moves[0]?.text).toBe('Opponent orders triggers.');
    expect(moveLabel(moves[1] ?? moves[0] ?? { index: 0, seat: 1, text: '', turn: '' })).toBe(
      "Opponent's turn 1: Opponent casts Synthetic Bolt.",
    );
    expect([...firstLinesOfAiMoves(log)]).toEqual([2, 5]);
  });
});

describe('the issue', () => {
  test('is titled by the move, labelled, and carries the line and a replay that decodes', async () => {
    const { host } = await played(40);
    const record = await recordOf(host);
    const reported = record.actions.findLastIndex((a) => a.seat === 1);
    expect(reported).toBeGreaterThan(0);
    const issue = await dumbMoveIssue({
      record,
      reported,
      summary: 'Opponent attacks with Synthetic Bear.',
      turn: "Opponent's turn 3",
      comment: 'Keep the bear home\nto block',
      version,
    });
    expect(issue.title).toBe('Dumb move: Opponent attacks with Synthetic Bear.');
    expect(issue.fitsInLink).toBe(true);
    expect(issue.fitsInIssue).toBe(true);
    expect(issue.url.length).toBeLessThanOrEqual(MAX_ISSUE_URL_LENGTH);
    const url = new URL(issue.url);
    expect(url.searchParams.get('labels')).toBe(AI_REPORT_LABELS.join(','));
    expect(url.searchParams.get('title')).toBe(issue.title);
    expect(issue.body).toContain("**What the AI did** (Opponent's turn 3): Opponent attacks");
    expect(issue.body).toContain('**What should it have done?** Keep the bear home to block');
    expect(issue.body).toContain('Build abc1234 (2026-11-20) · Engine 5 · Card parser 6');
    const payload = aiReportPayload(url.searchParams.get('body') ?? '');
    if (payload === null) throw new Error('expected the replay block');
    const decoded = parseAiReportText(
      gunzipSync(Buffer.from(payload, 'base64url')).toString('utf8'),
    );
    expect(decoded.actions).toEqual(record.actions.slice(0, reported + 1));
    expect(decoded).toMatchObject({ aiSeat: 1, reported, engine: 5, parser: 6, app: 'abc1234' });
    expect(decoded.comment).toBe('Keep the bear home to block');
  });

  test('too long for a link: a short link with the same labels, the whole body for the clipboard', async () => {
    const { host } = await played(10);
    const record = await recordOf(host);
    const reported = record.actions.findLastIndex((a) => a.seat === 1);
    // SYNTHETIC: a decklist of made-up names that compresses badly, so the replay outgrows a link.
    let x = 1;
    const names = Array.from({ length: 2000 }, () => {
      x = (x * 1103515245 + 12345) % 2147483648;
      return `1 Synthetic ${x.toString(36)}`;
    });
    const big: GameRecord = {
      ...record,
      decks: [{ name: 'Big', decklist: names.join('\n') }, ...record.decks.slice(1)],
    };
    const issue = await dumbMoveIssue({
      record: big,
      reported,
      summary: 'x',
      turn: 't',
      comment: '',
      version,
    });
    expect(issue.fitsInLink).toBe(false);
    expect(issue.fitsInIssue).toBe(true);
    expect(issue.url.length).toBeLessThanOrEqual(MAX_ISSUE_URL_LENGTH);
    expect(new URL(issue.url).searchParams.get('labels')).toBe('ai-report,AI opponent');
    expect(new URL(issue.url).searchParams.get('body')).toContain('copied to your clipboard');
    expect(aiReportPayload(issue.body)).not.toBeNull();
    expect(issue.body).toContain('**What should it have done?** (no answer)');
  });

  test('a title is cut to a readable length', () => {
    expect(dumbMoveTitle('a'.repeat(200))).toHaveLength('Dumb move: '.length + 80);
    expect(dumbMoveTitle('  ')).toBe('Dumb move: an AI decision');
  });
});
