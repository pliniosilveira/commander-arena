// The validator of the Ring shapes (D-196): `ringTempts`, the trigger `ringTempted`, the condition `controlsRingBearer`, the duration `forAsLongAsYouControlThis` of
// `restrict`, `sacrifice.byController` and the engine's own `delayedSacrifice`.
import { describe, expect, test } from 'vitest';
import type { Ability } from '../src/ast/types';
import { isFeatureSupported, syntheticCard, validateCard } from '../src/index';

const RITE = 'SYNTHETIC Ring Rite';
const WATCHER = 'SYNTHETIC Ring Watcher';
const SAGA = 'SYNTHETIC There and Back Again';
const BOLT = 'SYNTHETIC Muzzle';

const withSpell = (name: string, effect: unknown) => {
  const card = syntheticCard(name);
  const face = card.faces[0];
  if (face === undefined || face.spell === null) throw new Error('no spell');
  return { ...card, faces: [{ ...face, spell: { ...face.spell, effect } }] } as never;
};
const withAbility = (name: string, ability: Ability) => {
  const card = syntheticCard(name);
  const face = card.faces[0];
  if (face === undefined) throw new Error('no face');
  return { ...card, faces: [{ ...face, abilities: [ability] }] } as never;
};
const messages = (card: never) =>
  validateCard(card)
    .map((i) => i.message)
    .join('\n');

describe('the Ring effect, trigger and condition', () => {
  test('are valid and listed as supported', () => {
    expect(validateCard(syntheticCard(RITE))).toEqual([]);
    expect(validateCard(syntheticCard(WATCHER))).toEqual([]);
    expect(isFeatureSupported('effect:ringTempts')).toBe(true);
    expect(isFeatureSupported('trigger:ringTempted')).toBe(true);
    expect(isFeatureSupported('condition:controlsRingBearer')).toBe(true);
    expect(isFeatureSupported('duration:forAsLongAsYouControlThis')).toBe(true);
  });

  test('the condition works in an intervening "if" and in a conditional effect', () => {
    const ability: Ability = {
      kind: 'triggered',
      trigger: { kind: 'attacks', what: { kind: 'this' } },
      interveningIf: { kind: 'controlsRingBearer' },
      effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
    };
    expect(validateCard(withAbility('SYNTHETIC Ring Watcher', ability))).toEqual([]);
  });
});

describe('"for as long as you control this" with restrict', () => {
  const restrict = {
    kind: 'restrict',
    objects: { kind: 'target', id: 't1' },
    restriction: 'cantBlock',
    duration: 'forAsLongAsYouControlThis',
  };

  test('the Saga, an ability of a permanent, is valid', () => {
    expect(validateCard(syntheticCard(SAGA))).toEqual([]);
  });

  test('a spell has no permanent to control: refused', () => {
    expect(messages(withSpell(BOLT, restrict))).toMatch(/ability of a permanent/);
  });

  test('another duration is still refused', () => {
    expect(messages(withSpell(BOLT, { ...restrict, duration: 'forever' }))).toMatch(
      /unknown duration/,
    );
  });
});

describe('sacrifice with byController', () => {
  const sacrifice = (extra: Record<string, unknown>, objects: unknown = { kind: 'this' }) => ({
    kind: 'sacrifice',
    objects,
    ...extra,
  });

  test('a named permanent, sacrificed by whoever controls it, is valid', () => {
    const ability: Ability = {
      kind: 'triggered',
      trigger: { kind: 'attacks', what: { kind: 'this' } },
      effect: sacrifice({ byController: true }),
    } as never;
    expect(validateCard(withAbility(WATCHER, ability))).toEqual([]);
  });

  test('not with a choose selector or with a player', () => {
    const choose = sacrifice(
      { byController: true },
      { kind: 'choose', filter: { types: ['creature'], controller: 'you' } },
    );
    expect(messages(withSpell(BOLT, choose))).toMatch(/byController/);
    const withPlayer = sacrifice({ byController: true, player: { kind: 'eachOpponent' } });
    expect(messages(withSpell(BOLT, withPlayer))).toMatch(/byController/);
  });

  test('true when present', () => {
    expect(messages(withSpell(BOLT, sacrifice({ byController: false })))).toMatch(
      /true when present/,
    );
  });
});

describe('the engine-only delayed sacrifice', () => {
  test('a card may not write it: it is the third ability of the Ring', () => {
    expect(messages(withSpell(BOLT, { kind: 'delayedSacrifice' }))).toMatch(/Ring/);
  });
});
