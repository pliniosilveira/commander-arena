/**
 * The words of Twilight Diviner's ability (CR 603.2c, 603.4, 603.6a, 707.2), as pure models: the batch enters trigger "if they entered or were cast from a graveyard", the effect "a copy of
 * one of them" and the question it asks (`choosePermanent` of purpose 'copyTrigger'). No DOM.
 */
import type { ObjectView } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { triggerWording } from '../src/game/trigger-text';
import {
  COPY_TRIGGER_TITLE,
  isPopulate,
  populatePrompt,
} from '../src/ui/decisions/permanents-populate';
import { lookupIndexFor } from './decisions-helpers';

const named = (id: string, name: string) =>
  ({ id, name, oracleText: '', controller: 0 }) as unknown as ObjectView;
const index = lookupIndexFor([named('o1', 'Twilight Diviner')]);

test('one or more creatures enter, from a graveyard', () => {
  const what = { types: ['creature' as const], controller: 'you' as const, other: true };
  expect(triggerWording({ kind: 'entersBatch', what }, { self: 'Twilight Diviner' })).toBe(
    'Whenever one or more other creatures you control enter',
  );
  expect(
    triggerWording(
      { kind: 'entersBatch', what, fromGraveyard: true },
      { self: 'Twilight Diviner' },
    ),
  ).toBe(
    'Whenever one or more other creatures you control enter, if they entered or were cast from a graveyard',
  );
});

test('the question of the copy is the populate question with its own words', () => {
  expect(isPopulate({ purpose: 'copyTrigger' })).toBe(true);
  expect(populatePrompt({ source: 'o1', purpose: 'copyTrigger' }, index)).toBe(
    'Choose one of the creatures that entered to create a copy of (Twilight Diviner).',
  );
  expect(COPY_TRIGGER_TITLE).toBe('Choose a creature to copy');
});
