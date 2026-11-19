import type { ChosenTarget, TargetChoiceSpec } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { clickableTargets, toggleTarget } from '../src/ui/decisions/targeting';

const obj = (id: string, specId = 't'): ChosenTarget =>
  ({ kind: 'object', id, specId }) as ChosenTarget;
const spec = (over: Partial<TargetChoiceSpec> = {}): TargetChoiceSpec =>
  ({
    specId: 't',
    min: 1,
    max: 1,
    legal: [obj('a'), obj('b'), obj('c')],
    ...over,
  }) as TargetChoiceSpec;

// A copy of a spell starts with its current target chosen (CR 707.10c, 115.7): "1 of 1 chosen". The player
// must be able to click another legal target to change it, on the board and in the chips, without first
// taking the chosen one back.
test('a full single-target slot: a click on another legal target replaces the chosen one', () => {
  const specs = [spec()];
  expect(toggleTarget(specs, [obj('a')], obj('b'))).toEqual([obj('b')]);
});

test('a click on the chosen target still takes it back', () => {
  expect(toggleTarget([spec()], [obj('a')], obj('a'))).toEqual([]);
});

test('the legal targets of a full single-target slot stay clickable', () => {
  const { objects } = clickableTargets([spec()], [obj('a')]);
  expect([...objects].sort()).toEqual(['a', 'b', 'c']);
});

test('a slot of several targets stays full: a click on a new target adds nothing', () => {
  const specs = [spec({ max: 2 })];
  const full = [obj('a'), obj('b')];
  expect(toggleTarget(specs, full, obj('c'))).toEqual(full);
  expect([...clickableTargets(specs, full).objects].sort()).toEqual(['a', 'b']);
});

test('a slot that divides damage is not swapped: its shares would be lost', () => {
  const specs = [spec({ divide: 3 })];
  expect(toggleTarget(specs, [obj('a')], obj('b'))).toEqual([obj('a')]);
});

test('with two single-target slots the swap stays inside the slot the click is for', () => {
  const s1 = spec({ specId: 's1', legal: [obj('a', 's1'), obj('b', 's1')] });
  const s2 = spec({ specId: 's2', legal: [obj('c', 's2'), obj('d', 's2')] });
  const picks = [obj('a', 's1'), obj('c', 's2')];
  expect(toggleTarget([s1, s2], picks, obj('b', 's1'), 's1')).toEqual([
    obj('c', 's2'),
    obj('b', 's1'),
  ]);
});
