/**
 * The web side of "As this artifact enters, pay any amount of life" (CR 119.4, 614.12) as pure models: the prompt, the range of the number, the words of the
 * button, the label of the permanent that remembers the amount and the log line. No DOM.
 */
import type { ChooseOptionDecision } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { chosenLabel, optionText, purposeNoun } from '../src/game/chosen';
import {
  clampLifePaid,
  isLifePaidChoice,
  lifePaidButton,
  lifePaidDetail,
  lifePaidPrompt,
  maxLifePaid,
} from '../src/ui/decisions/life-paid';
import { optionPrompt } from '../src/ui/decisions/option-picker';

const ask = (life: number): Pick<ChooseOptionDecision, 'purpose' | 'options' | 'sourceName'> => ({
  purpose: 'lifePaid',
  options: Array.from({ length: life + 1 }, (_, i) => String(i)),
  sourceName: 'Phyrexian Processor',
});

describe('the question', () => {
  test('is recognised and worded', () => {
    expect(isLifePaidChoice(ask(5))).toBe(true);
    expect(isLifePaidChoice({ purpose: 'color' })).toBe(false);
    expect(lifePaidPrompt(ask(5))).toBe('As Phyrexian Processor enters, pay any amount of life.');
    expect(optionPrompt(ask(5))).toBe('As Phyrexian Processor enters, pay any amount of life.');
    expect(purposeNoun('lifePaid')).toBe('amount of life to pay');
    expect(optionText('lifePaid', '7')).toBe('7');
  });

  test('the number stays between 0 and the life total', () => {
    const d = ask(12);
    expect(maxLifePaid(d)).toBe(12);
    expect(clampLifePaid(d, -3)).toBe(0);
    expect(clampLifePaid(d, 4.9)).toBe(4);
    expect(clampLifePaid(d, 99)).toBe(12);
    expect(clampLifePaid(d, Number.NaN)).toBe(0);
    // a player whose life total cannot change can pay 0 only
    expect(maxLifePaid(ask(0))).toBe(0);
  });

  test('the button and the detail say what is paid and what is left', () => {
    expect(lifePaidButton(0)).toBe('Pay no life');
    expect(lifePaidButton(7)).toBe('Pay 7 life');
    expect(lifePaidDetail(ask(40), 7)).toBe('You have 40 life. You would have 33 life left.');
  });
});

describe('what the permanent shows', () => {
  test('the amount it paid is a chip, 0 included', () => {
    expect(chosenLabel({ chosen: { lifePaid: 7 } })?.short).toBe('7 life');
    expect(chosenLabel({ chosen: { lifePaid: 0 } })?.short).toBe('0 life');
    expect(chosenLabel({})).toBeNull();
  });
});
