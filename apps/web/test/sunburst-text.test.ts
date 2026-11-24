/**
 * The web side of Sunburst (CR 702.44a, 702.44d): the words of the trigger that gives a spell sunburst as it waits on the stack ("it gains sunburst", the effect
 * `spellGainsKeyword`) and the chip of the keyword. Pure models, no DOM.
 */
import type { Effect, StackAbility } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { keywordName, keywordShort } from '../src/ui/board/keywords';
import { triggerGist } from '../src/ui/decisions/ability-label';

const stackAbility = (effect: Effect): StackAbility =>
  ({
    kind: 'triggered',
    trigger: {
      kind: 'castSpell',
      filter: { stackKind: 'spell', types: ['artifact', 'creature'] },
      by: 'you',
    },
    effect,
  }) as unknown as StackAbility;

test('the trigger on the stack says the spell gains sunburst', () => {
  const effect = {
    kind: 'spellGainsKeyword',
    spell: { kind: 'triggerSubject' },
    keyword: { kind: 'sunburst' },
  } as unknown as Effect;
  expect(triggerGist(stackAbility(effect), undefined)).toMatch(/gains sunburst$/);
});

test('the keyword has a chip with its reminder', () => {
  expect(keywordShort('sunburst')).toBe('Sun');
  expect(keywordName('sunburst')).toMatch(/^Sunburst \(.*color of mana spent/);
});
