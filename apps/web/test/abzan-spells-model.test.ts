// The two choices of the Abzan Armor spells (group C) without a DOM: "chooses any number of creatures they control with total power 4 or less, then sacrifices all other creatures"
// (Slaughter the Strong, CR 608.2d, 701.21a) and "any number of target creature cards with total power 10 or less" (Reunion of the House, CR 115.1, 208.1).
import type { ChosenTarget, ObjectId, TargetChoiceSpec } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { permanentsDetail, permanentsHint, permanentsReady } from '../src/ui/decisions/permanents';
import { targetsWord } from '../src/ui/decisions/target-prompt';
import { targetsReady } from '../src/ui/decisions/targeting';

const o = (n: number): ObjectId => `o${n}`;

describe('the keep choice of Slaughter the Strong', () => {
  const keep = {
    purpose: 'keep' as const,
    min: 0,
    max: 3,
    maxTotalPower: 4,
    powers: { o1: 4, o2: 2, o3: 1 },
  };

  test('Confirm is ready for any set within the limit, nothing included, and not above it', () => {
    expect(permanentsReady([], keep)).toBe(true);
    expect(permanentsReady([o(2), o(3)], keep)).toBe(true);
    expect(permanentsReady([o(1)], keep)).toBe(true);
    expect(permanentsReady([o(1), o(3)], keep)).toBe(false);
    expect(permanentsHint([o(1), o(3)], keep)).toBe('Keep creatures with total power 4 or less');
  });

  test('the detail line says what is kept and that the others are sacrificed', () => {
    expect(permanentsDetail([o(2), o(3)], keep)).toBe(
      'Keeping 2 creatures, total power 3 of at most 4. The others are sacrificed.',
    );
  });
});

describe('the targets of Reunion of the House', () => {
  const spec: TargetChoiceSpec = {
    specId: 't1',
    min: 0,
    max: 3,
    totalPowerAtMost: 10,
    legal: [
      { kind: 'object', id: o(1), specId: 't1', power: 4 },
      { kind: 'object', id: o(2), specId: 't1', power: 4 },
      { kind: 'object', id: o(3), specId: 't1', power: 3 },
    ],
  };
  const pick = (...ids: ObjectId[]): ChosenTarget[] =>
    ids.map((id) => ({ kind: 'object', id, specId: 't1' }));

  test('the choice is ready while the powers add up to at most the limit, and not above it', () => {
    expect(targetsReady([spec], pick())).toBe(true);
    expect(targetsReady([spec], pick(o(1), o(2)))).toBe(true);
    expect(targetsReady([spec], pick(o(1), o(2), o(3)))).toBe(false);
  });

  test('the slot says what it asks for', () => {
    expect(targetsWord(spec)).toBe('any number of targets with total power 10 or less');
  });
});
