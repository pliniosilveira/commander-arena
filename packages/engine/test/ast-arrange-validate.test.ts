// Validation of the `scry`, `surveil`, `lookAndReorder` and `putFromHandOnTop` effects (D-091).
// CR 701.22 (Scry), CR 701.25 (Surveil). Only the controller of the effect looks at their library
// (another player's scry would ask a second seat, which is not built: docs/ROADMAP.md).
import { describe, expect, test } from 'vitest';
import {
  type CardDefinition,
  type Effect,
  SUPPORTED_FEATURES,
  syntheticCard,
  validateCard,
  validateCardStructure,
} from '../src/index';
import { singleFaceCard } from './dsl-helpers';

function instantWith(effect: Effect, x = false): CardDefinition {
  return singleFaceCard({
    name: 'SYNTHETIC Validation Probe',
    manaCost: x ? ['X'] : ['1'],
    types: ['instant'],
    colors: [],
    colorIdentity: [],
    oracleText: '',
    spell: { effect, ...(x ? { x: true } : {}) },
  });
}

const messages = (effect: Effect, x = false) =>
  validateCard(instantWith(effect, x)).map((i) => `${i.path}: ${i.message}`);

describe('the effect kinds are supported', () => {
  test('they are in SUPPORTED_FEATURES', () => {
    for (const kind of ['scry', 'surveil', 'lookAndReorder', 'putFromHandOnTop']) {
      expect(SUPPORTED_FEATURES.effectKinds).toContain(kind);
    }
  });

  test('every library-arranging fixture is valid and executable', () => {
    for (const name of [
      'SYNTHETIC Scry Two',
      'SYNTHETIC Scry One You',
      'SYNTHETIC Scry Zero',
      'SYNTHETIC Surveil Two',
      'SYNTHETIC Reorder Three',
      'SYNTHETIC Brainstorm Like',
      'SYNTHETIC Put Back One',
      'SYNTHETIC Seer Of The Door',
      'SYNTHETIC Grave Watcher',
    ]) {
      expect(validateCard(syntheticCard(name)), name).toEqual([]);
    }
  });
});

describe('scry and surveil', () => {
  test('a count, with or without "you"', () => {
    for (const kind of ['scry', 'surveil'] as const) {
      expect(messages({ kind, count: 2 })).toEqual([]);
      expect(messages({ kind, player: { kind: 'you' }, count: 1 })).toEqual([]);
      expect(messages({ kind, count: 0 })).toEqual([]);
    }
  });

  test('X is allowed only where the spell has an X', () => {
    expect(messages({ kind: 'scry', count: { kind: 'x' } }, true)).toEqual([]);
    expect(messages({ kind: 'surveil', count: { kind: 'x' } })).not.toEqual([]);
    expect(messages({ kind: 'surveil', count: { kind: 'x' } }).join()).toContain('X is used');
  });

  test('a negative or fractional count is refused', () => {
    for (const kind of ['scry', 'surveil'] as const) {
      expect(messages({ kind, count: -1 })).not.toEqual([]);
      expect(messages({ kind, count: 1.5 })).not.toEqual([]);
    }
  });

  test("another player's scry or surveil is refused, as the engine only asks the controller", () => {
    for (const kind of ['scry', 'surveil'] as const) {
      for (const player of [{ kind: 'eachOpponent' }, { kind: 'eachPlayer' }] as const) {
        const found = messages({ kind, player, count: 1 });
        expect(found.join('\n'), `${kind} ${player.kind}`).toContain(
          `only the controller of the effect can ${kind}`,
        );
      }
    }
  });
});

describe('lookAndReorder and putFromHandOnTop', () => {
  test('a count', () => {
    expect(messages({ kind: 'lookAndReorder', count: 3 })).toEqual([]);
    expect(messages({ kind: 'putFromHandOnTop', count: 2 })).toEqual([]);
    expect(messages({ kind: 'putFromHandOnTop', count: { kind: 'x' } }, true)).toEqual([]);
  });

  test('a bad count is refused', () => {
    expect(messages({ kind: 'lookAndReorder', count: -2 })).not.toEqual([]);
    expect(messages({ kind: 'putFromHandOnTop', count: 0.5 })).not.toEqual([]);
    expect(
      validateCardStructure(instantWith({ kind: 'lookAndReorder', count: -2 })).length,
    ).toBeGreaterThan(0);
  });
});
