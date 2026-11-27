/**
 * The web side of secret votes and votes for players and permanents (CR 701.38a, 701.38b): the prompt and the buttons of the vote dialog (no vote is shown while the votes are secret),
 * the log line of the reveal, the words of the new trigger and effects.
 */
import type { ChooseOptionDecision, GameEvent, GameState } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { describeEvent } from '../src/game/describe';
import { namedOptionPrompt, namedOptionRows } from '../src/ui/decisions/option-names';

const PLAYERS = (seat: number) =>
  ({
    id: 'd1',
    kind: 'chooseOption',
    seat,
    purpose: 'vote',
    options: ['seat:0', 'seat:1', 'seat:2'],
    source: 'o7',
    sourceName: 'Círdan the Shipwright',
    sourceOracleText: '',
    vote: {
      controller: 0,
      cast: [],
      secret: true,
      choices: [
        { kind: 'player', seat: 0 },
        { kind: 'player', seat: 1 },
        { kind: 'player', seat: 2 },
      ],
    },
  }) as unknown as ChooseOptionDecision;

const CREATURES = {
  ...PLAYERS(1),
  options: ['object:o3', 'object:o9'],
  vote: {
    controller: 0,
    cast: [],
    secret: true,
    choices: [
      { kind: 'object', object: 'o3', name: 'Grizzly Bears', controller: 1 },
      { kind: 'object', object: 'o9', name: 'Grizzly Bears', controller: 2 },
    ],
  },
} as unknown as ChooseOptionDecision;

test('a secret vote for a player says so and shows no vote', () => {
  expect(namedOptionPrompt(PLAYERS(1))).toBe(
    'Vote for a player. The votes are secret until everyone has voted.',
  );
});

test('one button for each player, "You" for the voter and the others by number', () => {
  expect(namedOptionRows(PLAYERS(1))).toEqual([
    { option: 'seat:0', label: 'Player 1', detail: null },
    { option: 'seat:1', label: 'You', detail: null },
    { option: 'seat:2', label: 'Player 3', detail: null },
  ]);
});

test('one button for each creature, with who controls it, so two of one name are told apart', () => {
  expect(namedOptionPrompt(CREATURES)).toBe(
    'Vote for a creature. The votes are secret until everyone has voted.',
  );
  expect(namedOptionRows(CREATURES)).toEqual([
    { option: 'object:o3', label: 'Grizzly Bears', detail: 'Controlled by you' },
    { option: 'object:o9', label: 'Grizzly Bears', detail: 'Controlled by Player 3' },
  ]);
});

test('the reveal is one log line with every vote; a vote cast in the open adds none', () => {
  const state = {
    objects: { o7: { id: 'o7', card: null, zone: 'stack', token: null } },
    seats: [{}, {}, {}],
    cards: {},
  } as unknown as GameState;
  const event = (secret: boolean): GameEvent => ({
    kind: 'votesRevealed',
    source: 'o7',
    controller: 0,
    secret,
    cast: [
      { seat: 0, option: 'seat:1' },
      { seat: 1, option: 'seat:1' },
      { seat: 2, option: 'seat:0' },
    ],
  });
  const line = describeEvent(event(true), state, state, 0);
  expect(line?.text).toContain('The votes are revealed');
  expect(line?.text).toContain('You voted for');
  expect(describeEvent(event(false), state, state, 0)).toBeNull();
});
