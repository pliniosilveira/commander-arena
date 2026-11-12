// Stage P18 (M6): a line the grammar reads but whose engine feature is not listed is reported as
// "recognised, not runnable" naming that feature, never built and never read as something else. The
// engine lists every feature the stage needs, so the support check is replaced here by one that lacks
// them, one at a time, and the lowering must name what it needs of the engine (D-068, D-111).
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { type FaceType, readAll, withoutFeature } from './parser-p5-helpers';

describe('the lowerings of stage P18 name the engine feature they need (D-111)', () => {
  test.each([
    ['trigger:step', 'At the beginning of combat on your turn, you gain 1 life.', 'creature', []],
    ['trigger:step', 'At the beginning of your draw step, you gain 1 life.', 'creature', []],
    [
      'trigger:step',
      "At the beginning of each opponent's upkeep, you gain 1 life.",
      'creature',
      [],
    ],
    ['trigger:step', 'At end of combat, you gain 1 life.', 'creature', []],
    ['trigger:drawn', 'Whenever you draw a card, you gain 1 life.', 'creature', []],
    [
      'trigger:drawn',
      'Whenever you draw your second card each turn, you gain 1 life.',
      'creature',
      [],
    ],
    [
      'trigger:dealsCombatDamage',
      'Whenever ~ deals combat damage to a player, draw a card.',
      'creature',
      [],
    ],
    [
      'trigger:leavesBattlefield',
      'When ~ leaves the battlefield, you gain 1 life.',
      'creature',
      [],
    ],
    [
      'selector:attached',
      'Whenever equipped creature dies, draw two cards.',
      'artifact',
      ['Equipment'],
    ],
    ['selector:attached', 'Whenever enchanted creature attacks, scry 1.', 'enchantment', ['Aura']],
    [
      'selector:power',
      'Whenever a creature you control with power 4 or greater enters, draw a card.',
      'creature',
      [],
    ],
    ['selector:toughness', 'Destroy target creature with toughness 5 or greater.', 'sorcery', []],
    ['selector:manaValue', 'Destroy all creatures with mana value 3 or less.', 'sorcery', []],
    ['selector:manaValue', 'Counter target spell with mana value 1.', 'instant', []],
    [
      'selector:power',
      'When ~ enters, if you control a creature with power 4 or greater, draw a card.',
      'creature',
      [],
    ],
    [
      'effect:unlessPays',
      'Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.',
      'creature',
      [],
    ],
    [
      'effect:unlessPays',
      'At the beginning of your upkeep, sacrifice ~ unless you pay {U}.',
      'creature',
      [],
    ],
    [
      'selector:controllerOf',
      'Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.',
      'creature',
      [],
    ],
    [
      'selector:triggerSubject',
      'Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.',
      'creature',
      [],
    ],
    [
      'selector:controllerOf',
      'Whenever another creature dies, its controller gains 2 life.',
      'creature',
      [],
    ],
    [
      'selector:triggerSubject',
      'Whenever another creature dies, its controller gains 2 life.',
      'creature',
      [],
    ],
  ] as const)('without %s: %s', (ref, text, type, subtypes) => {
    const missing = withoutFeature(ref, text, type as FaceType, [...subtypes]);
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain(ref);
  });

  test('a step of another player names the player whose turn it is: "that player" is read since the Bruna deck (it needed selector:triggerActor)', () => {
    const [ability] = readAll(
      "At the beginning of each opponent's upkeep, draw a card unless that player pays {1}.",
      'creature',
    ).abilities;
    expect(JSON.stringify(ability)).toContain('"player":{"kind":"triggerPlayer"}');
  });
});
