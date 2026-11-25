// Draconic Dissent deck (issue 167), goad group: the real Oracle lines of Bothersome Quasit and Sly Instigator read through the whole pipeline, the nodes they lower to, and the near
// misses the grammar must not read. The engine runs what is lowered in scenario-xx-draconic-goad.test.ts and scenario-xx-draconic-quasit.test.ts.
import { validateAbility } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { dropped, read, readAll } from './parser-p5-helpers';

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

describe('"Creatures your opponents control with power less than ~\'s power are goaded." (CR 701.15a, 208.1)', () => {
  test('the real line of Baeloth Barrityl is a goad of the opponents creatures with less power than the source', () => {
    expect(
      readAll(
        "Creatures your opponents control with power less than ~'s power are goaded.",
        'creature',
      ).abilities,
    ).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'goaded',
          subject: {
            kind: 'filter',
            filter: { types: ['creature'], controller: 'opponent', powerLessThanSource: true },
          },
        },
      },
    ]);
  });

  test.each([
    ["Creatures you control with power less than ~'s power are goaded."],
    ["Creatures your opponents control with power greater than ~'s power are goaded."],
    ['Creatures your opponents control with power less than 3 are goaded.'],
  ])('another group or effect is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(dropped(text, 'creature').stoppedAt).not.toBe('');
  });

  // The grammar reads the group of the line below (the same noun as the "can't block" cards of the corpus), but the engine refuses it: only a static ability that goads may
  // compare power with its source (the validator), so no card carrying it is supported.
  test('a keyword for that group is refused by the engine (SYNTHETIC)', () => {
    const [ability] = read(
      "Creatures your opponents control with power less than ~'s power have flying.",
      'creature',
    ).abilities;
    if (ability === undefined) throw new Error('not read');
    expect(validateAbility(ability).length).toBeGreaterThan(0);
  });
});

describe('Firkraag: "attack an opponent" and "had to attack this combat" (CR 508.6, 508.1d, 701.15a)', () => {
  test('"that player" of an attack on an opponent is the opponent attacked', () => {
    expect(
      readAll(
        'Whenever one or more Dragons you control attack an opponent, goad target creature that player controls.',
        'creature',
        ['Dragon'],
      ).abilities,
    ).toMatchObject([
      {
        kind: 'triggered',
        trigger: { kind: 'attackBatch', who: 'you', eachAttackedOpponent: true },
        targets: [{ what: { filter: { controller: 'triggerPlayer' } } }],
        effect: { kind: 'goad' },
      },
    ]);
  });

  test('"attack a player" does not bind "that player" to the player attacked (SYNTHETIC)', () => {
    expect(
      dropped(
        'Whenever one or more Dragons you control attack a player, goad target creature that player controls.',
        'creature',
        ['Dragon'],
      ).reason,
    ).toBe('unboundReference');
  });

  test('"that creature had to attack this combat" is the intervening if of a trigger about a creature', () => {
    expect(
      readAll(
        'Whenever a creature deals combat damage to one of your opponents, if that creature had to attack this combat, draw a card.',
        'creature',
      ).abilities,
    ).toMatchObject([{ kind: 'triggered', interveningIf: { kind: 'subjectHadToAttack' } }]);
  });
});

describe('Agitator Ant: "each player may put two +1/+1 counters on a creature they control." (CR 101.4, 608.2d, 608.2c, 701.15a)', () => {
  const TEXT =
    'At the beginning of your end step, each player may put two +1/+1 counters on a creature they control. Goad each creature that had counters put on it this way.';

  test('the real line is each player asked, choosing as themselves, then a goad of the creatures that got counters', () => {
    const [ability] = readAll(TEXT, 'creature').abilities;
    expect(ability).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'endStep', whose: 'you' },
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'playersMay',
            players: { kind: 'eachPlayer' },
            runsAs: 'chooser',
            effect: {
              kind: 'sequence',
              effects: [
                {
                  kind: 'chooseObjects',
                  filter: { types: ['creature'], controller: 'you' },
                  count: 1,
                  exactly: true,
                },
                { kind: 'addCounters', counter: '+1/+1', count: 2 },
              ],
            },
          },
          { kind: 'goad', objects: { kind: 'putCountersOn' } },
        ],
      },
    });
  });

  test.each([
    [
      'At the beginning of your end step, you may put two +1/+1 counters on a creature they control.',
    ],
    [
      'At the beginning of your end step, target opponent puts two +1/+1 counters on a creature they control.',
    ],
    [
      'At the beginning of your end step, each player may put two +1/+1 counters on a creature you control.',
    ],
    [
      'At the beginning of your end step, each player may put two +1/+1 counters on two creatures they control.',
    ],
  ])(
    '"they" outside a sentence that asks the players, or another group, is dropped (SYNTHETIC): %s',
    (text) => {
      expect(dropped(text, 'creature').stoppedAt).not.toBe('');
    },
  );
});
