// validateCard for the preventDamage effect (CR 615): the shapes the engine runs, and the malformed
// ones validateCardStructure rejects. Cards are SYNTHETIC and defined here.
import { describe, expect, test } from 'vitest';
import { isFeatureSupported, SUPPORTED_FEATURES } from '../src/ast/features';
import type { Effect, SpellText, TargetSpec } from '../src/ast/types';
import { validateCard, validateCardStructure } from '../src/ast/validate';
import type { CardDefinition } from '../src/cards/definition';
import { singleFace } from '../src/cards/fixtures/helpers';
import { SYNTHETIC_CARDS } from '../src/cards/fixtures/synthetic';

const T1 = { kind: 'target', id: 't1' } as const;
const END = 'untilEndOfTurn' as const;
const ANY: TargetSpec = { id: 't1', what: { kind: 'anyTarget' } };
const PLAYER: TargetSpec = { id: 't1', what: { kind: 'player', filter: 'any' } };
const CREATURE: TargetSpec = {
  id: 't1',
  what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
};

function instant(spell: SpellText): CardDefinition {
  return singleFace({
    name: 'SYNTHETIC Test Shield',
    manaCost: ['W'],
    types: ['instant'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'test',
    spell,
  });
}
const shield = (e: Partial<Extract<Effect, { kind: 'preventDamage' }>>, target?: TargetSpec) =>
  instant({
    ...(target === undefined ? {} : { targets: [target] }),
    effect: {
      kind: 'preventDamage',
      scope: 'all',
      amount: 'all',
      to: { kind: 'you' },
      duration: END,
      ...e,
    },
  });
const issues = (card: CardDefinition) =>
  validateCardStructure(card).map((i) => `${i.path}: ${i.message}`);
const full = (card: CardDefinition) => validateCard(card).map((i) => `${i.path}: ${i.message}`);

describe('preventDamage: shapes the engine runs', () => {
  test.each([
    ['Fog', shield({ scope: 'combat', to: { kind: 'any' } })],
    ['to you', shield({})],
    ['to each player', shield({ to: { kind: 'eachPlayer' } })],
    ['to each opponent', shield({ to: { kind: 'eachOpponent' } })],
    ['next 3 to any target', shield({ amount: 3, to: T1 }, ANY)],
    ['next 3 to a player target', shield({ amount: 3, to: T1 }, PLAYER)],
    ['to a creature target', shield({ scope: 'combat', to: T1 }, CREATURE)],
    ['by a creature target', shield({ scope: 'combat', to: { kind: 'any' }, by: T1 }, CREATURE)],
    [
      'to creatures you control',
      shield({ to: { kind: 'each', filter: { types: ['creature'], controller: 'you' } } }),
    ],
    [
      'next 1 to each creature you control',
      shield({
        amount: 1,
        to: { kind: 'each', filter: { types: ['creature'], controller: 'you' } },
      }),
    ],
    ['noncombat', shield({ scope: 'noncombat', to: { kind: 'any' } })],
  ])('%s validates and is supported', (_name, card) => {
    expect(issues(card)).toEqual([]);
    expect(full(card)).toEqual([]);
  });

  test('every SYNTHETIC prevention card validates', () => {
    const cards = Object.values(SYNTHETIC_CARDS).filter((c) =>
      c.faces.some(
        (f) => f.spell?.effect !== undefined && JSON.stringify(f.spell).includes('preventDamage'),
      ),
    );
    expect(cards.length).toBeGreaterThanOrEqual(8);
    for (const card of cards) expect(full(card), card.name).toEqual([]);
  });

  test('the feature is declared and known to the parser', () => {
    expect(SUPPORTED_FEATURES.effectKinds).toContain('preventDamage');
    expect(isFeatureSupported('effect:preventDamage')).toBe(true);
  });
});

describe('preventDamage: malformed nodes', () => {
  const bad = (card: CardDefinition, fragment: string) => {
    const found = issues(card);
    expect(
      found.some((m) => m.includes(fragment)),
      `${fragment} in ${found.join(' | ')}`,
    ).toBe(true);
  };

  test('unknown scope', () => {
    bad(shield({ scope: 'sometimes' as never }), 'unknown prevention scope');
  });
  test.each([0, -1, 2.5, Number.NaN, 'some' as never])('amount %s', (amount) => {
    bad(shield({ amount }), "amount must be 'all' or a positive integer");
  });
  test('a duration other than until end of turn', () => {
    bad(shield({ duration: 'permanent' as never }), 'untilEndOfTurn');
  });
  test('a target that is not declared', () => {
    bad(shield({ to: T1 }), 'is not declared');
  });
  test("a 'by' that is 'each'", () => {
    bad(
      shield({ to: { kind: 'any' }, by: { kind: 'each', filter: {} } as never }),
      "'by' names one source",
    );
  });
  test('a by target that is a player', () => {
    bad(shield({ to: { kind: 'any' }, by: T1 }, PLAYER), 'is a player but an object is required');
  });
  test('an each filter that looks outside the battlefield', () => {
    bad(
      shield({ to: { kind: 'each', filter: { zone: 'graveyard' } } }),
      'permanents on the battlefield',
    );
  });
  test('a recipient of an unknown kind', () => {
    bad(shield({ to: { kind: 'everything' } as never }), 'unknown object reference');
  });
});
