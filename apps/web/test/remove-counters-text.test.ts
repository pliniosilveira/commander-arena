/**
 * The web side of "As this creature enters, remove all counters from any number of artifacts, creatures, and enchantments" (`entersRemoveCounters`, Sin, Unending Cataclysm,
 * CR 614.12, 122.1) as pure models, no DOM: the question names the permanent that enters, the second line says what Confirm does, and none is a legal answer.
 */
import type { ChoosePermanentDecision } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import {
  choosePermanentPrompt,
  permanentsDetail,
  permanentsReady,
} from '../src/ui/decisions/permanents';
import { lookupIndexFor } from './decisions-helpers';

const decision: ChoosePermanentDecision = {
  id: 'd1',
  seat: 0,
  kind: 'choosePermanent',
  source: 'o9',
  subject: 'o9',
  purpose: 'entersRemoveCounters',
  min: 0,
  max: 2,
  legal: ['o1', 'o2'],
};

test('the question says what is removed and that none is fine', () => {
  const index = lookupIndexFor([]);
  expect(choosePermanentPrompt(decision, index)).toMatch(
    /^Choose any number of permanents to remove all counters from as .+ enters\..*None is fine\.$/,
  );
});

test('the second line says what Confirm does', () => {
  expect(permanentsDetail([], decision)).toBe(
    'Click the permanents to remove every counter from, or confirm to remove none.',
  );
  expect(permanentsDetail(['o1'], decision)).toBe('1 chosen: every counter on it is removed.');
  expect(permanentsDetail(['o1', 'o2'], decision)).toBe(
    '2 chosen: every counter on them is removed.',
  );
});

test('confirming with nothing chosen is allowed', () => {
  expect(permanentsReady([], decision)).toBe(true);
});
