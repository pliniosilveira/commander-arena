/**
 * The web side of speed (issue 144, CR 702.179, 702.178) as pure models, no DOM: the log line of a speed change, the name and words of the inherent speed ability on the stack, the
 * words of the condition "max speed", and the tooltip of the speed chip.
 */
import type { GameState, Trigger } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { gameConditionWords } from '../src/game/condition-text';
import { describeEvent } from '../src/game/describe';
import { inherentNameOf, inherentTriggerWording } from '../src/game/monarch-text';
import { SPEED_TITLE } from '../src/ui/board/PlayerStrip';

const state = { objects: {}, lki: {}, seats: [] } as unknown as GameState;
const changed = (seat: number, from: number, to: number) =>
  ({ kind: 'speedChanged', seat, from, to }) as const;

test('the log: a player gets speed, then reaches higher speeds', () => {
  const first = describeEvent(changed(0, 0, 1), state, state, 0);
  expect(first?.text).toBe('You get speed 1.');
  expect(first?.rule).toBe('CR 702.179');
  expect(describeEvent(changed(0, 1, 2), state, state, 0)?.text).toBe('You reach speed 2.');
  expect(describeEvent(changed(1, 3, 4), state, state, 0)?.text).toBe('Opponent reaches speed 4.');
});

test('the inherent speed ability is "Speed" on the stack, worded for the viewer', () => {
  expect(inherentNameOf('speedUp')).toBe('Speed');
  const trigger: Trigger = { kind: 'lifeLost', who: 'opponent' };
  expect(inherentTriggerWording(trigger, true)).toBe(
    'Whenever one or more opponents lose life during your turn, if your speed is less than 4, your speed increases by 1.',
  );
  expect(inherentTriggerWording(trigger, false)).toContain('their speed increases by 1');
});

test('the condition "max speed" in words', () => {
  expect(gameConditionWords({ kind: 'maxSpeed', player: { kind: 'you' } })).toBe(
    'you have max speed',
  );
  expect(
    gameConditionWords({
      kind: 'not',
      term: { kind: 'maxSpeed', player: { kind: 'you' } },
    }),
  ).toBe("you don't have max speed");
  expect(gameConditionWords({ kind: 'maxSpeed', player: { kind: 'eachOpponent' } })).toBe(
    'an opponent has max speed',
  );
});

test('the tooltip of the speed chip names the rule and the limit of 4', () => {
  expect(SPEED_TITLE).toContain('CR 702.179');
  expect(SPEED_TITLE).toContain('max speed');
});
