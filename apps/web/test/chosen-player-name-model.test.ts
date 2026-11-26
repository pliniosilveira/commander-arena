/**
 * The web side of "As this creature enters, choose a player" and "choose a nonland card name" (CR 614.12a, 607.2d, 201.2) as pure models: the prompts, the words of the buttons,
 * the label of the permanent that remembers the choice. No DOM.
 */
import { describe, expect, test } from 'vitest';
import { chosenLabel, optionText, purposeNoun } from '../src/game/chosen';
import { namedOptionPrompt, namedOptionRows } from '../src/ui/decisions/option-names';
import { optionPrompt } from '../src/ui/decisions/option-picker';

describe('choose a player', () => {
  const ask = {
    purpose: 'player',
    options: ['seat:0', 'seat:2', 'seat:3'],
    sourceName: 'Sewer Nemesis',
    sourceOracleText: '',
  } as const;

  test('is worded, with one button for each player', () => {
    expect(optionPrompt(ask)).toBe('As Sewer Nemesis enters, choose a player.');
    expect(namedOptionPrompt({ ...ask, replacement: undefined } as never)).toBe(
      'As Sewer Nemesis enters, choose a player.',
    );
    expect(purposeNoun('player')).toBe('player');
    expect(optionText('player', 'seat:2')).toBe('player 3');
    expect(
      namedOptionRows({ ...ask, replacement: undefined } as never).map((r) => r.label),
    ).toEqual(['Player 1', 'Player 3', 'Player 4']);
  });

  test('the permanent shows the player it chose', () => {
    expect(chosenLabel({ chosen: { player: 1 } })).toEqual({
      short: 'player 2',
      title: 'Chosen player: player 2',
      heading: 'Chosen player',
    });
  });
});

describe('choose a nonland card name', () => {
  test('is worded and shown', () => {
    const ask = { purpose: 'cardName', sourceName: 'Phyrexian Revoker', options: [] } as const;
    expect(optionPrompt(ask)).toBe('As Phyrexian Revoker enters, choose a nonland card name.');
    expect(purposeNoun('cardName')).toBe('nonland card name');
    expect(optionText('cardName', 'Sol Ring')).toBe('Sol Ring');
    expect(chosenLabel({ chosen: { cardName: 'Sol Ring' } })).toEqual({
      short: 'Sol Ring',
      title: 'Chosen name: Sol Ring',
      heading: 'Chosen card name',
    });
  });
});
