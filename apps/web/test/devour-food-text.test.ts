/**
 * The web side of "Devour Food 3" (CR 702.82c, the Food and Fellowship deck) as pure models, no DOM: the question names the Foods, the second line says so, the chip says the
 * variant, and the condition, amount and static texts of the other cards of the group read as the cards do.
 */
import type { ChoosePermanentDecision } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { chipsOf } from '../src/ui/board/keywords';
import { choosePermanentPrompt, permanentsDetail } from '../src/ui/decisions/permanents';
import { lookupIndexFor } from './decisions-helpers';

test('the devour question of a variant names the permanents: Foods, not creatures', () => {
  const index = lookupIndexFor([]);
  const devour: ChoosePermanentDecision = {
    id: 'd1',
    seat: 0,
    kind: 'choosePermanent',
    source: 'o9',
    subject: 'o9',
    purpose: 'devour',
    min: 0,
    max: 2,
    legal: ['o1', 'o2'],
    devourQuality: 'Food',
  };
  expect(choosePermanentPrompt(devour, index)).toMatch(
    /^Choose any number of Foods to sacrifice as .+ enters \(devour\)\. None is fine\.$/,
  );
  expect(permanentsDetail([], devour)).toBe(
    'Click the Foods to sacrifice, or confirm to sacrifice none.',
  );
});

test('the chip of "Devour Food 3" says the variant and what it sacrifices', () => {
  const chip = chipsOf({
    keywords: ['devour'],
    restrictions: [],
    oracleText: 'Devour Food 3 (As this creature enters, you may sacrifice any number of Foods.)',
  })[0];
  expect(chip?.short).toBe('Dev 3');
  expect(chip?.full).toContain('Devour Food 3');
  expect(chip?.full).toContain('any number of Foods');
  expect(chip?.full).toContain('for each Food sacrificed');
});
