// The pure parts of the Saga rules (CR 714): the final chapter number (CR 714.2d), which chapters a
// change in lore counters reaches (CR 714.2b), and how a batch of counter events is split into
// before and after counts when the state only holds the total. Cards are SYNTHETIC.
import { describe, expect, test } from 'vitest';
import { syntheticCard } from '../src/cards/fixtures/index';
import { chaptersReached, finalChapterOf, isSaga, loreChange } from '../src/rules/saga';
import type { GameEvent } from '../src/state/events';
import { scenario } from '../src/testing/index';
import { RITE } from './saga-helpers';

describe('finalChapterOf (CR 714.2d)', () => {
  test('the greatest chapter number of the chapter abilities; 0 with none', () => {
    expect(finalChapterOf(syntheticCard(RITE).faces[0]?.abilities ?? [])).toBe(3);
    expect(finalChapterOf(syntheticCard('SYNTHETIC Echo Verse').faces[0]?.abilities ?? [])).toBe(3);
    expect(finalChapterOf([])).toBe(0);
  });

  test('only a Saga subtype makes a Saga', () => {
    expect(isSaga(['Saga'])).toBe(true);
    expect(isSaga(['Aura'])).toBe(false);
  });
});

describe('chaptersReached (CR 714.2b)', () => {
  test("the chapters the counters went past, within the ability's range", () => {
    expect(chaptersReached({ before: 0, after: 1 }, 1, 1)).toEqual([1]);
    expect(chaptersReached({ before: 0, after: 2 }, 1, 2)).toEqual([1, 2]);
    expect(chaptersReached({ before: 1, after: 3 }, 1, 2)).toEqual([2]);
    expect(chaptersReached({ before: 0, after: 5 }, 3, 3)).toEqual([3]);
  });

  test('no chapter when the counters were already at least N, or did not reach it', () => {
    expect(chaptersReached({ before: 2, after: 3 }, 1, 2)).toEqual([]);
    expect(chaptersReached({ before: 3, after: 4 }, 1, 3)).toEqual([]);
    expect(chaptersReached({ before: 0, after: 1 }, 2, 3)).toEqual([]);
  });
});

describe('loreChange', () => {
  const g = scenario()
    .seat(0)
    .battlefield(RITE, { counters: { lore: 2 } })
    .seat(1)
    .build();
  const object = g.id(RITE);
  const added = (count: number): GameEvent => ({
    kind: 'counterAdded',
    object,
    counter: 'lore',
    count,
  });

  test('each counterAdded event of one batch gets its own before and after', () => {
    const events = [added(1), added(1)];
    expect(loreChange(g.state, events, 0)).toEqual({ before: 0, after: 1 });
    expect(loreChange(g.state, events, 1)).toEqual({ before: 1, after: 2 });
  });

  test('other counters and other events are not lore changes', () => {
    const other: GameEvent = { kind: 'counterAdded', object, counter: '+1/+1', count: 1 };
    expect(loreChange(g.state, [other], 0)).toBeNull();
    expect(loreChange(g.state, [{ kind: 'untapped', object }], 0)).toBeNull();
  });

  test('a removal in the batch is taken into account', () => {
    const removed: GameEvent = { kind: 'counterRemoved', object, counter: 'lore', count: 1 };
    // The state says 2 now, after "add 2, remove 1": it had 1 before the batch and 3 after the add.
    expect(loreChange(g.state, [added(2), removed], 0)).toEqual({ before: 1, after: 3 });
  });
});
