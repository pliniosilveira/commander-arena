// validateCard for restrictions and the evasion keywords (D-094): the shapes the engine runs and the
// malformed or unsupported ones validateCard rejects. Cards are SYNTHETIC and defined here.
import { describe, expect, test } from 'vitest';
import { GRANTABLE_KEYWORDS, isFeatureSupported, SUPPORTED_FEATURES } from '../src/ast/features';
import type { Ability, Effect, Restriction, StaticSubject } from '../src/ast/types';
import { validateCard, validateCardStructure } from '../src/ast/validate';
import type { CardDefinition } from '../src/cards/definition';
import { singleFace } from '../src/cards/fixtures/helpers';
import { SYNTHETIC_RESTRICTION_LIST } from '../src/cards/fixtures/synthetic-restrictions';

const T1 = { kind: 'target', id: 't1' } as const;
const CREATURE_TARGET = {
  id: 't1',
  what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
} as const;

const creature = (abilities: readonly Ability[]): CardDefinition =>
  singleFace({
    name: 'SYNTHETIC Test Bear',
    manaCost: ['1', 'G'],
    types: ['creature'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 2,
    toughness: 2,
    oracleText: 'test',
    abilities,
  });
const restriction = (subject: StaticSubject, r: Restriction): Ability => ({
  kind: 'static',
  static: { kind: 'restriction', subject, restriction: r },
});
const restrictSpell = (e: Partial<Extract<Effect, { kind: 'restrict' }>>): CardDefinition =>
  singleFace({
    name: 'SYNTHETIC Test Spell',
    manaCost: ['U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'test',
    spell: {
      targets: [CREATURE_TARGET],
      effect: {
        kind: 'restrict',
        objects: T1,
        restriction: 'cantBeBlocked',
        duration: 'untilEndOfTurn',
        ...e,
      },
    },
  });
const issues = (card: CardDefinition) =>
  validateCardStructure(card).map((i) => `${i.path}: ${i.message}`);
const full = (card: CardDefinition) => validateCard(card).map((i) => `${i.path}: ${i.message}`);

describe('the restriction cards of the fixtures validate and are supported', () => {
  test('every SYNTHETIC restriction card passes validateCard', () => {
    expect(SYNTHETIC_RESTRICTION_LIST.length).toBeGreaterThan(20);
    for (const card of SYNTHETIC_RESTRICTION_LIST) expect(full(card), card.name).toEqual([]);
  });

  test('the engine lists what it runs', () => {
    for (const ref of [
      'effect:restrict',
      'static:restriction',
      'staticSubject:this',
      'keyword:landwalk',
      'keyword:fear',
      'keyword:intimidate',
      'keyword:shadow',
    ] as const) {
      expect(isFeatureSupported(ref), ref).toBe(true);
    }
    expect(SUPPORTED_FEATURES.keywordKinds).toEqual(
      expect.arrayContaining(['landwalk', 'fear', 'intimidate', 'shadow']),
    );
  });
});

describe('static restrictions', () => {
  test.each(['cantBlock', 'cantBeBlocked', 'attacksEachCombat', 'doesntUntap'] as const)(
    '%s on "this", an attached subject or a filter is accepted',
    (r) => {
      expect(full(creature([restriction({ kind: 'this' }, r)]))).toEqual([]);
      expect(
        full(
          creature([
            restriction({ kind: 'filter', filter: { types: ['creature'] }, other: true }, r),
          ]),
        ),
      ).toEqual([]);
    },
  );

  test('cantBeCountered belongs to the spell itself: only the "this" subject', () => {
    expect(full(creature([restriction({ kind: 'this' }, 'cantBeCountered')]))).toEqual([]);
    expect(
      issues(
        creature([
          restriction({ kind: 'filter', filter: { types: ['creature'] } }, 'cantBeCountered'),
        ]),
      ),
    ).toEqual([expect.stringContaining('its subject is "this"')]);
  });

  test('an unknown restriction is refused', () => {
    expect(issues(creature([restriction({ kind: 'this' }, 'cantTrample' as Restriction)]))).toEqual(
      [expect.stringContaining('unknown restriction')],
    );
  });

  test('an "attached" subject needs an Aura or Equipment, like the other statics', () => {
    expect(issues(creature([restriction({ kind: 'attached' }, 'cantBeBlocked')]))).toEqual([
      expect.stringContaining('needs an Aura or an Equipment'),
    ]);
  });
});

describe('the restrict effect', () => {
  test.each(['cantBlock', 'cantBeBlocked', 'attacksEachCombat'] as const)(
    '%s until end of turn is accepted',
    (r) => {
      expect(full(restrictSpell({ restriction: r }))).toEqual([]);
    },
  );

  test.each(['doesntUntap', 'cantBeCountered'] as const)(
    '%s as an effect is refused (it needs another duration or belongs to a spell)',
    (r) => {
      expect(issues(restrictSpell({ restriction: r }))).toEqual([
        expect.stringContaining('an effect can give only'),
      ]);
    },
  );

  test('a duration the engine does not run is reported as unsupported, not run', () => {
    const card = restrictSpell({ duration: 'permanent' });
    expect(issues(card)).toEqual([]);
    expect(full(card)).toEqual([
      expect.stringContaining('duration "permanent" is not implemented'),
    ]);
  });
});

describe('landwalk, fear, intimidate and shadow', () => {
  const kw = (k: Ability) => creature([k]);
  test('well-formed keywords are accepted', () => {
    for (const k of [
      { kind: 'landwalk', landType: 'Island' },
      { kind: 'landwalk', landType: 'nonbasic' },
      { kind: 'fear' },
      { kind: 'intimidate' },
      { kind: 'shadow' },
    ] as const) {
      expect(full(kw({ kind: 'keyword', keyword: k })), JSON.stringify(k)).toEqual([]);
    }
  });

  test('landwalk needs a land type', () => {
    expect(issues(kw({ kind: 'keyword', keyword: { kind: 'landwalk', landType: '' } }))).toEqual([
      expect.stringContaining('landwalk needs a land type'),
    ]);
    expect(
      issues(kw({ kind: 'keyword', keyword: { kind: 'landwalk', landType: 'island' } })),
    ).toEqual([expect.stringContaining('is not a land type')]);
  });

  test('fear, intimidate and shadow can be granted, and landwalk since D-473', () => {
    expect(GRANTABLE_KEYWORDS).toEqual(
      expect.arrayContaining(['fear', 'intimidate', 'shadow', 'landwalk']),
    );
  });
});
