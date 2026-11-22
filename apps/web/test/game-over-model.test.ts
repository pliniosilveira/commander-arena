import type { GameResult } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import type { LogEntry } from '../src/game/protocol';
import { eliminationNote, lossReason } from '../src/ui/screens/game-over-model';

/** SYNTHETIC log lines: only the fields the end screen reads. */
const lost = (id: number, seat: number, reason: string): LogEntry =>
  ({
    id,
    turn: 5,
    seat,
    level: 'major',
    text: `${seat === 0 ? 'You lose' : 'Opponent loses'} the game (${reason}).`,
    objects: [],
    rule: 'CR 104.3',
  }) as LogEntry;

const win = (winner: number): GameResult => ({ kind: 'win', winner });

describe('the end screen in a two-player game stays as it was', () => {
  test('you win: the opponent is named plainly', () => {
    expect(lossReason([lost(1, 1, 'life')], win(0), 0)).toBe('The opponent was reduced to 0 life.');
    expect(lossReason([lost(1, 1, 'concede')], win(0), 0)).toBe('The opponent conceded.');
    expect(lossReason([lost(1, 1, 'effect')], win(0), 0)).toBe('An effect made the opponent lose.');
  });

  test('you lose: your own reason', () => {
    expect(lossReason([lost(1, 0, 'emptyLibrary')], win(1), 0)).toBe(
      'You drew from an empty library.',
    );
  });
});

describe('the end screen with several opponents', () => {
  test('you win: the opponent who lost last is named by number', () => {
    const log = [lost(1, 2, 'concede'), lost(2, 3, 'life'), lost(3, 1, 'poison')];
    expect(lossReason(log, win(0), 0, 4)).toBe('Opponent 1 got 10 or more poison counters.');
    expect(lossReason([lost(1, 2, 'effect')], win(0), 0, 3)).toBe(
      'An effect made Opponent 2 lose.',
    );
  });

  test('you lose: it is your loss line, not the one of an opponent who left before you', () => {
    const log = [lost(1, 2, 'life'), lost(2, 0, 'commanderDamage')];
    expect(lossReason(log, win(1), 0, 3)).toBe('You took 21 or more damage from one commander.');
    // The same log where the opponent's line is the latest one: still yours.
    const later = [lost(1, 0, 'life'), lost(2, 3, 'concede')];
    expect(lossReason(later, win(1), 0, 4)).toBe('You were reduced to 0 life.');
  });

  test('a draw has no reason', () => {
    expect(lossReason([lost(1, 1, 'life')], { kind: 'draw' }, 0, 3)).toBeNull();
  });
});

describe('eliminationNote', () => {
  test('only a loss with several seats says the game ends for you', () => {
    expect(eliminationNote('lose', 2)).toBeNull();
    expect(eliminationNote('win', 4)).toBeNull();
    expect(eliminationNote('draw', 3)).toBeNull();
    expect(eliminationNote('lose', 3)).toBe(
      'You are eliminated, so the game ends for you; the other players do not play on.',
    );
  });
});
