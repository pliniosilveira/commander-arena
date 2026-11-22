/** Pure text for the game-over screen. */
import type { GameResult, LossReason, SeatId } from '@commander-arena/engine';
import type { LogEntry } from '../../game/protocol';
import { seatNameOf } from '../../game/seat-name';

export type Outcome = 'win' | 'lose' | 'draw';

export function outcomeFor(result: GameResult, viewer: SeatId): Outcome {
  if (result.kind === 'draw') return 'draw';
  return result.winner === viewer ? 'win' : 'lose';
}

export const OUTCOME_TITLE: Readonly<Record<Outcome, string>> = {
  win: 'You win',
  lose: 'You lose',
  draw: 'Draw',
};

/** Who lost, as the sentences of the end screen need it: you, or an opponent by name. */
type Loser =
  | { readonly you: true }
  | { readonly you: false; readonly subject: string; readonly object: string };

const REASONS: Readonly<Record<LossReason, (who: Loser) => string>> = {
  life: (w) => (w.you ? 'You were reduced to 0 life.' : `${w.subject} was reduced to 0 life.`),
  emptyLibrary: (w) =>
    w.you ? 'You drew from an empty library.' : `${w.subject} drew from an empty library.`,
  poison: (w) =>
    w.you ? 'You got 10 or more poison counters.' : `${w.subject} got 10 or more poison counters.`,
  commanderDamage: (w) =>
    w.you
      ? 'You took 21 or more damage from one commander.'
      : `${w.subject} took 21 or more damage from one commander.`,
  concede: (w) => (w.you ? 'You conceded.' : `${w.subject} conceded.`),
  effect: (w) => (w.you ? 'An effect made you lose the game.' : `An effect made ${w.object} lose.`),
};

/** "The opponent" in a two-player game, "Opponent 2" with more seats. */
function loserNamed(seat: SeatId, viewer: SeatId, seatCount: number): Loser {
  if (seat === viewer) return { you: true };
  if (seatCount <= 2) return { you: false, subject: 'The opponent', object: 'the opponent' };
  const name = seatNameOf(seat, viewer, seatCount);
  return { you: false, subject: name, object: name };
}

const LOSS_LINE = /the game \((\w+)\)/;

/**
 * Why the game ended, read from the `playerLost` log line the page already has (its text ends in
 * "(reason)"). When you lost it is your own line, even if opponents left the game before you; when
 * you won it is the line of the opponent who lost last, named by number once there are more than two
 * seats. Null for a draw or when no such line is found.
 */
export function lossReason(
  log: readonly LogEntry[],
  result: GameResult,
  viewer: SeatId,
  seatCount = 2,
): string | null {
  if (result.kind !== 'win') return null;
  const youLost = result.winner !== viewer;
  for (let i = log.length - 1; i >= 0; i--) {
    const entry = log[i];
    if (entry === undefined || entry.seat === null) continue;
    // The viewer's own loss line when they lost; otherwise the last opponent's.
    if (youLost ? entry.seat !== viewer : entry.seat === viewer) continue;
    const reason = LOSS_LINE.exec(entry.text)?.[1];
    if (reason !== undefined && reason in REASONS) {
      return REASONS[reason as LossReason](loserNamed(entry.seat, viewer, seatCount));
    }
  }
  return null;
}

/** With more than two seats, a loss ends the game for the human at once; the screen says so. */
export function eliminationNote(outcome: Outcome, seatCount: number): string | null {
  if (outcome !== 'lose' || seatCount <= 2) return null;
  return 'You are eliminated, so the game ends for you; the other players do not play on.';
}
