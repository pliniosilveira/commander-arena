/** The words of the populate question (D-612, CR 701.36a): the engine asks `choosePermanent` of purpose 'populate'; the web names it. */
import type { ObjectView } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import {
  isPopulate,
  POPULATE_BADGE,
  POPULATE_TITLE,
  populateDetail,
  populatePrompt,
} from '../src/ui/decisions/permanents-populate';
import { lookupIndexFor } from './decisions-helpers';

const named = (id: string, name: string) =>
  ({ id, name, oracleText: '', controller: 0 }) as unknown as ObjectView;
const index = lookupIndexFor([named('o1', 'Rootborn Defenses'), named('o2', 'Cat token')]);

test('only the populate purpose is the populate question', () => {
  expect(isPopulate({ purpose: 'populate' })).toBe(true);
  expect(isPopulate({ purpose: 'amass' })).toBe(false);
});

test('the prompt, the title, the badge and the detail', () => {
  expect(populatePrompt({ source: 'o1' }, index)).toBe(
    'Populate: choose a creature token you control to copy (Rootborn Defenses).',
  );
  expect(POPULATE_TITLE).toBe('Populate: choose a token');
  expect(POPULATE_BADGE).toBe('Copied');
  expect(populateDetail([], index)).toBe('Click a creature token to create a copy of it.');
  expect(populateDetail(['o2'], index)).toBe(
    'A copy of Cat token will be created. Click it again to take it back.',
  );
});
