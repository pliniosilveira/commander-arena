// The Niv-Mizzet deck (issue 25), group 2b-a (D-331 to D-333): "there are no cards in your library" with its "as long as" static ability and its "while" of
// a replacement of a draw (Living Conundrum), and "Whenever a source you control deals noncombat damage to an opponent, you draw that many cards" (Niv-Mizzet,
// Visionary). The lines are the real Oracle text of the acceptance cards of the golden corpus, names replaced by ~, read through the whole pipeline; the
// other lines are SYNTHETIC siblings and the near misses the grammar must not read. The engine runs what is lowered in
// convert-grammar-engine-niv-draw.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const EMPTY = { kind: 'cardsInLibrary', compare: { cmp: 'atMost', value: 0 } } as const;

describe('"If you would draw a card while your library has no cards in it, skip that draw instead." (Living Conundrum, CR 614.11, 121.6)', () => {
  test('the real line: a replacement of a draw while the library is empty', () => {
    const parsed = readAll(
      'If you would draw a card while your library has no cards in it, skip that draw instead.',
      'creature',
    );
    expect(parsed.abilities).toEqual([
      { kind: 'replacement', replacement: { kind: 'skipDraw', while: EMPTY } },
    ]);
  });

  test('the other wording of the condition and a count (SYNTHETIC)', () => {
    const there = readAll(
      'If you would draw a card while there are no cards in your library, skip that draw instead.',
      'creature',
    );
    expect(there.abilities).toEqual([
      { kind: 'replacement', replacement: { kind: 'skipDraw', while: EMPTY } },
    ]);
    const fewer = readAll(
      'If you would draw a card while your library has fewer than three cards in it, skip that draw instead.',
      'artifact',
    );
    expect(fewer.abilities).toEqual([
      {
        kind: 'replacement',
        replacement: {
          kind: 'skipDraw',
          while: { kind: 'cardsInLibrary', compare: { cmp: 'atMost', value: 2 } },
        },
      },
    ]);
  });

  test('without a while, every draw is skipped (SYNTHETIC)', () => {
    const parsed = readAll('If you would draw a card, skip that draw instead.', 'artifact');
    expect(parsed.abilities).toEqual([{ kind: 'replacement', replacement: { kind: 'skipDraw' } }]);
  });

  test.each([
    'If an opponent would draw a card, skip that draw instead.',
    'If you would draw two cards, skip that draw instead.',
    'If you would draw a card, draw two cards instead.',
    'If you would draw a card while you control a creature, skip that draw instead.',
    'If you would draw a card while your library has no cards in it, skip your draw step instead.',
    'If you would draw a card while your library has no cards in it, skip that draw instead',
    'If you would draw a card while your library has at least three cards in it, skip that draw instead.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(dropped(text, 'artifact').reason).toBe('unrecognised');
  });
});

describe('"As long as there are no cards in your library, ~ has base power and toughness 10/10 and has flying and vigilance." (Living Conundrum, CR 613.4b)', () => {
  test('the real line: base power and toughness and two keywords, each with the condition', () => {
    const parsed = readAll(
      'As long as there are no cards in your library, ~ has base power and toughness 10/10 and has flying and vigilance.',
      'creature',
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'static',
        static: { kind: 'setPt', subject: { kind: 'this' }, power: 10, toughness: 10 },
        condition: EMPTY,
      },
      {
        kind: 'static',
        static: { kind: 'grantKeyword', subject: { kind: 'this' }, keyword: { kind: 'flying' } },
        condition: EMPTY,
      },
      {
        kind: 'static',
        static: { kind: 'grantKeyword', subject: { kind: 'this' }, keyword: { kind: 'vigilance' } },
        condition: EMPTY,
      },
    ]);
  });

  test('the condition alone, with another subject and a count (SYNTHETIC)', () => {
    const parsed = readAll(
      'As long as your library has fewer than five cards in it, ~ has flying.',
      'creature',
    );
    expect(JSON.stringify(parsed.abilities)).toContain(
      '"condition":{"kind":"cardsInLibrary","compare":{"cmp":"atMost","value":4}}',
    );
  });

  test.each([
    'As long as there are no creature cards in your library, ~ has flying.',
    "As long as there are no cards in an opponent's library, ~ has flying.",
    'As long as there are three or more cards in your library, ~ has flying.',
    'As long as there are no cards in your graveyard, ~ has flying.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(dropped(text, 'creature').reason).toBe('unrecognised');
  });
});

describe('"Whenever a source you control deals noncombat damage to an opponent, you draw that many cards." (Niv-Mizzet, Visionary, CR 120.2b, 603.2c)', () => {
  test('the real line: the trigger and the draw of that many cards (the damage dealt)', () => {
    const parsed = readAll(
      'Whenever a source you control deals noncombat damage to an opponent, you draw that many cards.',
      'creature',
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'noncombatDamageDealt', by: 'you', to: 'opponent' },
        effect: { kind: 'draw', player: { kind: 'you' }, count: { kind: 'triggerDamage' } },
      },
    ]);
  });

  test('the other combinations of whose source and which player (SYNTHETIC)', () => {
    const cases = [
      ['a source you control deals noncombat damage to a player', 'you', 'player'],
      ['a source deals noncombat damage to a player', 'any', 'player'],
      ['a source deals noncombat damage to an opponent', 'any', 'opponent'],
    ] as const;
    for (const [words, by, to] of cases) {
      const parsed = readAll(`Whenever ${words}, you gain 1 life.`, 'creature');
      expect(parsed.abilities, words).toEqual([
        {
          kind: 'triggered',
          trigger: { kind: 'noncombatDamageDealt', by, to },
          effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
        },
      ]);
    }
  });

  test('"that much life" and "that player" read the damage and the player damaged (SYNTHETIC)', () => {
    const life = readAll(
      'Whenever a source you control deals noncombat damage to an opponent, you gain that much life.',
      'creature',
    );
    expect(JSON.stringify(life.abilities)).toContain('"amount":{"kind":"triggerDamage"}');
    const that = readAll(
      'Whenever a source you control deals noncombat damage to an opponent, that player loses 1 life.',
      'creature',
    );
    expect(JSON.stringify(that.abilities)).toContain('"player":{"kind":"triggerPlayer"}');
  });

  test('"that many" after another instruction is not the damage: it is read and not lowered (SYNTHETIC)', () => {
    expect(
      dropped(
        'Whenever a source you control deals noncombat damage to an opponent, mill two cards, then draw that many cards.',
        'creature',
      ).reason,
    ).toBe('notRunnable');
  });

  test.each([
    'Whenever a source you control deals damage to an opponent, you draw a card.',
    'Whenever a source you control deals noncombat damage to a creature, you draw a card.',
    'Whenever a source you control deals noncombat damage to you, you draw a card.',
    'Whenever a creature you control deals noncombat damage to an opponent, you draw a card.',
    'Whenever a source an opponent controls deals noncombat damage to an opponent, you draw a card.',
    'Whenever one or more sources you control deal noncombat damage to an opponent, you draw a card.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(dropped(text, 'creature').reason).toBe('unrecognised');
  });

  test('combat damage keeps its own trigger', () => {
    const parsed = readAll(
      'Whenever a creature you control deals combat damage to a player, you draw a card.',
      'creature',
    );
    expect(JSON.stringify(parsed.abilities)).toContain('"dealsCombatDamage"');
    expect(JSON.stringify(parsed.abilities)).not.toContain('noncombatDamageDealt');
  });
});
