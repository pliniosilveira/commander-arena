import type { ChosenTarget, StackAbility } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { copyAbilityWords } from '../src/game/copy-text';
import { sameTargets } from '../src/ui/decisions/targeting';
import {
  initialX,
  isCount,
  replicateButtonText,
  replicatePrompt,
  xPrompt,
} from '../src/ui/decisions/x-picker';
import { replicatedWords } from '../src/ui/format';

const ability = (kind: 'storm' | 'replicate'): StackAbility =>
  ({ kind: 'triggered', effect: { kind } }) as unknown as StackAbility;

test('the replicate question is worded like the multikicker one and starts at 0', () => {
  const d = {
    purpose: 'replicate',
    min: 0,
    max: 3,
    cost: [{ kind: 'mana', symbols: ['R'] }],
  } as const;
  expect(isCount(d)).toBe(true);
  expect(initialX(d)).toBe(0);
  expect(replicatePrompt(d)).toBe('Replicate {R}: how many times? You can afford up to 3.');
  expect(xPrompt({ ...d, perX: { mana: 0, life: 0 }, sourceName: 'X' })).toBe(replicatePrompt(d));
  expect(replicateButtonText(0)).toBe("Don't replicate");
  expect(replicateButtonText(1)).toBe('Replicate once');
  expect(replicateButtonText(2)).toBe('Replicate 2 times');
});

test('replicated words and the storm and replicate triggers on the stack', () => {
  expect(replicatedWords({})).toBeNull();
  expect(replicatedWords({ replicated: 1 })).toBe('replicated once');
  expect(replicatedWords({ replicated: 3 })).toBe('replicated 3 times');
  expect(copyAbilityWords(ability('storm'), undefined)).toEqual({
    when: 'When you cast this spell',
    does: 'Copy this spell for each other spell cast before it this turn.',
  });
  expect(copyAbilityWords(ability('replicate'), { replicated: 2 })?.does).toBe(
    'Copy this spell 2 times.',
  );
  expect(copyAbilityWords(ability('replicate'), undefined)?.does).toBe(
    'Copy this spell for each time its replicate cost was paid.',
  );
  expect(
    copyAbilityWords(
      { kind: 'triggered', effect: { kind: 'draw' } } as unknown as StackAbility,
      undefined,
    ),
  ).toBeNull();
});

test('keeping the targets of a copy is recognised, in any order', () => {
  const a: ChosenTarget = { kind: 'player', seat: 1, specId: 't1' };
  const b: ChosenTarget = { kind: 'player', seat: 0, specId: 't1' };
  expect(sameTargets([a], [a])).toBe(true);
  expect(sameTargets([b], [a])).toBe(false);
  expect(sameTargets([], [a])).toBe(false);
});
