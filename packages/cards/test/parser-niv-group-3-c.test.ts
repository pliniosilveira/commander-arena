// The Niv-Mizzet deck (issue 25), group 3-c (D-350 to D-354): "When ~ enters, you may cast target instant or sorcery card from a graveyard, and mana of any type can
// be spent to cast that spell. If that spell would be put into a graveyard, exile it instead." (Quistis Trepe; "Blue Magic —" before it is an ability word). The
// first line is the real Oracle text of the acceptance card of the golden corpus read through the whole pipeline; the other lines are SYNTHETIC siblings and the near
// misses the grammar must not read. The engine runs what is lowered in convert-grammar-engine-niv-group-3-c.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { DECLARED_NEEDS } from '../src/convert/parser/index';
import { BLOCKED } from './blocked-features';
import { read, readAll, withoutFeature } from './parser-p5-helpers';

const GRAVEYARD_CARD = {
  id: 't1',
  what: {
    kind: 'object',
    filter: { zone: 'graveyard', anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }] },
  },
};
const T1 = { kind: 'target', id: 't1' };
const REAL =
  'When this creature enters, you may cast target instant or sorcery card from a graveyard, and mana of any type can be spent to cast that spell. If that spell would be put into a graveyard, exile it instead.';
const ENTERS = { kind: 'entersBattlefield', what: { kind: 'this' } };

describe('"When ~ enters, you may cast target instant or sorcery card from a graveyard, and mana of any type can be spent to cast that spell. If that spell would be put into a graveyard, exile it instead." (CR 608.2g, 609.4b, 614.1a)', () => {
  test('the real text: a trigger with a target card of any graveyard, one question (the engine effect asks it), and both riders', () => {
    const parsed = readAll(REAL, 'creature', ['Wizard']);
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: ENTERS,
        targets: [GRAVEYARD_CARD],
        effect: { kind: 'castCard', object: T1, anyManaType: true, exileInstead: true },
      },
    ]);
  });

  test('each rider alone, and neither (SYNTHETIC)', () => {
    const any = readAll(
      'When this creature enters, you may cast target instant or sorcery card from a graveyard, and mana of any type can be spent to cast that spell.',
      'creature',
      ['Wizard'],
    );
    expect(any.abilities[0]).toMatchObject({
      effect: { kind: 'castCard', object: T1, anyManaType: true },
    });
    expect(JSON.stringify(any.abilities[0])).not.toContain('exileInstead');
    const exile = readAll(
      'When this creature enters, you may cast target instant or sorcery card from a graveyard. If that spell would be put into a graveyard, exile it instead.',
      'creature',
      ['Wizard'],
    );
    expect(exile.abilities[0]).toMatchObject({
      effect: { kind: 'castCard', object: T1, exileInstead: true },
    });
    expect(JSON.stringify(exile.abilities[0])).not.toContain('anyManaType');
    const plain = readAll(
      'When this creature enters, you may cast target instant or sorcery card from a graveyard.',
      'creature',
      ['Wizard'],
    );
    expect(plain.abilities[0]).toMatchObject({ effect: { kind: 'castCard', object: T1 } });
    expect(JSON.stringify(plain.abilities[0])).not.toContain('Instead');
    expect(JSON.stringify(plain.abilities[0])).not.toContain('anyManaType');
  });

  test('another card type and the attack trigger (SYNTHETIC)', () => {
    const parsed = readAll(
      'Whenever this creature attacks, you may cast target sorcery card from a graveyard.',
      'creature',
      ['Wizard'],
    );
    expect(parsed.abilities[0]).toMatchObject({
      kind: 'triggered',
      targets: [{ what: { filter: { zone: 'graveyard', types: ['sorcery'] } } }],
      effect: { kind: 'castCard' },
    });
  });

  test('an activated ability: "you may" is part of the effect (SYNTHETIC)', () => {
    const parsed = readAll(
      '{T}: You may cast target instant or sorcery card from a graveyard, and mana of any type can be spent to cast that spell.',
      'creature',
      ['Wizard'],
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }],
        targets: [GRAVEYARD_CARD],
        effect: { kind: 'castCard', object: T1, anyManaType: true },
      },
    ]);
  });

  test.each([
    // not the player's choice: the engine's cast is optional
    'When this creature enters, cast target instant or sorcery card from a graveyard.',
    'When this creature enters, cast target instant or sorcery card from a graveyard, and mana of any type can be spent to cast that spell.',
    // whose graveyard, how many cards, which riders
    'When this creature enters, you may cast target instant or sorcery card from your graveyard.',
    "When this creature enters, you may cast target instant or sorcery card from an opponent's graveyard.",
    'When this creature enters, you may cast up to one target instant or sorcery card from a graveyard.',
    'When this creature enters, you may cast two target instant or sorcery cards from a graveyard.',
    'When this creature enters, you may cast target instant or sorcery card from a graveyard, and mana of any color can be spent to cast that spell.',
    'When this creature enters, you may cast target instant or sorcery card from a graveyard, and mana of any type can be spent to cast it.',
    'When this creature enters, you may cast target instant or sorcery card from a graveyard. If that spell would be put into a graveyard, return it to your hand instead.',
    // another way of casting, another thing done with it
    'When this creature enters, you may cast target instant or sorcery card from a graveyard without paying its mana cost.',
    'When this creature enters, you may cast target instant or sorcery card from a graveyard this turn.',
    'When this creature enters, you may cast target instant or sorcery card from a graveyard and draw a card.',
    // not a card
    'When this creature enters, you may cast target instant or sorcery spell.',
    'When this creature enters, you may cast target creature from a graveyard.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    const parsed = read(text, 'creature', ['Wizard']);
    expect(parsed.abilities).toEqual([]);
    expect(parsed.unparsed).toHaveLength(1);
  });
});

describe('a line whose engine feature is not listed names it (D-068)', () => {
  const CASES = [
    ['effect:castCard', REAL, 'creature'],
    ['selector:target', REAL, 'creature'],
  ] as const;

  test.each(CASES)('without %s', (ref, text, type) => {
    const missing = withoutFeature(ref, text, type, ['Wizard']);
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain(ref);
  });

  test('a blocked line leaves the face with no ability (never half-executed)', () => {
    for (const [ref, text, type] of CASES) {
      BLOCKED.clear();
      BLOCKED.add(ref);
      try {
        const parsed = read(text, type, ['Wizard']);
        expect(parsed.abilities, `${ref}: ${text}`).toEqual([]);
      } finally {
        BLOCKED.clear();
      }
    }
  });

  test('every feature the lowering of this slice names is declared', () => {
    for (const ref of ['effect:castCard', 'selector:target'] as const) {
      expect(DECLARED_NEEDS, ref).toContain(ref);
    }
  });
});
