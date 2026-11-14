/** #23: when every legal target of a question is in one graveyard, that graveyard is opened. */
import type { ChosenTarget, GameView, ObjectView, TargetsDecision } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { targetZoneToOpen } from '../src/ui/board/target-zone';

const card = (id: string, zone: string, owner = 0): ObjectView =>
  ({ id, name: id, zone, owner, controller: owner }) as unknown as ObjectView;

const obj = (id: string): ChosenTarget => ({ kind: 'object', id, specId: 't1' }) as ChosenTarget;
const player = (seat: number): ChosenTarget =>
  ({ kind: 'player', seat, specId: 't1' }) as ChosenTarget;

function viewWith(legal: readonly ChosenTarget[], extra: readonly ObjectView[] = []): GameView {
  const pending = {
    id: 'd1',
    seat: 0,
    kind: 'targets',
    source: 's',
    specs: [{ specId: 't1', min: 1, max: 1, legal }],
  } as unknown as TargetsDecision;
  return {
    viewer: 0,
    battlefield: [card('bear', 'battlefield')],
    exile: [],
    seats: [
      {
        id: 0,
        hand: [],
        graveyard: [card('g1', 'graveyard'), card('g2', 'graveyard')],
        command: [],
      },
      { id: 1, hand: null, graveyard: [card('g3', 'graveyard', 1)], command: [] },
    ],
    stack: [...extra],
    pending,
  } as unknown as GameView;
}

describe('the zone to open for a targets question', () => {
  test('all legal targets in one graveyard: that graveyard', () => {
    expect(targetZoneToOpen(viewWith([obj('g1'), obj('g2')]))).toEqual({
      kind: 'graveyard',
      seat: 0,
    });
    expect(targetZoneToOpen(viewWith([obj('g3')]))).toEqual({ kind: 'graveyard', seat: 1 });
  });

  test('targets in two graveyards, on the battlefield or players: nothing is opened', () => {
    expect(targetZoneToOpen(viewWith([obj('g1'), obj('g3')]))).toBeNull();
    expect(targetZoneToOpen(viewWith([obj('g1'), obj('bear')]))).toBeNull();
    expect(targetZoneToOpen(viewWith([obj('g1'), player(1)]))).toBeNull();
    expect(targetZoneToOpen(viewWith([]))).toBeNull();
  });

  test('another question opens nothing', () => {
    const v = viewWith([obj('g1')]);
    expect(
      targetZoneToOpen({
        ...v,
        pending: { id: 'd2', seat: 0, kind: 'priority', options: [] },
      } as unknown as GameView),
    ).toBeNull();
    expect(targetZoneToOpen({ ...v, viewer: 1 })).toBeNull();
  });
});
