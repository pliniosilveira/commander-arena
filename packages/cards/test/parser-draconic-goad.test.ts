// Draconic Dissent deck (issue 167), goad group: the real Oracle lines of Bothersome Quasit and Sly Instigator read through the whole pipeline, the nodes they lower to, and the near
// misses the grammar must not read. The engine runs what is lowered in scenario-xx-draconic-goad.test.ts and scenario-xx-draconic-quasit.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

describe('"Goaded creatures your opponents control can\'t block." (CR 701.15b, 509.1b)', () => {
  test('the real line of Bothersome Quasit is a restriction on the goaded group', () => {
    expect(
      readAll("Goaded creatures your opponents control can't block.", 'creature').abilities,
    ).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'restriction',
          subject: {
            kind: 'filter',
            filter: { types: ['creature'], controller: 'opponent', goaded: true },
          },
          restriction: 'cantBlock',
        },
      },
    ]);
  });

  test.each([
    ['Goaded creatures your opponents control have flying.'],
    ['Goaded creatures your opponents control get +1/+1.'],
  ])('another effect on the goaded group is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(dropped(text, 'creature').reason).toBe('notRunnable');
  });
});

describe('"Until your next turn, target creature an opponent controls can\'t be blocked. Goad that creature." (CR 509.1b, 611.2a, 701.15a)', () => {
  const TEXT =
    "{U}, {T}: Until your next turn, target creature an opponent controls can't be blocked. Goad that creature.";

  test('the real line of Sly Instigator is a restriction until the next turn and a goad of the same target', () => {
    const [ability] = readAll(TEXT, 'creature').abilities;
    expect(ability).toMatchObject({
      kind: 'activated',
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'restrict',
            objects: { kind: 'target', id: 't1' },
            restriction: 'cantBeBlocked',
            duration: 'untilYourNextTurn',
          },
          { kind: 'goad', objects: { kind: 'target', id: 't1' } },
        ],
      },
    });
  });

  test.each([
    ["{U}, {T}: Until your next turn, target creature can't attack."],
    ["{U}, {T}: Target creature can't be blocked until your next turn."],
    ["{U}, {T}: Until your next turn, target creatures can't be blocked."],
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(dropped(text, 'creature').stoppedAt).not.toBe('');
  });
});
