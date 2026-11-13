// The Hashaton deck program (issue 31), group 3 (D-1150 to D-1152, provisional): "Creatures you control can't have -1/-1 counters put on them." (Darksteel Angel)
// and the two replacement effects of Bard, King of Dale: "If you would draw a card except the first one you draw in each of your draw steps, draw two cards
// instead." and "If one or more tokens would be created under your control, twice that many of those tokens are created instead." The lines are the real Oracle text of
// the acceptance cards of the golden corpus, read through the whole pipeline; the other lines are SYNTHETIC siblings and the near misses the grammar must not read. The
// engine runs what is lowered in convert-grammar-engine-hashaton-g3.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const CREATURES_YOU_CONTROL = {
  kind: 'filter',
  filter: { types: ['creature'], controller: 'you' },
};

describe('"Creatures you control can\'t have -1/-1 counters put on them." (CR 122.6, 101.2)', () => {
  test('the real line: a static ability of a group of creatures, with the counter it keeps off', () => {
    for (const text of [
      "Creatures you control can't have -1/-1 counters put on them.",
      'Creatures you control can’t have -1/-1 counters put on them.',
    ]) {
      const parsed = readAll(text, 'creature');
      expect(parsed.abilities).toEqual([
        {
          kind: 'static',
          static: { kind: 'cantHaveCounters', subject: CREATURES_YOU_CONTROL, counter: '-1/-1' },
        },
      ]);
    }
  });

  test('the whole text of the real card: keywords, the protections of the player and the line', () => {
    const parsed = readAll(
      'Flying, indestructible\nYou can’t lose the game and your opponents can’t win the game.\nCreatures you control can’t have -1/-1 counters put on them.',
      'creature',
    );
    expect(parsed.abilities.map((a) => (a.kind === 'static' ? a.static.kind : a.kind))).toEqual([
      'keyword',
      'keyword',
      'cantLoseGame',
      'opponentsCantWin',
      'cantHaveCounters',
    ]);
  });

  test('another group, another counter and another subject (SYNTHETIC)', () => {
    expect(
      readAll("Other creatures you control can't have +1/+1 counters put on them.", 'creature')
        .abilities,
    ).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'cantHaveCounters',
          subject: {
            kind: 'filter',
            filter: { types: ['creature'], controller: 'you' },
            other: true,
          },
          counter: '+1/+1',
        },
      },
    ]);
    expect(
      readAll("Elves you control can't have -1/-1 counters put on them.", 'creature').abilities,
    ).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'cantHaveCounters',
          subject: { kind: 'filter', filter: { subtypes: ['Elf'], controller: 'you' } },
          counter: '-1/-1',
        },
      },
    ]);
    expect(readAll("~ can't have +1/+1 counters put on it.", 'creature').abilities).toEqual([
      {
        kind: 'static',
        static: { kind: 'cantHaveCounters', subject: { kind: 'this' }, counter: '+1/+1' },
      },
    ]);
  });

  test('the permanent an Aura is attached to (SYNTHETIC)', () => {
    expect(
      readAll("Enchanted creature can't have -1/-1 counters put on it.", 'enchantment', ['Aura'])
        .abilities,
    ).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'cantHaveCounters',
          subject: { kind: 'attached', types: ['creature'] },
          counter: '-1/-1',
        },
      },
    ]);
  });

  test("an Aura's subject is read only on an Aura: on any other card it is not runnable", () => {
    expect(
      dropped("Enchanted creature can't have -1/-1 counters put on it.", 'enchantment'),
    ).toMatchObject({ reason: 'notRunnable' });
  });

  test.each([
    "Creatures you control can't have -1/-1 counters put on them",
    "Creatures you control can't have counters put on them.",
    "Creatures you control can't have loyalty counters put on them.",
    "Creatures you control can't have -1/-1 counters put on it.",
    "Creatures you control can't have -1/-1 counters put on them until end of turn.",
    "Creatures you control can't have -1/-1 counters put on them as long as you control a Dragon.",
    "Creatures you control can't have -1/-1 counters put on them and have flying.",
    "Players can't have -1/-1 counters put on them.",
    "Counters can't be put on creatures you control.",
  ])('is not read: %s', (text) => {
    expect(dropped(text, 'creature')).toMatchObject({ reason: 'unrecognised' });
  });
});

