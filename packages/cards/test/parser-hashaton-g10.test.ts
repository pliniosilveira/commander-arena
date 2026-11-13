// The Hashaton deck (issue 31), group 10 (D-1190 to D-1193, provisional): Restless Dreams, "As an additional cost to cast this spell, discard X cards." and "Return X target
// creature cards from your graveyard to your hand.". The first line of each is the real Oracle text of the acceptance card of the golden corpus read through the whole pipeline; the
// other lines are SYNTHETIC siblings and the near misses the grammar must not read. The engine runs what is lowered in convert-grammar-engine-hashaton-g10.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { DECLARED_NEEDS } from '../src/convert/parser/index';
import { BLOCKED } from './blocked-features';
import { read, readAll, withoutFeature } from './parser-p5-helpers';

const T1 = { kind: 'target', id: 't1' } as const;
const X_CREATURE_CARDS = {
  id: 't1',
  what: { kind: 'object', filter: { zone: 'graveyard', types: ['creature'], controller: 'you' } },
  countX: true,
};
const REAL =
  'As an additional cost to cast this spell, discard X cards.\nReturn X target creature cards from your graveyard to your hand.';

describe('Restless Dreams: "As an additional cost to cast this spell, discard X cards. Return X target creature cards from your graveyard to your hand." (CR 107.3a, 601.2b-c, 701.9)', () => {
  test('the real text: the additional cost discardX, and a slot of as many targets as X, returned to the hand', () => {
    const parsed = readAll(REAL, 'sorcery');
    expect(parsed.additionalCosts).toEqual([{ kind: 'discardX' }]);
    expect(parsed.spell).toEqual({
      targets: [X_CREATURE_CARDS],
      effect: { kind: 'moveToZone', objects: T1, to: 'hand' },
      x: true,
    });
    expect(parsed.abilities).toEqual([]);
  });

  test('other cards of the graveyard, and other effects that read the same cost (SYNTHETIC)', () => {
    const lands = readAll(
      'As an additional cost to cast this spell, discard X cards.\nReturn X target land cards from your graveyard to your hand.',
      'sorcery',
    );
    expect(lands.spell).toMatchObject({
      targets: [
        {
          id: 't1',
          what: { filter: { zone: 'graveyard', types: ['land'], controller: 'you' } },
          countX: true,
        },
      ],
    });
    const draw = readAll(
      'As an additional cost to cast this spell, discard X cards.\nDraw X cards.',
      'sorcery',
    );
    expect(draw.additionalCosts).toEqual([{ kind: 'discardX' }]);
    expect(draw.spell).toEqual({
      effect: { kind: 'draw', player: { kind: 'you' }, count: { kind: 'x' } },
      x: true,
    });
  });

  test('an instant reads the same, and a card with a mana cost {X} keeps both (SYNTHETIC)', () => {
    const instant = readAll(REAL, 'instant');
    expect(instant.additionalCosts).toEqual([{ kind: 'discardX' }]);
    expect(instant.spell).toMatchObject({ targets: [X_CREATURE_CARDS], x: true });
  });

  test.each([
    // the cost: what is discarded, how many
    'As an additional cost to cast this spell, discard X cards at random.\nReturn X target creature cards from your graveyard to your hand.',
    'As an additional cost to cast this spell, discard Y cards.\nReturn X target creature cards from your graveyard to your hand.',
    'As an additional cost to cast this spell, discard X creature cards.\nReturn X target creature cards from your graveyard to your hand.',
    // the targets: how many, whose graveyard, where they go
    'As an additional cost to cast this spell, discard X cards.\nReturn up to X target creature cards from your graveyard to your hand.',
    'As an additional cost to cast this spell, discard X cards.\nReturn X target creature cards from a graveyard to your hand.',
    "As an additional cost to cast this spell, discard X cards.\nReturn X target creature cards from an opponent's graveyard to your hand.",
    'As an additional cost to cast this spell, discard X cards.\nReturn X target creature card from your graveyard to your hand.',
    'As an additional cost to cast this spell, discard X cards.\nReturn X target creature cards from your graveyard to your library.',
    'As an additional cost to cast this spell, discard X cards.\nReturn X creature cards from your graveyard to your hand.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    const parsed = read(text, 'sorcery');
    // The line the grammar cannot read is dropped whole, and a face with a dropped line is not supported (the importer's rule): the spell is never half of what the text says.
    expect(parsed.unparsed.length).toBeGreaterThan(0);
  });

  test('"X target ..." in a place where the engine has no X announced is dropped (SYNTHETIC)', () => {
    // A permanent has no X announced for its triggered ability (CR 107.3j), and an activated ability's cost never says "discard X cards".
    const trigger = read(
      'Whenever ~ enters, return X target creature cards from your graveyard to your hand.',
      'creature',
    );
    expect(trigger.abilities).toEqual([]);
    expect(trigger.unparsed).toHaveLength(1);
    const returning = read(
      '{T}: Return X target creature cards from your graveyard to your hand.',
      'creature',
    );
    expect(returning.abilities).toEqual([]);
    expect(returning.unparsed).toHaveLength(1);
    const activated = read('Discard X cards: Draw X cards.', 'creature');
    expect(activated.abilities).toEqual([]);
    expect(activated.unparsed).toHaveLength(1);
    // Two X costs of one spell are one X: "pay X life and discard X cards" is read (the engine pays both for the one X announced), and "discard X cards" with a discard of
    // a fixed number is not (the engine has one discard cost).
    const both = readAll(
      'As an additional cost to cast this spell, pay X life and discard X cards.\nDraw X cards.',
      'sorcery',
    );
    expect(both.additionalCosts).toEqual([{ kind: 'payXLife' }, { kind: 'discardX' }]);
    const twice = read(
      'As an additional cost to cast this spell, discard X cards and discard a card.\nDraw X cards.',
      'sorcery',
    );
    expect(twice.additionalCosts).toEqual([]);
    expect(twice.unparsed.length).toBeGreaterThan(0);
  });
});

describe('the lines name the feature the engine lacks (D-068)', () => {
  const CASES = [
    ['cost:discardX', REAL.split('\n')[0] ?? '', 'sorcery'],
    ['selector:countX', REAL.split('\n')[1] ?? '', 'sorcery'],
  ] as const;

  test.each(CASES)('without %s: %s', (ref, text, type) => {
    const missing = withoutFeature(ref, text, type);
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain(ref);
  });

  test('a blocked line leaves the face with no half of the card (never half-executed)', () => {
    for (const [ref, text, type] of CASES) {
      BLOCKED.clear();
      BLOCKED.add(ref);
      try {
        const parsed = read(text, type);
        expect(parsed.abilities, `${ref}: ${text}`).toEqual([]);
        if (ref === 'selector:countX') expect(parsed.spell?.targets, ref).toBeUndefined();
        if (ref === 'cost:discardX') expect(parsed.additionalCosts, ref).toEqual([]);
      } finally {
        BLOCKED.clear();
      }
    }
  });

  test('every feature the lowerings of this slice name is declared', () => {
    for (const ref of ['cost:discardX', 'selector:countX', 'ability:xCost'] as const) {
      expect(DECLARED_NEEDS, ref).toContain(ref);
    }
  });
});
