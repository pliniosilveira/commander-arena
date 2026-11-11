/** The log lines of scry, surveil and moves from a hand into a library (D-091, D-093). */
import type { GameEvent, GameState, ObjectId } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { describeEvent, describeEvents } from '../src/game/describe';

const nothing = {} as unknown as GameState;
const line = (event: GameEvent, viewer = 0) => describeEvent(event, nothing, nothing, viewer);

describe('scry and surveil', () => {
  test('the viewer and the opponent read the same counts', () => {
    expect(line({ kind: 'scried', seat: 0, top: 1, bottom: 1 })?.text).toBe(
      'You scry 2: 1 on top, 1 on the bottom.',
    );
    expect(line({ kind: 'scried', seat: 1, top: 1, bottom: 1 })?.text).toBe(
      'Opponent scries 2: 1 on top, 1 on the bottom.',
    );
    expect(line({ kind: 'surveiled', seat: 1, top: 1, toGraveyard: 1 })?.text).toBe(
      'Opponent surveils 2: 1 on top, 1 into the graveyard.',
    );
    expect(line({ kind: 'surveiled', seat: 0, top: 0, toGraveyard: 3 })?.text).toBe(
      'You surveil 3: 3 into the graveyard.',
    );
  });

  test('an empty pile is left out and an empty library says so', () => {
    expect(line({ kind: 'scried', seat: 0, top: 2, bottom: 0 })?.text).toBe(
      'You scry 2: 2 on top.',
    );
    expect(line({ kind: 'scried', seat: 0, top: 0, bottom: 0 })?.text).toBe(
      'You scry an empty library.',
    );
    expect(line({ kind: 'surveiled', seat: 1, top: 0, toGraveyard: 0 })?.text).toBe(
      'Opponent surveils an empty library.',
    );
  });

  test('the lines are major and cite the rule', () => {
    const scried = line({ kind: 'scried', seat: 0, top: 1, bottom: 0 });
    expect([scried?.level, scried?.rule, scried?.seat]).toEqual(['major', 'CR 701.22', 0]);
    const surveiled = line({ kind: 'surveiled', seat: 0, top: 1, toGraveyard: 0 });
    expect([surveiled?.level, surveiled?.rule]).toEqual(['major', 'CR 701.25']);
  });
});

/** A state with just what the hand-to-library line reads: whose library each object is in. */
function stateWithLibrary(seat: number, library: readonly ObjectId[]): GameState {
  const objects = Object.fromEntries(library.map((id) => [id, { zoneOwner: seat }]));
  const seats = [0, 1].map((s) => ({ library: s === seat ? library : [] }));
  return { objects, seats } as unknown as GameState;
}

const toLibrary = (to: ObjectId): GameEvent => ({
  kind: 'zoneChanged',
  card: null,
  from: `o${Number(to.slice(1)) + 100}`,
  to,
  fromZone: 'hand',
  toZone: 'library',
});

describe('cards from a hand into a library', () => {
  test('a run of moves is one line with the count and the place, naming no card', () => {
    const after = stateWithLibrary(0, ['o1', 'o2', 'o3', 'o4']);
    const lines = describeEvents([toLibrary('o2'), toLibrary('o1')], nothing, after, 0);
    expect(lines.map((l) => l.text)).toEqual(['You put 2 cards on top of your library.']);
    expect(lines[0]?.objects).toEqual([]);
    expect(lines[0]?.rule).toBe('CR 401.4');
  });

  test('the opponent puts cards on top of their library; one card, or the bottom', () => {
    const after = stateWithLibrary(1, ['o1', 'o2', 'o3', 'o4']);
    expect(describeEvents([toLibrary('o1')], nothing, after, 0).map((l) => l.text)).toEqual([
      'Opponent puts 1 card on top of their library.',
    ]);
    expect(
      describeEvents([toLibrary('o3'), toLibrary('o4')], nothing, after, 0).map((l) => l.text),
    ).toEqual(['Opponent puts 2 cards on the bottom of their library.']);
  });

  test('other events keep their own lines around a run', () => {
    const after = stateWithLibrary(0, ['o1', 'o2']);
    const lines = describeEvents(
      [{ kind: 'handKept', seat: 0 }, toLibrary('o1'), { kind: 'handKept', seat: 1 }],
      nothing,
      after,
      0,
    );
    expect(lines.map((l) => l.text)).toEqual([
      'You keep a hand.',
      'You put 1 card on top of your library.',
      'Opponent keeps a hand.',
    ]);
  });

  test('a single event still has no hand-to-library line of its own', () => {
    // describeEvent alone would name the card; describeEvents is what the host calls.
    const after = stateWithLibrary(0, ['o1']);
    const texts = describeEvents([toLibrary('o1')], nothing, after, 0).map((l) => l.text);
    expect(texts.some((t) => t.includes('hand to library'))).toBe(false);
  });
});