describe('"If you would draw a card except the first one you draw in each of your draw steps, draw two cards instead." (CR 614.11, 504.1)', () => {
  test('the real line: a replacement effect of the controller, with the number of cards', () => {
    expect(
      readAll(
        'If you would draw a card except the first one you draw in each of your draw steps, draw two cards instead.',
        'creature',
      ).abilities,
    ).toEqual([
      {
        kind: 'replacement',
        replacement: { kind: 'drawInstead', count: 2, exceptFirstInDrawStep: true },
      },
    ]);
  });

  test('a different number (SYNTHETIC)', () => {
    expect(
      readAll(
        'If you would draw a card except the first one you draw in each of your draw steps, draw three cards instead.',
        'creature',
      ).abilities,
    ).toEqual([
      {
        kind: 'replacement',
        replacement: { kind: 'drawInstead', count: 3, exceptFirstInDrawStep: true },
      },
    ]);
  });

  test.each([
    'If you would draw a card except the first one you draw in each of your draw steps, draw two cards instead',
    'If you would draw a card except the first one you draw in each of your draw steps, draw two cards.',
    'If you would draw a card except the first one you draw in each of your draw steps, draw a card instead.',
    'If you would draw a card except the first one you draw in each of your draw steps, draw seven cards instead.',
    // every draw, with no exception: the engine has no form of it
    'If you would draw a card, draw two cards instead.',
    'If you would draw a card except the first one you draw each turn, draw two cards instead.',
    'If an opponent would draw a card except the first one they draw in each of their draw steps, they draw two cards instead.',
    'If you would draw a card except the first one you draw in each of your draw steps, skip that draw instead.',
    'If you would draw a card except the first one you draw in each of your draw steps, draw two cards instead. Draw a card.',
  ])('is not read: %s', (text) => {
    expect(dropped(text, 'creature')).toMatchObject({ reason: 'unrecognised' });
  });
});

describe('"If one or more tokens would be created under your control, twice that many of those tokens are created instead." (CR 614.1a, 614.5)', () => {
  const DOUBLE = {
    kind: 'replacement',
    replacement: { kind: 'tokensInstead', what: { token: true }, mode: 'double' },
  };

  test('the real line: every token, doubled', () => {
    expect(
      readAll(
        'If one or more tokens would be created under your control, twice that many of those tokens are created instead.',
        'creature',
      ).abilities,
    ).toEqual([DOUBLE]);
  });

  test('the other wording of the same rule (SYNTHETIC: the shape of Parallel Lives)', () => {
    expect(
      readAll(
        'If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.',
        'enchantment',
      ).abilities,
    ).toEqual([DOUBLE]);
  });

  test('both lines of the real card, with the keywords, are two abilities', () => {
    const parsed = readAll(
      'Reach, vigilance\nIf you would draw a card except the first one you draw in each of your draw steps, draw two cards instead.\nIf one or more tokens would be created under your control, twice that many of those tokens are created instead.',
      'creature',
    );
    expect(parsed.abilities).toHaveLength(4);
    expect(parsed.abilities[2]).toMatchObject({
      replacement: { kind: 'drawInstead' },
    });
    expect(parsed.abilities[3]).toEqual(DOUBLE);
  });

  test('the doubling of artifact tokens is still the old rule: the Dragons are not read as a doubling', () => {
    const parsed = readAll(
      'If one or more artifact tokens would be created under your control, that many 5/5 red Dragon creature tokens with flying are created instead.',
      'creature',
    );
    expect(parsed.abilities[0]).toMatchObject({
      replacement: { kind: 'tokensInstead', mode: 'thatMany' },
    });
  });

  test.each([
    'If one or more tokens would be created under your control, twice that many of those tokens are created instead',
    'If one or more tokens would be created under your control, twice that many of those tokens are created.',
    'If one or more tokens would be created under your control, three times that many of those tokens are created instead.',
    'If one or more tokens would be created under your control, that many of those tokens are created instead.',
    // a kind of token: the engine's doubling names every token
    'If one or more creature tokens would be created under your control, twice that many of those tokens are created instead.',
    'If one or more tokens would be created under an opponent’s control, twice that many of those tokens are created instead.',
    'If one or more tokens would be created, twice that many of those tokens are created instead.',
    'If an effect would create one or more creature tokens under your control, it creates twice that many of those tokens instead.',
    // counters are another replacement
    'If an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead.',
  ])('is not read: %s', (text) => {
    expect(dropped(text, 'creature')).toMatchObject({ reason: 'unrecognised' });
  });
});
