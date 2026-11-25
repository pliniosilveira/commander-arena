/**
 * The division rows of the targets panel with several opponents (issue 537, phase 4): a player chosen as a target is named
 * "Opponent 1" to "Opponent 3" with three or four seats, and "Opponent" with two. SYNTHETIC: the views are drawn over a
 * small shape, not taken from a real game.
 */
import type {
  ChosenTarget,
  GameView,
  PendingDecision,
  TargetsDecision,
} from '@commander-arena/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { TargetsPanel } from '../src/ui/decisions/TargetsPanel';
import { initialUi } from '../src/ui/decisions/ui-state';

const none = () => {};

const seatsOf = (count: number) =>
  Array.from({ length: count }, (_, id) => ({
    id,
    hand: id === 0 ? [] : null,
    graveyard: [],
    command: [],
    mulligans: 0,
  }));

const viewOf = (count: number, pending: PendingDecision | null): GameView =>
  ({
    viewer: 0,
    turn: 3,
    activeSeat: 0,
    step: 'main1',
    battlefield: [],
    stack: [],
    exile: [],
    combat: null,
    seats: seatsOf(count),
    pending,
  }) as unknown as GameView;

const player = (seat: number, share?: number): ChosenTarget => ({
  kind: 'player',
  seat,
  specId: 't1',
  ...(share === undefined ? {} : { share }),
});

const panel = (seatCount: number, seats: readonly number[]) => {
  const decision = {
    id: 'd1',
    seat: 0,
    kind: 'targets',
    source: 'o9',
    specs: [
      {
        specId: 't1',
        min: 1,
        max: seats.length,
        divide: 3,
        legal: seats.map((s) => player(s)),
      },
    ],
  } as unknown as TargetsDecision;
  const ui = { ...initialUi(decision), targets: seats.map((s) => player(s, 1)) };
  return renderToStaticMarkup(
    <TargetsPanel decision={decision} view={viewOf(seatCount, decision)} ui={ui} update={none} />,
  );
};

describe('players named in the division rows', () => {
  test('two seats keep the 1v1 word', () => {
    const out = panel(2, [1]);
    expect(out).toContain('Less damage to Opponent');
    expect(out).not.toContain('Opponent 1');
  });

  test('three seats number the opponents', () => {
    const out = panel(3, [1, 2]);
    expect(out).toContain('Less damage to Opponent 1');
    expect(out).toContain('Less damage to Opponent 2');
  });

  test('four seats number the opponents in seat order', () => {
    const out = panel(4, [1, 3]);
    expect(out).toContain('Less damage to Opponent 1');
    expect(out).toContain('Less damage to Opponent 3');
    expect(out).not.toContain('Opponent 2');
  });
});
