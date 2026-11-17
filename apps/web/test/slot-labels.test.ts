import type { TargetChoiceSpec, TargetsDecision } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { slotLabel, targetsPrompt } from '../src/ui/decisions/target-prompt';
import { currentSlot } from '../src/ui/decisions/targeting';

/** A slot as the engine builds it: the `TargetSpec` it came from rides along as `target`. */
const slot = (specId: string, what: unknown, extra: Partial<TargetChoiceSpec> = {}) =>
  ({
    specId,
    min: 1,
    max: 1,
    legal: [],
    target: { id: specId, what },
    ...extra,
  }) as unknown as TargetChoiceSpec;

const player = slot('p', { kind: 'player', filter: 'any' });
const creature = slot('c', {
  kind: 'object',
  filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
});

describe('the label of a slot of a spell with several targets (what each slot is for)', () => {
  test('a slot says what it takes, not only its number', () => {
    expect(slotLabel([player, creature], 1)).toBe('Slot 2: target creature you control');
  });

  test('a slot without the card words keeps the plain number', () => {
    const bare = { specId: 'x', min: 1, max: 1, legal: [] } as TargetChoiceSpec;
    expect(slotLabel([bare, bare], 1)).toBe('Slot 2');
  });

  test('the prompt names the slot being filled when there are several', () => {
    const decision = {
      kind: 'targets',
      source: 'o1',
      specs: [player, creature],
    } as unknown as TargetsDecision;
    const first = currentSlot(decision.specs, []);
    if (first === null) throw new Error('no slot');
    expect(targetsPrompt(decision, new Map(), first)).toBe(
      'Choose a target for a card. Slot 1 of 2: target player.',
    );
  });
});
