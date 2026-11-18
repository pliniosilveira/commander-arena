/**
 * Issue 89 (Forum Filibuster, Gift of Immortality; CR 603.12, 303.4f): the words of an Aura or an Equipment card put onto the battlefield attached to an object the ability names,
 * as a pure model (no DOM). The abilities are the ones the grammar writes for the two cards.
 */
import type { StackAbility } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { triggerGist } from '../src/ui/decisions/ability-label';

const forum = {
  kind: 'triggered',
  trigger: { kind: 'upkeep', whose: 'you' },
  effect: {
    kind: 'sequence',
    effects: [
      {
        kind: 'createToken',
        token: {
          kind: 'custom',
          definition: {
            name: 'Inkling',
            manaCost: null,
            supertypes: [],
            types: ['creature'],
            subtypes: ['Inkling'],
            colors: ['W', 'B'],
            power: 2,
            toughness: 1,
            loyalty: null,
            defense: null,
            oracleText: '',
            abilities: [{ kind: 'keyword', keyword: { kind: 'flying' } }],
          },
        },
        count: 1,
      },
      {
        kind: 'reflexive',
        carriesMoved: true,
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: {
                zone: 'graveyard',
                controller: 'you',
                anyOf: [{ subtypes: ['Aura'] }, { subtypes: ['Equipment'] }],
              },
            },
            min: 0,
            max: 1,
          },
        ],
        effect: {
          kind: 'moveToZone',
          objects: { kind: 'target', id: 't1' },
          to: 'battlefield',
          controller: 'you',
          attachTo: { kind: 'moved' },
        },
      },
    ],
  },
} as unknown as StackAbility;

test('the reflexive return says what it is attached to', () => {
  const words = triggerGist(forum, undefined);
  expect(words).toMatch(/When you do, return .* to the battlefield attached to that permanent/i);
  expect(words).not.toMatch(/undefined|null|\[object|"kind"|NaN/);
});

test('the delayed return of the Aura itself says the same', () => {
  const gift = {
    kind: 'triggered',
    trigger: { kind: 'dies', what: { kind: 'attached' } },
    effect: {
      kind: 'delayedTrigger',
      at: { step: 'endStep', whose: 'each' },
      effect: {
        kind: 'moveToZone',
        objects: { kind: 'thisCard' },
        to: 'battlefield',
        controller: 'you',
        attachTo: { kind: 'moved' },
      },
    },
  } as unknown as StackAbility;
  const words = triggerGist(gift, undefined);
  expect(words).toMatch(/attached to that permanent/);
  expect(words).not.toMatch(/undefined|null|\[object|"kind"|NaN/);
});
