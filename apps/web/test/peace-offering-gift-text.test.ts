/**
 * The words of the gift group of the Peace Offering deck (issue 112) as pure models: the trigger "whenever you give a gift" (CR 702.174c), the gift question for each
 * kind of gift (CR 702.174e to 702.174i), the Gift chip, and the log lines of a gift given and of permanents phasing out (CR 702.26a). No DOM.
 */
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { describeEvent } from '../src/game/describe';
import { giftPrompt } from '../src/game/recursion-text';
import { triggerWording } from '../src/game/trigger-text';
import { chipsOf } from '../src/ui/board/keywords';

describe('the trigger', () => {
  test('"whenever you give a gift", said for each player', () => {
    expect(triggerWording({ kind: 'givesGift', who: 'you' }, { self: 'X' })).toBe(
      'Whenever you give a gift',
    );
    expect(triggerWording({ kind: 'givesGift', who: 'opponent' }, { self: 'X' })).toBe(
      'Whenever an opponent gives a gift',
    );
    expect(triggerWording({ kind: 'givesGift', who: 'any' }, { self: 'X' })).toBe(
      'Whenever a player gives a gift',
    );
  });
});

describe('the gift question names what the opponent would get', () => {
  test.each([
    ['card', 'they draw a card'],
    ['tappedFish', 'they create a tapped 1/1 blue Fish creature token'],
    ['octopus', 'they create an 8/8 blue Octopus creature token'],
    ['extraTurn', 'they take an extra turn after this one'],
  ] as const)('%s', (gift, words) => {
    expect(giftPrompt('opponent', ['instant'], 'X', gift)).toBe(
      `Promise Opponent a gift? If you do, ${words} before the other effects of X.`,
    );
  });
});

describe('the Gift chip', () => {
  test('names the gift from the text', () => {
    const chips = chipsOf({
      keywords: ['gift'],
      oracleText: 'Gift an Octopus (You may promise an opponent a gift as you cast this spell.)',
    });
    expect(chips.map((c) => [c.short, c.full])).toEqual([['Gft', 'Gift an Octopus']]);
  });
});

describe('the log', () => {
  const g = scenario()
    .seat(0)
    .library('Island', 'Island', 'Island')
    .hand('Lightning Bolt')
    .battlefield('Mountain', 'Grizzly Bears')
    .seat(1)
    .library('Island', 'Island', 'Island')
    .at('precombatMain', { active: 0 })
    .build();

  test('a gift given says who gave it, with what, and the rule', () => {
    const described = describeEvent(
      { kind: 'giftGiven', seat: 0, object: g.id('Lightning Bolt') },
      g.state,
      g.state,
      0,
    );
    expect(described?.text).toBe('You give a gift with Lightning Bolt.');
    expect(described?.rule).toBe('CR 702.174c');
  });

  test('permanents phasing out are named', () => {
    const described = describeEvent(
      { kind: 'phasedOut', objects: [g.id('Mountain'), g.id('Grizzly Bears')] },
      g.state,
      g.state,
      0,
    );
    expect(described?.text).toBe('Mountain, Grizzly Bears phase out.');
    expect(described?.rule).toBe('CR 702.26a');
  });
});
