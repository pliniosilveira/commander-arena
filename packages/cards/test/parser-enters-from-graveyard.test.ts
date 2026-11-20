// Twilight Diviner: "Whenever one or more other creatures you control enter, if they entered or were cast from a graveyard, create a token that's a copy of one of them. This ability
// triggers only once each turn." The real line read through the whole pipeline, the nodes it lowers to, SYNTHETIC variants and the near misses (CR 603.2c, 603.4, 603.6a, 601.2a, 707.2).
// The engine runs what is lowered in packages/engine/test/scenario-xx-enters-from-graveyard-copy.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const creature = (text: string) => readAll(text, 'creature', ['Elf', 'Cleric']).abilities;

const REAL =
  "Whenever one or more other creatures you control enter, if they entered or were cast from a graveyard, create a token that's a copy of one of them. This ability triggers only once each turn.";

describe('the second ability of Twilight Diviner', () => {
  test('lowers to a batch enters trigger from a graveyard, a copy of one of them, once each turn', () => {
    expect(creature(REAL)).toMatchObject([
      {
        kind: 'triggered',
        trigger: {
          kind: 'entersBatch',
          what: { types: ['creature'], controller: 'you', other: true },
          fromGraveyard: true,
        },
        effect: { kind: 'copyOneOfTriggerCards' },
        oncePerTurn: true,
      },
    ]);
  });

  test('without the once-each-turn sentence (SYNTHETIC)', () => {
    const [only] = creature(
      "Whenever one or more other creatures you control enter, if they entered or were cast from a graveyard, create a token that's a copy of one of them.",
    );
    expect(only).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'entersBatch', fromGraveyard: true },
      effect: { kind: 'copyOneOfTriggerCards' },
    });
    expect(only).not.toHaveProperty('oncePerTurn');
  });

  test('without the graveyard condition the batch has no origin (SYNTHETIC)', () => {
    const [only] = creature(
      "Whenever one or more creatures you control enter, create a token that's a copy of one of them.",
    );
    expect(only).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'entersBatch', what: { types: ['creature'], controller: 'you' } },
      effect: { kind: 'copyOneOfTriggerCards' },
    });
  });

  test('"you may" is the offer of the ability itself (SYNTHETIC)', () => {
    expect(
      creature(
        "Whenever one or more other creatures you control enter, if they entered or were cast from a graveyard, you may create a token that's a copy of one of them.",
      ),
    ).toMatchObject([
      { kind: 'triggered', effect: { kind: 'copyOneOfTriggerCards' }, optional: true },
    ]);
  });

  test.each([
    // Another trigger has no group of permanents to choose from.
    "Whenever a creature you control enters, create a token that's a copy of one of them.",
    "Whenever you gain life, create a token that's a copy of one of them.",
    // The graveyard condition is part of a batch of enters only.
    'Whenever you gain life, if they entered or were cast from a graveyard, you draw a card.',
    'Whenever one or more other creatures you control enter, if they entered or were cast from a graveyard, create two tokens that are copies of one of them.',
    "Whenever one or more other creatures you control enter, if they entered or were cast from your graveyard, create a token that's a copy of one of them.",
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(dropped(text, 'creature', ['Elf', 'Cleric']).text).toBe(text);
  });
});
