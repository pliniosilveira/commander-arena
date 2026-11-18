// Issue 89 (Silverquill Influence), group 11 (D-598): "Whenever a player attacks one of your opponents, ..." with "that attacking player" and "that opponent" (Combat Calligrapher,
// Breena, the Demagogue): the real Oracle line of the Calligrapher read through the whole pipeline, the nodes the pieces lower to, SYNTHETIC variants and the near misses. The engine runs
// what is lowered in packages/engine/test/scenario-xx-player-attacks-opponent.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const TRIGGER = { kind: 'playerAttacksOpponent' } as const;
const creature = (text: string) => readAll(text, 'creature', ['Bird', 'Cleric']).abilities;

describe('"Whenever a player attacks one of your opponents, ..."', () => {
  test('the real line of Combat Calligrapher: that attacking player creates a tapped Inkling token that is attacking that opponent', () => {
    expect(
      creature(
        "Whenever a player attacks one of your opponents, that attacking player creates a tapped 2/1 white and black Inkling creature token with flying that's attacking that opponent.",
      ),
    ).toMatchObject([
      {
        kind: 'triggered',
        trigger: TRIGGER,
        effect: {
          kind: 'createToken',
          token: {
            kind: 'custom',
            definition: {
              name: 'Inkling',
              types: ['creature'],
              subtypes: ['Inkling'],
              colors: ['W', 'B'],
              power: 2,
              toughness: 1,
              abilities: [{ kind: 'keyword', keyword: { kind: 'flying' } }],
            },
          },
          count: 1,
          tapped: true,
          attacking: { at: { kind: 'triggerAttackedPlayer' } },
          controller: { kind: 'triggerPlayer' },
        },
      },
    ]);
  });

  test('"that attacking player" is the player of the event and "that opponent" the player attacked (SYNTHETIC)', () => {
    expect(
      creature(
        'Whenever a player attacks one of your opponents, that attacking player draws a card and that opponent loses 1 life.',
      ),
    ).toEqual([
      {
        kind: 'triggered',
        trigger: TRIGGER,
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'draw', player: { kind: 'triggerPlayer' }, count: 1 },
            { kind: 'loseLife', player: { kind: 'triggerAttackedPlayer' }, amount: 1 },
          ],
        },
      },
    ]);
  });

  test('"that opponent" of another trigger is still the player of that trigger (the opponent who attacked, Tomik)', () => {
    expect(
      creature('Whenever an opponent attacks with creatures, that opponent loses 1 life.'),
    ).toMatchObject([{ effect: { kind: 'loseLife', player: { kind: 'triggerPlayer' } } }]);
  });

  test.each([
    "Whenever a player attacks one of your opponents, that attacking player creates a 2/1 white and black Inkling creature token with flying that's attacking you.",
    'Whenever a player attacks one of their opponents, that attacking player draws a card.',
    'Whenever an opponent attacks one of your opponents, that attacking player draws a card.',
    'Whenever you attack with creatures, that attacking player draws a card.',
    'Whenever a player attacks one of your opponents, that attacking players draw a card.',
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(dropped(text, 'creature', ['Bird']).text).toBe(text);
  });
});
