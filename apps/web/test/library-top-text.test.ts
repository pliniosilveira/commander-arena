// How the engine's own words describe the three top-of-library instructions of Cavalier of Thorns, Cream of the Crop and Risen Reef (CR 401.2, 401.4, 608.2c, 701.20a).
import type { Effect, ObjectId } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { lookAtTopText } from '../src/game/artifacts-text';
import { confirmLabel, foundBadge } from '../src/ui/decisions/cards-picker';

type Look = Extract<Effect, { kind: 'lookAtTop' }>;
const say = (n: unknown) => String(n);

describe('the effects, worded as the cards print them', () => {
  test('a revealed land card that must be put onto the battlefield, the rest into the graveyard', () => {
    const effect: Look = {
      kind: 'lookAtTop',
      count: 5,
      revealAll: true,
      take: { filter: { types: ['land'] }, max: 1, min: 1, to: 'battlefield' },
      rest: 'graveyard',
    };
    expect(lookAtTopText(effect, say)).toBe(
      'Reveal the top five cards of your library. Put a land card from among them onto the battlefield. Put the rest into your graveyard',
    );
  });

  test('one of the cards looked at stays on top, the rest go on the bottom in any order', () => {
    const effect: Look = {
      kind: 'lookAtTop',
      count: { kind: 'powerOf', of: { kind: 'triggerSubject' } },
      take: { filter: {}, max: 1, min: 1, hidden: true, to: 'top' },
      rest: 'bottomChosen',
    };
    expect(lookAtTopText(effect, () => "that creature's power")).toBe(
      "Look at the top that creature's power cards of your library. Put one of them on top of your library. Put the rest on the bottom of your library in any order",
    );
  });

  test('one card, onto the battlefield tapped when it is a land card, else into the hand', () => {
    const effect: Look = {
      kind: 'lookAtTop',
      count: 1,
      take: {
        filter: { types: ['land'] },
        max: 1,
        to: 'battlefield',
        tapped: true,
        hidden: true,
        elseAnyToHand: true,
      },
      rest: 'top',
    };
    expect(lookAtTopText(effect, say)).toBe(
      "Look at the top card of your library. If it's a land card, you may put it onto the battlefield tapped. If you don't, put it into your hand",
    );
  });
});

describe('the question for a card put on top', () => {
  test('the button and the badge say "put"', () => {
    expect(confirmLabel({ purpose: 'lookTake' }, [], 'top')).toBe('Put on top');
    const id = 'o1' as ObjectId;
    expect(foundBadge({ purpose: 'lookTake', max: 1 }, [id], id, 'top')).toBe('Put');
  });
});
