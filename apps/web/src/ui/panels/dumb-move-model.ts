/** Pure helpers of the "That was a dumb move" report (issue 627): which AI moves the player can report, and how each reads. */
import type { SeatId } from '@commander-arena/engine';
import { HUMAN, type LogEntry } from '../../game/protocol';
import { groupHeading } from './log-model';

/** One action of an AI seat that wrote at least one line in the game log. */
export interface AiMove {
  /** Its index in the game's action log. */
  readonly index: number;
  readonly seat: SeatId;
  /** The action as the log says it: its major lines, else all of its lines, in one line. */
  readonly text: string;
  /** The turn as the log heads it ("Opponent's turn 4"). */
  readonly turn: string;
}

/** The AI moves of the log, the latest first: each action once, worded by its lines. */
export function aiMoves(log: readonly LogEntry[], viewer: SeatId, seatCount = 2): AiMove[] {
  const byAction = new Map<number, LogEntry[]>();
  for (const entry of log) {
    if (entry.action === undefined || entry.action.seat === HUMAN) continue;
    const lines = byAction.get(entry.action.index);
    if (lines === undefined) byAction.set(entry.action.index, [entry]);
    else lines.push(entry);
  }
  const moves: AiMove[] = [];
  for (const [index, lines] of byAction) {
    const first = lines[0];
    if (first === undefined || first.action === undefined) continue;
    const major = lines.filter((l) => l.level === 'major');
    const text = (major.length > 0 ? major : lines).map((l) => l.text).join(' ');
    const turn = groupHeading(
      {
        turn: first.turn,
        ...(first.activeSeat === undefined ? {} : { activeSeat: first.activeSeat }),
        ...(first.round === undefined ? {} : { round: first.round }),
        entries: lines,
      },
      viewer,
      seatCount,
    );
    moves.push({ index, seat: first.action.seat, text, turn });
  }
  return moves.sort((a, b) => b.index - a.index);
}

/** The ids of the lines that carry the "Dumb?" mark: the first shown line of each AI move. */
export function firstLinesOfAiMoves(shown: readonly LogEntry[]): ReadonlySet<number> {
  const seen = new Set<number>();
  const ids = new Set<number>();
  for (const entry of shown) {
    if (entry.action === undefined || entry.action.seat === HUMAN) continue;
    if (seen.has(entry.action.index)) continue;
    seen.add(entry.action.index);
    ids.add(entry.id);
  }
  return ids;
}

/** The line of a move in the picker: its turn and what it did, cut to a readable length. */
export function moveLabel(move: AiMove): string {
  const text = move.text.length > 90 ? `${move.text.slice(0, 89)}…` : move.text;
  return `${move.turn}: ${text}`;
}
