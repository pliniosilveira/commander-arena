/** The wording of the Vraska EDHREC deck program (D-216 to D-220): the triggers, the untap choice, the draw-up-to question and the delayed moments. */
import type { Trigger } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { untapChooseText } from '../src/game/artifacts-text';
import { delayedWords } from '../src/game/dragons-text';
import { triggerWording } from '../src/game/trigger-text';
import {
  drawUpToButtonText,
  drawUpToPrompt,
  isCount,
  isDrawUpTo,
} from '../src/ui/decisions/x-picker';

const say = (t: Trigger) => triggerWording(t, { self: 'Mister Fantastic' });

describe('triggers of the program', () => {
  test('one or more tokens you control enter', () => {
    expect(say({ kind: 'entersBatch', what: { token: true, controller: 'you' } })).toBe(
      'Whenever one or more tokens you control enter',
    );
  });

  test('one or more creatures attack, said of any player', () => {
    expect(say({ kind: 'attackBatch', who: 'any', atLeast: 1 })).toBe(
      'Whenever one or more creatures attack',
    );
  });

  test('cast or copy an instant or sorcery spell', () => {
    expect(
      say({
        kind: 'castSpell',
        by: 'you',
        orCopy: true,
        filter: { anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }] },
      }),
    ).toContain('you cast or copy');
  });
});

describe('the untap choice, the delayed moments and the draw-up-to question', () => {
  test('Untap up to three lands', () => {
    expect(
      untapChooseText({ kind: 'choose', filter: { types: ['land'] }, count: 3, upTo: true }),
    ).toBe('Untap up to three lands');
  });

  test('your next main phase', () => {
    expect(delayedWords({ step: 'nextMain', whose: 'you' })).toBe(
      'At the beginning of your next main phase',
    );
  });

  test('the number question of a draw up to some cards has no way back and reads as a count', () => {
    expect(isDrawUpTo({ purpose: 'drawUpTo' })).toBe(true);
    expect(isCount({ purpose: 'drawUpTo' })).toBe(true);
    expect(drawUpToPrompt({ sourceName: 'Arcane Denial', max: 2 })).toBe(
      'Arcane Denial lets you draw up to 2 cards. How many?',
    );
    expect(drawUpToButtonText(0)).toBe("Don't draw");
    expect(drawUpToButtonText(1)).toBe('Draw 1 card');
    expect(drawUpToButtonText(2)).toBe('Draw 2 cards');
  });
});
