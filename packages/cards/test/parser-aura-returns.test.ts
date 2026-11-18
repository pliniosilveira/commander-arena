// Issue 89 (Silverquill Influence), "When enchanted creature dies, return this card from your graveyard to the battlefield." (D-657; Screams from Within) read through the whole
// pipeline: the real line, the node it lowers to and the near misses the grammar must not read.
// The engine runs the node in packages/engine/test/scenario-xx-aura-returns.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const aura = (text: string) =>
  readAll(`Enchant creature\n${text}`, 'enchantment', ['Aura']).abilities;

describe('"When enchanted creature dies, return this card from your graveyard to the battlefield." (CR 603.10a, 303.4f)', () => {
  test('the real third line of Screams from Within', () => {
    expect(
      aura(
        'Enchanted creature gets -1/-1.\nWhen enchanted creature dies, return this card from your graveyard to the battlefield.',
      )[2],
    ).toEqual({
      kind: 'triggered',
      trigger: { kind: 'dies', what: { kind: 'attached' } },
      effect: {
        kind: 'moveToZone',
        objects: { kind: 'thisCard' },
        to: 'battlefield',
        controller: 'owner',
      },
    });
  });

  test.each([
    ['When enchanted creature dies, return this card from your graveyard to your hand.'],
    [
      'When enchanted creature becomes tapped, return this card from your graveyard to the battlefield.',
    ],
    ['When enchanted creature dies, return this card from a graveyard to the battlefield.'],
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(dropped(`Enchant creature\n${text}`, 'enchantment', ['Aura']).stoppedAt).toBeDefined();
  });
});

describe('"When enchanted creature dies, return this card to the battlefield at the beginning of the next end step." (CR 603.7, 400.7, 303.4f)', () => {
  test('the real second line of Ghoulish Impetus', () => {
    expect(
      aura(
        'When enchanted creature dies, return this card to the battlefield at the beginning of the next end step.',
      )[1],
    ).toEqual({
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
        },
      },
    });
  });

  test.each([
    ['When enchanted creature dies, return this card to the battlefield.'],
    [
      'When enchanted creature dies, return this card to the battlefield at the beginning of your next end step.',
    ],
    [
      'When enchanted creature becomes tapped, return this card to the battlefield at the beginning of the next end step.',
    ],
    [
      'Whenever a creature dies, return this card to the battlefield at the beginning of the next end step.',
    ],
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(dropped(`Enchant creature\n${text}`, 'enchantment', ['Aura']).stoppedAt).toBeDefined();
  });
});
