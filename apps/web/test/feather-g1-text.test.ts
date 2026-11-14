/**
 * The web side of the Feather deck's first group (D-1300, D-1301): the question of the color of "gains protection from the color of your choice" (a `chooseOption` decision of
 * purpose 'protectionColor', which goes through the dialog of the named options, no new dialog kind), its log line (the choice is public, so the other player reads the color), and the
 * words of the amount "for each card you've drawn this turn".
 */
import type { ChooseOptionDecision, GameState } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { amountPhrase } from '../src/game/amount-text';
import { optionText, purposeNoun } from '../src/game/chosen';
import { describeEvent } from '../src/game/describe';
import {
  isProtectionColorChoice,
  namedOptionPrompt,
  namedOptionRows,
} from '../src/ui/decisions/option-names';
import { optionPrompt } from '../src/ui/decisions/option-picker';

const ASK = {
  id: 'd1',
  kind: 'chooseOption',
  seat: 0,
  purpose: 'protectionColor',
  options: ['W', 'U', 'B', 'R', 'G'],
  protects: ['o9'],
  source: 'o7',
  sourceName: 'Gods Willing',
  sourceOracleText:
    'Target creature you control gains protection from the color of your choice until end of turn.',
} as unknown as ChooseOptionDecision;

test('the prompt names the spell and says what the color is for; it is no "enters" question', () => {
  expect(isProtectionColorChoice(ASK)).toBe(true);
  expect(namedOptionPrompt(ASK)).toBe(
    'Choose a color for Gods Willing: protection from it until end of turn.',
  );
  expect(optionPrompt(ASK)).toBe(namedOptionPrompt(ASK));
});

test('one button for each of the five colors, in the engine’s order, with the color’s name', () => {
  expect(namedOptionRows(ASK)).toEqual([
    { option: 'W', label: 'White', detail: null },
    { option: 'U', label: 'Blue', detail: null },
    { option: 'B', label: 'Black', detail: null },
    { option: 'R', label: 'Red', detail: null },
    { option: 'G', label: 'Green', detail: null },
  ]);
});

test('the words of the answer and its noun', () => {
  expect(optionText('protectionColor', 'R')).toBe('Red');
  expect(purposeNoun('protectionColor')).toBe('color');
});

test('the log line says the color, for the opponent too: "You choose Red for Gods Willing (...)."', () => {
  const asked = (seat: number) =>
    ({
      pending: { ...ASK, seat },
      objects: {},
      lki: { o7: { characteristics: { name: 'Gods Willing' } } },
    }) as unknown as GameState;
  const event = (seat: number, option: string) =>
    ({ kind: 'optionChosen', seat, source: 'o7', purpose: 'protectionColor', option }) as const;
  const you = describeEvent(event(0, 'R'), asked(0), asked(0), 0);
  expect(you?.text).toBe(
    'You choose Red for Gods Willing (protection from that color until end of turn).',
  );
  expect(you?.rule).toBe('CR 702.16a');
  const them = describeEvent(event(1, 'U'), asked(1), asked(1), 0);
  expect(them?.text).toBe(
    'Opponent chooses Blue for Gods Willing (protection from that color until end of turn).',
  );
});

test('the amount: "the number of cards you\'ve drawn this turn"', () => {
  expect(amountPhrase({ kind: 'cardsDrawnThisTurn' })).toBe(
    "the number of cards you've drawn this turn",
  );
});
