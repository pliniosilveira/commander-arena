// The monarch wordings of the Riders of Rohan deck (group A) through the whole pipeline: what they lower to, the near misses the grammar must drop (never half read), and the engine
// features the lowering needs (a card whose feature is missing is dropped, not guessed). The engine runs the same nodes in convert-grammar-engine-riders-monarch*.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { read, readAll, withoutFeature } from './parser-p5-helpers';

describe('"target player becomes the monarch" (CR 725.1)', () => {
  test('a target player or opponent is read; "you" still is', () => {
    for (const text of [
      'When ~ enters, target player becomes the monarch.',
      'When ~ enters, target opponent becomes the monarch.',
      'When ~ enters, you become the monarch.',
    ]) {
      const [a] = readAll(text, 'creature').abilities;
      expect(a?.kind === 'triggered' && a.effect.kind).toBe('becomeMonarch');
    }
  });

  test.each([
    'When ~ enters, each opponent becomes the monarch.',
    'When ~ enters, any number of target players become the monarch.',
    'When ~ enters, target player become the monarch.',
  ])('another subject is dropped (SYNTHETIC): %s', (text) => {
    expect(read(text, 'creature').unparsed.length).toBeGreaterThan(0);
  });
});

describe('"if there is no monarch"', () => {
  const TEXT = 'When ~ enters, if there is no monarch, you become the monarch.';
  test('is the negation of "a player is the monarch"', () => {
    const [a] = readAll(TEXT, 'creature').abilities;
    expect(a?.kind === 'triggered' && a.interveningIf).toEqual({
      kind: 'not',
      term: {
        kind: 'playerHasDesignation',
        player: { kind: 'eachPlayer' },
        designation: 'monarch',
      },
    });
  });
  test.each(["When ~ enters, if there's no monarch, you become the monarch."])(
    'another wording is dropped (SYNTHETIC): %s',
    (text) => expect(read(text, 'creature').unparsed.length).toBeGreaterThan(0),
  );
});

describe("the monarch's end step", () => {
  const TEXT = "At the beginning of the monarch's end step, that player draws a card.";
  test('is the engine step trigger of the monarch, and "that player" is its player', () => {
    const [a] = readAll(TEXT, 'creature').abilities;
    expect(a?.kind === 'triggered' && a.trigger).toEqual({
      kind: 'step',
      step: 'endStep',
      whose: 'monarch',
    });
  });
  test('without trigger:stepMonarch in the engine the ability is not read', () => {
    expect(withoutFeature('trigger:stepMonarch', TEXT, 'creature').reason).toBeDefined();
  });
  test("the monarch's upkeep is dropped (SYNTHETIC)", () => {
    expect(
      read("At the beginning of the monarch's upkeep, that player draws a card.", 'creature')
        .unparsed.length,
    ).toBeGreaterThan(0);
  });
});

describe('"whenever one or more creatures you control deal combat damage to one or more players this turn"', () => {
  const TEXT =
    'Whenever one or more creatures you control deal combat damage to one or more players this turn, you become the monarch.';
  test('a spell sentence is a delayed ability of the turn', () => {
    readAll(TEXT, 'sorcery');
  });
  test('without effect:delayedCombatDamageBatchTurn in the engine it is not read', () => {
    expect(
      withoutFeature('effect:delayedCombatDamageBatchTurn', TEXT, 'sorcery').reason,
    ).toBeDefined();
  });
  test.each([
    TEXT.replace('this turn', 'this combat'),
    TEXT.replace('one or more players', 'a player'),
    TEXT.replace('you become the monarch', 'you may become the monarch'),
  ])('another wording is dropped (SYNTHETIC): %s', (text) => {
    expect(read(text, 'sorcery').unparsed.length).toBeGreaterThan(0);
  });
});

describe('"that opponent may pay {X}, where X is the number of cards in their hand"', () => {
  const TEXT =
    "At the beginning of combat on each opponent's turn, if you're the monarch, that opponent may pay {X}, where X is the number of cards in their hand. If they don't, they can't attack you this combat.";
  test('is read as one instruction', () => {
    readAll(TEXT, 'creature');
  });
  test('without the engine features it is not read', () => {
    expect(withoutFeature('effect:creaturesCantAttackYou', TEXT, 'creature').reason).toBeDefined();
  });
  test.each([TEXT.replace('this combat', 'this turn'), TEXT.replace('{X}', '{2}')])(
    'another wording is dropped (SYNTHETIC): %s',
    (text) => expect(read(text, 'creature').unparsed.length).toBeGreaterThan(0),
  );
});
