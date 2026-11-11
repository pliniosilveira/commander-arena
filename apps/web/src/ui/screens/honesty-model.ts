import type { HonestySummary } from '../../game/protocol';

/** "2× Serra Angel (You)", one line per unsupported card and seat (A28). */
export function honestyLines(summary: HonestySummary | null, viewer: number): readonly string[] {
  return (summary?.unsupported ?? []).map(
    (card) => `${card.count}× ${card.name} (${card.seat === viewer ? 'You' : 'Opponent'})`,
  );
}
