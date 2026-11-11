/** The log line of `abilityRemoved` (CR 603.3d), worded from fake states like the other describe tests. */
import type { GameState } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { describeEvent } from '../src/game/describe';

const state = () =>
  ({
    objects: { o1: { card: 'c1', token: null, stack: null, controller: 0 } },
    cards: { c1: { definition: 'd1' } },
    definitions: { d1: { name: 'Pyre Hound' } },
    // o9 left the battlefield: only its last-known information remains (CR 113.7a).
    lki: { o9: { characteristics: { name: 'Last Gasp Imp' } } },
    pending: null,
  }) as unknown as GameState;

const line = (source: string, seat: number, chapter?: number) =>
  describeEvent(
    {
      kind: 'abilityRemoved',
      seat,
      source,
      abilityIndex: 0,
      reason: 'noLegalTargets',
      ...(chapter === undefined ? {} : { chapter }),
    } as never,
    state(),
    state(),
    0,
  );

test('an ability removed for lack of a legal target says so, with the rule', () => {
  const removed = line('o1', 0);
  expect(removed?.text).toBe("Pyre Hound's ability has no legal target and is removed.");
  expect(removed?.level).toBe('major');
  expect(removed?.rule).toBe('CR 603.3d');
  expect(removed?.seat).toBe(0);
  expect(removed?.objects).toEqual(['o1']);
});

test('a Saga chapter ability names the chapter', () => {
  expect(line('o1', 1, 2)?.text).toBe(
    "Pyre Hound's chapter II ability has no legal target and is removed.",
  );
});

test('a source that has left the battlefield keeps its last-known name', () => {
  expect(line('o9', 0)?.text).toBe("Last Gasp Imp's ability has no legal target and is removed.");
});
