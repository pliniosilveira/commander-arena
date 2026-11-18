// Issue 89 (Silverquill Influence), Breena, the Demagogue (D-603): "Whenever a player attacks one of your opponents, if that opponent has more life than another of your
// opponents, that attacking player draws a card and you put two +1/+1 counters on a creature you control." read through the whole pipeline: the real line, the nodes it lowers
// to and the near misses the grammar must not read. The engine runs the nodes in packages/engine/test/scenario-xx-attacks-choose-counters.test.ts and
// scenario-xx-attacked-more-life.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const line =
  'Whenever a player attacks one of your opponents, if that opponent has more life than another of your opponents, that attacking player draws a card and you put two +1/+1 counters on a creature you control.';

describe('Breena, the Demagogue (CR 508.6, 603.4, 122.6)', () => {
  test('the real second line of Breena', () => {
    const abilities = readAll(`Flying\n${line}`, 'creature').abilities;
    expect(abilities[1]).toEqual({
      kind: 'triggered',
      trigger: { kind: 'playerAttacksOpponent' },
      interveningIf: { kind: 'attackedHasMoreLifeThanOtherOpponent' },
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'draw', player: { kind: 'triggerPlayer' }, count: 1 },
          {
            kind: 'chooseObjects',
            id: expect.any(String),
            filter: { types: ['creature'], controller: 'you' },
            count: 1,
            exactly: true,
          },
          {
            kind: 'addCounters',
            objects: { kind: 'chosen', id: expect.any(String) },
            counter: '+1/+1',
            count: 2,
          },
        ],
      },
    });
  });

  test('the counters alone, with and without the subject (SYNTHETIC)', () => {
    const a = readAll(
      'Whenever a player attacks one of your opponents, put two +1/+1 counters on a creature you control.',
      'creature',
    ).abilities;
    const b = readAll(
      'Whenever a player attacks one of your opponents, you put two +1/+1 counters on a creature you control.',
      'creature',
    ).abilities;
    expect(b).toEqual(a);
  });

  test.each([
    [
      'Whenever an opponent attacks you, if that opponent has more life than another of your opponents, draw a card.',
    ],
    [
      'Whenever a player attacks one of your opponents, if that opponent has more life than you, that attacking player draws a card.',
    ],
    [
      'Whenever a player attacks one of your opponents, if that opponent has more life than another of your opponents, you put two +1/+1 counters on a creature an opponent controls.',
    ],
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(dropped(text, 'creature').stoppedAt).toBeDefined();
  });
});
