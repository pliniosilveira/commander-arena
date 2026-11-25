/** #23: when every legal target of a question is in one graveyard, that graveyard is opened. */
import type { ChosenTarget, GameView, ObjectView, TargetsDecision } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import {
  questionTitle,
  questionZoneToOpen,
  sameZone,
  targetZoneToOpen,
} from '../src/ui/board/target-zone';

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

  test('the targets question of a graveyard opens its Zone Picker by itself (Macabre Waltz)', () => {
    expect(questionZoneToOpen(viewWith([obj('g1'), obj('g2')]))).toEqual({
      zone: { kind: 'graveyard', seat: 0 },
      name: 'graveyard',
    });
    expect(questionZoneToOpen(viewWith([obj('g1'), obj('bear')]))).toBeNull();
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

describe('the zone to open for a library search', () => {
  const search = (over: Record<string, unknown> = {}, seat = 0): GameView =>
    ({
      viewer: 0,
      seats: [],
      exile: [],
      battlefield: [],
      stack: [],
      pending: {
        id: 'd1',
        seat,
        kind: 'chooseCards',
        source: 's',
        purpose: 'search',
        zone: 'library',
        legal: ['c1', 'c2'],
        min: 0,
        max: 1,
        reveal: false,
        prompt: '',
        ...over,
      },
    }) as unknown as GameView;

  test('your own search with cards to find opens the list of those cards', () => {
    expect(questionZoneToOpen(search())).toEqual({ zone: { kind: 'cards' }, name: 'library' });
  });

  test('nothing to find, another player, another zone or another purpose: nothing is opened', () => {
    expect(questionZoneToOpen(search({ legal: [] }))).toBeNull();
    expect(questionZoneToOpen(search({}, 1))).toBeNull();
    expect(questionZoneToOpen(search({ zone: 'hand' }))).toBeNull();
    expect(questionZoneToOpen(search({ purpose: 'putOnTop' }))).toBeNull();
    expect(questionZoneToOpen(search({ purpose: 'discard' }))).toBeNull();
  });

  test('the top cards looked at open the same list, named "cards"', () => {
    expect(questionZoneToOpen(search({ purpose: 'lookTake' }))).toEqual({
      zone: { kind: 'cards' },
      name: 'cards',
    });
    expect(questionZoneToOpen(search({ purpose: 'lookTake', legal: [] }))).toBeNull();
  });

  test('the cards of a split into piles open the same list (Expressive Iteration)', () => {
    expect(questionZoneToOpen(search({ purpose: 'lookSplit', to: 'hand' }))).toEqual({
      zone: { kind: 'cards' },
      name: 'cards',
    });
    expect(questionZoneToOpen(search({ purpose: 'lookSplit', to: 'bottom' }))).toEqual({
      zone: { kind: 'cards' },
      name: 'cards',
    });
    expect(questionZoneToOpen(search({ purpose: 'lookSplit', legal: [] }))).toBeNull();
  });

  test('a choice in a graveyard or in exile opens the list of its cards (Grapple with the Past, Something Worth Saving)', () => {
    const grave = search({ purpose: 'move', zone: 'graveyard' });
    expect(questionZoneToOpen(grave)).toEqual({ zone: { kind: 'cards' }, name: 'graveyard' });
    expect(questionZoneToOpen(search({ purpose: 'exile', zone: 'graveyard' }))).toEqual({
      zone: { kind: 'cards' },
      name: 'graveyard',
    });
    expect(questionZoneToOpen(search({ purpose: 'move', zone: 'exile' }))).toEqual({
      zone: { kind: 'cards' },
      name: 'exile',
    });
    expect(
      questionZoneToOpen(search({ purpose: 'move', zone: 'graveyard', legal: [] })),
    ).toBeNull();
    // A discard from the hand, a pile split and a free cast keep their dock panel.
    expect(questionZoneToOpen(search({ purpose: 'discard', zone: 'hand' }))).toBeNull();
    expect(questionZoneToOpen(search({ purpose: 'separate', zone: 'library' }))).toBeNull();
    expect(questionZoneToOpen(search({ purpose: 'cast', zone: 'exile' }))).toBeNull();
  });

  test('the picker is titled for what it lists', () => {
    const q = (over: Record<string, unknown>) =>
      questionTitle(search(over).pending as Parameters<typeof questionTitle>[0]);
    expect(q({})).toBe('Search your library');
    expect(q({ purpose: 'move', zone: 'graveyard' })).toBe('Choose from a graveyard');
    expect(q({ purpose: 'move', zone: 'exile' })).toBe('Choose from exile');
  });

  test('sameZone tells zones of one kind and seat apart', () => {
    expect(sameZone({ kind: 'cards' }, { kind: 'cards' })).toBe(true);
    expect(sameZone({ kind: 'graveyard', seat: 0 }, { kind: 'graveyard', seat: 1 })).toBe(false);
    expect(sameZone({ kind: 'graveyard', seat: 0 }, { kind: 'command', seat: 0 })).toBe(false);
  });
});
