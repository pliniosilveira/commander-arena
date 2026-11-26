// The log names the cards a mill put into the graveyard (CR 701.17a: they are public there).
import type { GameState } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { describeEvent } from '../src/game/describe';

const state = (names: Record<string, string>) =>
  ({
    objects: {},
    lki: Object.fromEntries(
      Object.entries(names).map(([id, name]) => [id, { characteristics: { name } }]),
    ),
    stack: [],
    pending: null,
  }) as unknown as GameState;

test('the log names the milled card, or each of several', () => {
  const s = state({ o1: 'Grizzly Bears', o2: 'Forest' });
  const milled = (seat: number, objects: string[]) => ({ kind: 'milled', seat, objects }) as never;
  expect(describeEvent(milled(0, ['o1']), s, s, 0)?.text).toBe('You mill a card: Grizzly Bears.');
  expect(describeEvent(milled(1, ['o1', 'o2']), s, s, 0)?.text).toBe(
    'Opponent mills 2 cards: Grizzly Bears, Forest.',
  );
});
