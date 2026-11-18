// Issue 89 (Silverquill Influence), "Whenever an enchanted creature dies, draw a card for each Aura you controlled that was attached to it." (D-654; Hateful Eidolon) read
// through the whole pipeline: the real line, the node it lowers to and the near misses the grammar must not read.
// The engine runs the node in packages/engine/test/scenario-xx-enchanted-dies.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const line =
  'Whenever an enchanted creature dies, draw a card for each Aura you controlled that was attached to it.';

describe('"Whenever an enchanted creature dies, draw a card for each Aura you controlled that was attached to it." (CR 603.10a, 113.7a)', () => {
  test('the real second line of Hateful Eidolon', () => {
    const abilities = readAll(`Lifelink\n${line}`, 'creature').abilities;
    expect(abilities[1]).toEqual({
      kind: 'triggered',
      trigger: { kind: 'dies', what: { types: ['creature'], enchanted: true } },
      effect: {
        kind: 'draw',
        player: { kind: 'you' },
        count: { kind: 'aurasAttachedToTriggerSubject', controlledBy: 'you' },
      },
    });
  });

  test.each([
    [
      'Whenever enchanted creature dies, draw a card for each Aura you controlled that was attached to it.',
    ],
    [
      'Whenever an enchanted creature dies, draw a card for each Aura you control that is attached to it.',
    ],
    ['Whenever another enchanted creature dies, draw a card.'],
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(dropped(text, 'creature').stoppedAt).toBeDefined();
  });

  test('the amount is refused where no trigger has a permanent subject (SYNTHETIC)', () => {
    expect(
      dropped(
        'At the beginning of your upkeep, draw a card for each Aura you controlled that was attached to it.',
        'creature',
      ).stoppedAt,
    ).toBeDefined();
  });
});
