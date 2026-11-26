/**
 * Necromancy (CR 303.4, 702.5a, 307.1, 603.7, 514.3a): the words of the enchantment that becomes an Aura as it returns a creature card, as a pure model (no DOM). The abilities are the ones the
 * grammar writes for the card (convert-grammar-engine-necromancy.test.ts).
 */
import type { StackAbility } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { triggerGist } from '../src/ui/decisions/ability-label';

const enters = {
  kind: 'triggered',
  trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
  interveningIf: { kind: 'thisOnBattlefield' },
  targets: [
    { id: 't1', what: { kind: 'object', filter: { zone: 'graveyard', types: ['creature'] } } },
  ],
  effect: {
    kind: 'sequence',
    effects: [
      {
        kind: 'becomeAura',
        objects: { kind: 'this' },
        enchant: { kind: 'enchant', filter: { types: ['creature'], putWithSource: true } },
      },
      {
        kind: 'moveToZone',
        objects: { kind: 'target', id: 't1' },
        to: 'battlefield',
        controller: 'you',
        putWithSource: true,
      },
      { kind: 'attach', object: { kind: 'this' }, to: { kind: 'moved' } },
    ],
  },
} as unknown as StackAbility;

const clean = (words: string) => expect(words).not.toMatch(/undefined|null|\[object|"kind"|NaN/);

test('the enters ability says it becomes an Aura, puts the card onto the battlefield and attaches it', () => {
  const words = triggerGist(enters, undefined);
  clean(words);
  expect(words).toContain(
    'It becomes an Aura with "enchant creature put onto the battlefield with this',
  );
  expect(words).toMatch(/onto the battlefield/);
  expect(words).toMatch(/Attach this permanent to it/);
});
