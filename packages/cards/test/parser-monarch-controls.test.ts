// Riders of Rohan deck, group E (Fealty to the Realm): "The monarch controls enchanted creature." and "Enchanted creature attacks each combat if able and can't attack you." read through
// the whole pipeline, the nodes they lower to, SYNTHETIC near misses the grammar must not read, and the features the lowering needs. The engine runs the same nodes in
// packages/engine/test/scenario-xx-monarch-controls.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { dropped, read, readAll, withoutFeature } from './parser-p5-helpers';

const ATTACHED = { kind: 'attached', types: ['creature'] } as const;
const ENCHANT = {
  kind: 'keyword',
  keyword: { kind: 'enchant', filter: { types: ['creature'] } },
} as const;
const aura = (text: string) =>
  readAll(`Enchant creature\n${text}`, 'enchantment', ['Aura']).abilities;

const CONTROL = { kind: 'static', static: { kind: 'controlAttached', by: 'monarch' } } as const;
const MUST_ATTACK = {
  kind: 'static',
  static: { kind: 'restriction', subject: ATTACHED, restriction: 'attacksEachCombat' },
} as const;
const CANT_ATTACK_YOU = {
  kind: 'static',
  static: { kind: 'cantAttackYou', creatures: { hostOfSource: true } },
} as const;

describe('"The monarch controls enchanted creature." (CR 613.1b, 725.1)', () => {
  test('the real line of Fealty to the Realm', () => {
    expect(aura('The monarch controls enchanted creature.')).toEqual([ENCHANT, CONTROL]);
  });

  test('the whole second and third lines of the card, as three abilities (the rest of the card is its enters trigger)', () => {
    expect(
      aura(
        "The monarch controls enchanted creature.\nEnchanted creature attacks each combat if able and can't attack you.",
      ),
    ).toEqual([ENCHANT, CONTROL, MUST_ATTACK, CANT_ATTACK_YOU]);
  });

  test.each([
    ['The monarch controls enchanted creature', ''],
    ['The monarch controls enchanted creature and draws a card.', ' and draws a card.'],
    ['The monarch controls enchanted creatures.', 'The monarch controls enchanted creatures.'],
    ['The monarch controls equipped creature.', 'The monarch controls equipped creature.'],
    ['You control enchanted creature.', 'You control enchanted creature.'],
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(
      read(`Enchant creature\n${text}`, 'enchantment', ['Aura']).abilities.filter(
        (a) => a.kind === 'static' && a.static.kind === 'controlAttached',
      ),
    ).toEqual([]);
  });

  test('"enchanted land" is not a creature: not read as the creature line', () => {
    expect(
      read('Enchant land\nThe monarch controls enchanted land.', 'enchantment', ['Aura']).abilities,
    ).not.toContainEqual(CONTROL);
  });

  test('it needs the engine feature static:controlAttached', () => {
    const blocked = withoutFeature(
      'static:controlAttached',
      'Enchant creature\nThe monarch controls enchanted creature.',
      'enchantment',
      ['Aura'],
    );
    expect(blocked).toBeDefined();
  });
});

describe('"Enchanted creature ... can\'t attack you." (CR 508.1a, 508.1d)', () => {
  test('the real line of Fealty to the Realm', () => {
    expect(aura("Enchanted creature attacks each combat if able and can't attack you.")).toEqual([
      ENCHANT,
      MUST_ATTACK,
      CANT_ATTACK_YOU,
    ]);
  });

  test("alone: it bars the player and not the planeswalkers (SYNTHETIC), unlike Vow of Duty's line", () => {
    expect(aura("Enchanted creature can't attack you.")).toEqual([ENCHANT, CANT_ATTACK_YOU]);
    expect(aura("Enchanted creature can't attack you or planeswalkers you control.")).toEqual([
      ENCHANT,
      {
        kind: 'static',
        static: { kind: 'cantAttackYou', creatures: { hostOfSource: true }, planeswalkers: true },
      },
    ]);
  });

  test.each([
    ["Enchanted creature can't attack you", ''],
    ["Enchanted creature can't attack your opponents.", 'your opponents.'],
    ["Enchanted creature can't attack you unless you pay {2}.", 'unless you pay {2}.'],
  ])('is dropped, never half read (SYNTHETIC): %s', (text, part) => {
    expect(dropped(`Enchant creature\n${text}`, 'enchantment', ['Aura']).stoppedAt).toBe(part);
  });
});
