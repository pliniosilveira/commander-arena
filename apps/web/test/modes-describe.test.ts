/** The log lines of `modesChosen` and of an ability removed for lack of a legal mode (CR 700.2, 603.3c). */
import type { GameState } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { describeEvent } from '../src/game/describe';

const modes = [
  { text: 'Destroy target artifact.' },
  { text: 'Draw a card.' },
  { text: 'You gain 3 life.' },
];

const state = (stack: unknown) =>
  ({
    objects: {
      // A spell on the stack: its modes are in its face's spell text.
      o1: {
        card: 'c1',
        token: null,
        face: 0,
        stack: { kind: 'spell', ability: null },
        controller: 0,
      },
      // A triggered ability: its modes are in the ability it carries; it is named after its source.
      o2: {
        card: null,
        token: null,
        face: 0,
        stack: { kind: 'ability', source: 'o3', ability: stack },
        controller: 1,
      },
      o3: { card: 'c2', token: null, face: 0, stack: null, controller: 1 },
    },
    cards: { c1: { definition: 'd1' }, c2: { definition: 'd2' } },
    definitions: {
      d1: { name: 'Hunt Charm', faces: [{ name: 'Hunt Charm', spell: { modes } }] },
      d2: { name: 'Modal Greeter' },
    },
    lki: {},
    pending: null,
  }) as unknown as GameState;

const chosen = (source: string, picks: number[], automatic: boolean, seat = 0) =>
  describeEvent(
    { kind: 'modesChosen', seat, source, modes: picks, automatic } as never,
    state({ modes }),
    state({ modes }),
    0,
  );

test('the modes chosen for a spell read "You choose: A and B."', () => {
  const line = chosen('o1', [0, 1], false);
  expect(line?.text).toBe('You choose: Destroy target artifact and Draw a card.');
  expect(line?.level).toBe('major');
  expect(line?.rule).toBe('CR 700.2');
  expect(line?.objects).toEqual(['o1']);
});

test('three modes are joined with commas; one mode is just itself', () => {
  expect(chosen('o1', [0, 1, 2], false)?.text).toBe(
    'You choose: Destroy target artifact, Draw a card and You gain 3 life.',
  );
  expect(chosen('o1', [1], false)?.text).toBe('You choose: Draw a card.');
});

test('a choice made because only one set was legal is a detail line that says so', () => {
  const line = chosen('o1', [1, 2], true);
  expect(line?.text).toBe('You choose: Draw a card and You gain 3 life (the only legal choice).');
  expect(line?.level).toBe('detail');
});

test('the opponent chooses, and an ability reads its modes from the ability on the stack', () => {
  expect(chosen('o2', [1], false, 1)?.text).toBe('Opponent chooses: Draw a card.');
});

test('a source whose modes cannot be read says "mode N", never a guess', () => {
  expect(chosen('o9', [0, 2], false)?.text).toBe('You choose: mode 1 and mode 3.');
});

test('an ability with no legal mode is removed, with the rule', () => {
  const line = describeEvent(
    {
      kind: 'abilityRemoved',
      seat: 1,
      source: 'o3',
      abilityIndex: 0,
      reason: 'noLegalModes',
    } as never,
    state({ modes }),
    state({ modes }),
    0,
  );
  expect(line?.text).toBe("Modal Greeter's ability has no legal mode and is removed.");
  expect(line?.rule).toBe('CR 603.3c');
  expect(line?.level).toBe('major');
});
