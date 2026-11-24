/**
 * The words of the initiative and of venturing into Undercity (CR 726, 701.49, 309): the log lines, the names of the abilities on the stack, the room question and the chips. Pure functions
 * of events, decisions and views; no game is played.
 */
import type { DungeonView, GameEvent, GameState } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { optionText, purposeNoun } from '../src/game/chosen';
import { describeEvent } from '../src/game/describe';
import { inherentNameOf, showsRuleText } from '../src/game/monarch-text';
import { dungeonTitle, INITIATIVE_TITLE } from '../src/ui/board/PlayerStrip';
import { optionPrompt } from '../src/ui/decisions/option-picker';

const state = {
  objects: {},
  cards: {},
  definitions: [],
  lki: {},
  pending: null,
} as unknown as GameState;
const line = (event: Record<string, unknown>, viewer = 0): string | undefined =>
  describeEvent(event as unknown as GameEvent, state, state, viewer)?.text;

describe('the log', () => {
  test('taking the initiative', () => {
    expect(line({ kind: 'initiativeTaken', seat: 0, from: null })).toBe('You take the initiative.');
    expect(line({ kind: 'initiativeTaken', seat: 1, from: 0 })).toBe(
      'Opponent takes the initiative.',
    );
  });

  test('moving the venture marker: entering the dungeon, moving to a room, completing it', () => {
    expect(
      line({ kind: 'ventured', seat: 0, dungeon: 'undercity', room: 'secretEntrance', from: null }),
    ).toBe('You enter Undercity: move the venture marker to Secret Entrance.');
    expect(
      line({ kind: 'ventured', seat: 1, dungeon: 'undercity', room: 'trap', from: 'forge' }),
    ).toBe('Opponent moves the venture marker to Trap! (Undercity).');
    expect(line({ kind: 'dungeonCompleted', seat: 0, dungeon: 'undercity' })).toBe(
      'You complete Undercity.',
    );
  });

  test('the answer of the room question reads as a choice of the room', () => {
    expect(
      line({
        kind: 'optionChosen',
        seat: 0,
        source: 'o1',
        purpose: 'dungeonRoom',
        option: 'Lost Well',
      }),
    ).toContain('Lost Well');
  });
});

describe('the names and words of the abilities on the stack', () => {
  test('the initiative and the room abilities are named and show the rule’s own text', () => {
    expect(inherentNameOf('initiativeUpkeep')).toBe('The initiative');
    expect(inherentNameOf('initiativeSteal')).toBe('The initiative');
    expect(inherentNameOf('initiativeTaken')).toBe('The initiative');
    expect(inherentNameOf('undercity:forge')).toBe('Undercity');
    expect(inherentNameOf('monarchDraw')).toBe('The monarch');
    expect(showsRuleText('The initiative')).toBe(true);
    expect(showsRuleText('Undercity')).toBe(true);
    expect(showsRuleText('The monarch')).toBe(false);
  });
});

describe('the room question and the chips', () => {
  test('the question names the dungeon and offers the rooms by name', () => {
    expect(optionPrompt({ purpose: 'dungeonRoom', sourceName: 'Undercity' })).toBe(
      'Choose the room to move your venture marker into (Undercity).',
    );
    expect(purposeNoun('dungeonRoom')).toBe('room');
    expect(optionText('dungeonRoom', 'Lost Well')).toBe('Lost Well');
  });

  test('the dungeon chip says where the marker is and when the next venture completes it', () => {
    const forge: DungeonView = {
      dungeon: 'undercity',
      name: 'Undercity',
      room: 'forge',
      roomName: 'Forge',
      roomText: 'Put two +1/+1 counters on target creature.',
      bottom: false,
    };
    expect(dungeonTitle(forge)).toContain('the venture marker is on Forge');
    expect(dungeonTitle(forge)).not.toContain('completes');
    expect(
      dungeonTitle({
        ...forge,
        room: 'throneOfTheDeadThree',
        roomName: 'Throne of the Dead Three',
        bottom: true,
      }),
    ).toContain('The next venture completes the dungeon.');
    expect(INITIATIVE_TITLE).toContain('ventures into Undercity');
  });
});
