/**
 * The web side of D-175 (the Korvold slice, text and tokens) as pure models, no DOM: the question that asks which of the instructions an effect
 * offers ("create a Food token" or "create a Treasure token", CR 608.2d), its prompt and buttons, and the line of the log.
 */
import type { ChooseOptionDecision, GameState } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { optionText, purposeNoun } from '../src/game/chosen';
import { describeEvent } from '../src/game/describe';
import {
  capitalised,
  isChapterChoice,
  isEffectChoice,
  isNamedChoice,
  namedOptionPrompt,
  namedOptionRows,
} from '../src/ui/decisions/option-names';
import { optionPrompt } from '../src/ui/decisions/option-picker';

const OFFER: Pick<ChooseOptionDecision, 'purpose' | 'options' | 'sourceName' | 'sourceOracleText'> =
  {
    purpose: 'effect',
    options: ['create a Food token', 'create a Treasure token'],
    sourceName: 'SYNTHETIC Provisioner',
    sourceOracleText:
      'Whenever a land you control enters, create a Food token or a Treasure token.',
  };

test('the choice among offered instructions is its own kind of choice: not a chapter, not a name', () => {
  expect(isEffectChoice(OFFER)).toBe(true);
  expect(isChapterChoice(OFFER)).toBe(false);
  expect(isNamedChoice(OFFER)).toBe(false);
  expect(isEffectChoice({ purpose: 'option', options: ['Khans', 'Dragons'] })).toBe(false);
});

test('the prompt says which ability resolves and lists the instructions as the card words them', () => {
  expect(namedOptionPrompt(OFFER)).toBe(
    'Choose one for SYNTHETIC Provisioner: create a Food token or create a Treasure token.',
  );
  expect(optionPrompt(OFFER)).toBe(namedOptionPrompt(OFFER));
  const three = { ...OFFER, options: ['draw a card', 'gain 3 life', 'create a Treasure token'] };
  expect(namedOptionPrompt(three)).toBe(
    'Choose one for SYNTHETIC Provisioner: draw a card, gain 3 life or create a Treasure token.',
  );
});

test('one button for each instruction, in the order the engine lists them, with a capital', () => {
  expect(namedOptionRows(OFFER)).toEqual([
    { option: 'create a Food token', label: 'Create a Food token', detail: null },
    { option: 'create a Treasure token', label: 'Create a Treasure token', detail: null },
  ]);
  expect(capitalised('')).toBe('');
  expect(capitalised('gain 3 life')).toBe('Gain 3 life');
});

test('the words of the choice in the other helpers', () => {
  expect(optionText('effect', 'create a Food token')).toBe('create a Food token');
  expect(purposeNoun('effect')).toBe('option');
});

test('the log line: "You choose to create a Food token (X)." and "Opponent chooses to ..."', () => {
  const asked = (seat: number) =>
    ({
      pending: { kind: 'chooseOption', seat, source: 'o7', ...OFFER },
      objects: {},
      lki: {},
    }) as unknown as GameState;
  const event = (seat: number) =>
    ({
      kind: 'optionChosen',
      seat,
      source: 'o7',
      purpose: 'effect',
      option: 'create a Food token',
    }) as const;
  const you = describeEvent(event(0), asked(0), asked(0), 0);
  expect(you?.text).toMatch(/^You choose to create a Food token \(.+\)\.$/);
  expect(you?.level).toBe('major');
  expect(you?.rule).toBe('CR 608.2d');
  const them = describeEvent(event(1), asked(1), asked(1), 0);
  expect(them?.text).toMatch(/^Opponent chooses to create a Food token \(.+\)\.$/);
});
