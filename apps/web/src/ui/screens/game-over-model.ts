/** Pure text for the game-over screen. */
import type { GameResult, LossReason, SeatId } from '@commander-arena/engine';
import type { LogEntry } from '../../game/protocol';

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

const REASONS: Readonly<Record<LossReason, (you: boolean) => string>> = {
  life: (you) => (you ? 'You were reduced to 0 life.' : 'The opponent was reduced to 0 life.'),
  emptyLibrary: (you) =>
    you ? 'You drew from an empty library.' : 'The opponent drew from an empty library.',
  poison: (you) =>
    you ? 'You got 10 or more poison counters.' : 'The opponent got 10 or more poison counters.',
  commanderDamage: (you) =>
    you
      ? 'You took 21 or more damage from one commander.'
      : 'The opponent took 21 or more damage from one commander.',
  concede: (you) => (you ? 'You conceded.' : 'The opponent conceded.'),
  effect: (you) =>
    you ? 'An effect made you lose the game.' : 'An effect made the opponent lose.',
};

const LOSS_LINE = /the game \((\w+)\)/;

/**
 * Why the losing seat lost, read from the `playerLost` log line the page already has (its text ends
 * in "(reason)"). Null for a draw or when no such line is found.
 */
export function lossReason(
  log: readonly LogEntry[],
  result: GameResult,
  viewer: SeatId,
): string | null {
  if (result.kind !== 'win') return null;
  for (let i = log.length - 1; i >= 0; i--) {
    const entry = log[i];
    // The loser's line: some seat other than the winner.
    if (entry === undefined || entry.seat === null || entry.seat === result.winner) continue;
    const reason = LOSS_LINE.exec(entry.text)?.[1];
    if (reason !== undefined && reason in REASONS) {
      return REASONS[reason as LossReason](entry.seat === viewer);
    }
  }
  return null;
}
