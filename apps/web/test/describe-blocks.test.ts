/** The log line of `blockersDeclared` carries the attacker's number, the one the board shows on both ends. */
import type { GameState } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { describeEvent } from '../src/game/describe';

const zombie = (controller: number) => ({
  card: null,
  token: { characteristics: { name: 'Zombie' } },
  stack: null,
  controller,
  zone: 'battlefield',
});

const state = (gone: string[] = []) =>
  ({
    objects: {
      a1: zombie(0),
      a2: zombie(0),
      a3: zombie(0),
      b1: zombie(1),
      b2: zombie(1),
      ...Object.fromEntries(gone.map((id) => [id, { ...zombie(0), zone: 'graveyard' }])),
    },
    cards: {},
    definitions: {},
    lki: {},
    pending: null,
    combat: {
      attackers: ['a1', 'a2', 'a3'].map((object) => ({
        object,
        target: { kind: 'player', seat: 1 },
      })),
    },
  }) as unknown as GameState;

const line = (blocks: { blocker: string; attacker: string }[], after = state()) =>
  describeEvent({ kind: 'blockersDeclared', seat: 1, blocks } as never, after, after, 1);

test('each block names the attacker with its number, so identical Zombies can be told apart', () => {
  const text = line([
    { blocker: 'b1', attacker: 'a1' },
    { blocker: 'b2', attacker: 'a3' },
  ])?.text;
  expect(text).toBe('Zombie blocks Zombie (#1); Zombie blocks Zombie (#3).');
});

test('an attacker that left combat before blocks does not shift the others silently', () => {
  // a1 is gone: the view numbers the attackers still on the battlefield, so a2 is #1 now.
  const text = line([{ blocker: 'b1', attacker: 'a2' }], state(['a1']))?.text;
  expect(text).toBe('Zombie blocks Zombie (#1).');
});

test('no blockers declared says so', () => {
  expect(line([])?.text).toBe('You declare no blockers.');
});
