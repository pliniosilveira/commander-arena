/**
 * The web side of the initiative (CR 726) and of venturing into Undercity (CR 701.49) as pure models, no DOM: the names of the inherent abilities on the stack, the words
 * the stack shows for them (the engine's own text, never the trigger they carry), the question that asks which room the venture marker moves to, the words of a room,
 * the log lines, and the tooltip of the dungeon chip. The game is a real engine state built with the scenario DSL and the engine's SYNTHETIC cards.
 */
import { getView } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { expect, test } from 'vitest';
import { optionText, purposeNoun } from '../src/game/chosen';
import { describeEvent } from '../src/game/describe';
import { hasOwnWords, inherentNameOf } from '../src/game/monarch-text';
import { dungeonTitle } from '../src/ui/board/PlayerStrip';
import { optionPrompt } from '../src/ui/decisions/option-picker';
import { stackWording } from '../src/ui/panels/stack-wording';

const CLAIM = 'SYNTHETIC Initiative Claim';
const DIVE = 'SYNTHETIC Undercity Dive';
const LIBRARY = Array.from({ length: 6 }, () => 'Plains');

const game = () =>
  scenario()
    .seat(0)
    .library(...LIBRARY)
    .hand(CLAIM)
    .battlefield('Island', 'Island', 'Island')
    .seat(1)
    .library(...LIBRARY)
    .build();

test('the abilities of the initiative and the room abilities are named for what they belong to', () => {
  expect(inherentNameOf('initiativeUpkeep')).toBe('The initiative');
  expect(inherentNameOf('initiativeDamage')).toBe('The initiative');
  expect(inherentNameOf('initiativeTaken')).toBe('The initiative');
  expect(inherentNameOf('room:forge')).toBe('Undercity');
  expect(inherentNameOf('monarchDraw')).toBe('The monarch');
  expect(hasOwnWords({ name: 'The initiative' })).toBe(true);
  expect(hasOwnWords({ name: 'Undercity' })).toBe(true);
  expect(hasOwnWords({ name: 'The monarch' })).toBe(false);
});

test('on the stack the initiative says what its ability does, for either viewer', () => {
  const g = game();
  g.act(0).cast(CLAIM, { pay: true });
  g.pass();
  g.pass();
  const wordsOf = (): ReturnType<typeof stackWording> => {
    const view = getView(g.state, 1);
    const item = view.stack[0];
    if (item === undefined) throw new Error('the ability is not on the stack');
    return stackWording(item, new Map(view.battlefield.map((o) => [o.id, o])), 1, false, 2);
  };
  expect(wordsOf().inherent).toBe(true);
  expect(wordsOf().monarchWords).toBe('Whenever you take the initiative, venture into Undercity.');
  expect(wordsOf().when).toBeNull();
  // The room ability that the venture then triggers says what its room does (CR 309.4c).
  g.pass();
  g.pass();
  expect(wordsOf().monarchWords).toContain('Secret Entrance: Search your library for a basic land');
});

test('the question that asks which room the venture marker moves to', () => {
  const d = {
    purpose: 'dungeonRoom',
    sourceName: 'Undercity',
    options: ['forge', 'lost-well'],
  } as never;
  expect(optionPrompt(d)).toBe('Choose the room to move your venture marker to (Undercity).');
  expect(purposeNoun('dungeonRoom')).toBe('room');
  expect(optionText('dungeonRoom', 'forge')).toBe('Forge');
  expect(optionText('dungeonRoom', 'lost-well')).toBe('Lost Well');
  expect(optionText('dungeonRoom', 'trap')).toBe('Trap!');
  expect(optionText('dungeonRoom', 'throne-of-the-dead-three')).toBe('Throne of the Dead Three');
});

test('the log: the initiative, the venture marker and a completed dungeon', () => {
  const g = game();
  const s = g.state;
  expect(describeEvent({ kind: 'initiativeTaken', seat: 0 } as never, s, s, 0)?.text).toBe(
    'You take the initiative.',
  );
  expect(describeEvent({ kind: 'initiativeTaken', seat: 1 } as never, s, s, 0)?.text).toBe(
    'Opponent takes the initiative.',
  );
  expect(
    describeEvent({ kind: 'initiativeChanged', from: 0, to: null } as never, s, s, 0)?.text,
  ).toBe('There is no initiative.');
  expect(
    describeEvent(
      {
        kind: 'ventured',
        seat: 0,
        dungeon: 'undercity',
        room: 'secret-entrance',
        from: null,
      } as never,
      s,
      s,
      0,
    )?.text,
  ).toBe('You enter Undercity: Secret Entrance.');
  expect(
    describeEvent(
      {
        kind: 'ventured',
        seat: 1,
        dungeon: 'undercity',
        room: 'forge',
        from: 'secret-entrance',
      } as never,
      s,
      s,
      0,
    )?.text,
  ).toBe('Opponent moves their venture marker into Forge.');
  expect(
    describeEvent({ kind: 'dungeonCompleted', seat: 0, dungeon: 'undercity' } as never, s, s, 0)
      ?.text,
  ).toBe('You complete Undercity.');
});

test('the chip of a seat in Undercity names the room, its text and where the marker can go', () => {
  const g = scenario()
    .seat(0)
    .library(...LIBRARY)
    .hand(DIVE)
    .inUndercity('secret-entrance')
    .seat(1)
    .library(...LIBRARY)
    .build();
  const dungeon = getView(g.state, 1).seats[0]?.dungeon;
  if (dungeon === undefined) throw new Error('the seat is not in a dungeon');
  const title = dungeonTitle(dungeon);
  expect(title).toContain('Undercity, room Secret Entrance');
  expect(title).toContain('Search your library for a basic land card');
  expect(title).toContain('forge or lost-well');
  const bottom = scenario()
    .seat(0)
    .library(...LIBRARY)
    .inUndercity('throne-of-the-dead-three')
    .seat(1)
    .library(...LIBRARY)
    .build();
  const last = getView(bottom.state, 1).seats[0]?.dungeon;
  if (last === undefined) throw new Error('the seat is not in a dungeon');
  expect(dungeonTitle(last)).toContain('bottommost room');
});
