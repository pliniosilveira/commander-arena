/**
 * Issue 89 (Animate Dead; CR 702.5a, 603.4, 400.7, 701.21a): the words of the Aura that returns the card it enchants, as a pure model (no DOM). The abilities are the ones the grammar
 * writes for the card (convert-grammar-engine-animate-dead.test.ts).
 */
import type { StackAbility } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { triggerGist } from '../src/ui/decisions/ability-label';

const enters = {
  kind: 'triggered',
  trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
  interveningIf: { kind: 'thisOnBattlefield' },
  effect: {
    kind: 'sequence',
    effects: [
      {
        kind: 'replaceEnchant',
        objects: { kind: 'this' },
        loses: { kind: 'enchant', filter: { zone: 'graveyard', types: ['creature'] } },
        gains: { kind: 'enchant', filter: { types: ['creature'], putWithSource: true } },
      },
      {
        kind: 'moveToZone',
        objects: { kind: 'attached' },
        to: 'battlefield',
        controller: 'you',
        putWithSource: true,
      },
      { kind: 'attach', object: { kind: 'this' }, to: { kind: 'moved' } },
    ],
  },
} as unknown as StackAbility;

const leaves = {
  kind: 'triggered',
  trigger: { kind: 'leavesBattlefield', what: { kind: 'this' } },
  effect: { kind: 'sacrifice', objects: { kind: 'putWithThis' }, byController: true },
} as unknown as StackAbility;

const clean = (words: string) => expect(words).not.toMatch(/undefined|null|\[object|"kind"|NaN/);

test('the enters ability says it returns the enchanted card under your control and attaches the Aura', () => {
  const words = triggerGist(enters, undefined);
  console.log('ENTERS:', words);
  clean(words);
  expect(words).toContain('loses "enchant creature card in a graveyard"');
  expect(words).toContain('gains "enchant creature put onto the battlefield with this Aura"');
  expect(words).toContain('Return the enchanted card to the battlefield under your control');
  expect(words).toMatch(/Attach this permanent to it/);
});

test('the leaves ability has that creature sacrificed by its controller', () => {
  const words = triggerGist(leaves, undefined);
  console.log('LEAVES:', words);
  clean(words);
  expect(words).toBe('Sacrifice that creature');
});
