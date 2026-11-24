// The "First Flight" starter commander decks, the group of creatures attacking "you or a planeswalker you control": the lines of Soul Snare, Vow of Duty and Ever-Watching
// Threshold. The first line of each block is the real Oracle text of the card (the golden corpus does not hold them yet); the others are SYNTHETIC siblings and the near
// misses the grammar must not read. The engine runs what is lowered in convert-grammar-engine-first-flight-attacking-you.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { dropped, readAll } from './parser-p5-helpers';

// Statements about "enchanted creature" are read of an Aura only (CR 303.4: nothing else is attached to a creature by its own text).
const aura = (text: string) => readAll(text, 'enchantment', ['Aura']).abilities;
const enchantment = (text: string) => readAll(text, 'enchantment', []).abilities;
const droppedEnchantment = (text: string, subtypes: readonly string[] = []) =>
  dropped(text, 'enchantment', subtypes).text;

describe('Soul Snare: "Exile target creature that\'s attacking you or a planeswalker you control." (CR 508.1b, 506.3)', () => {
  test('the real line: a sacrifice ability that exiles an attacker of you or of your planeswalkers', () => {
    expect(
      enchantment(
        "{W}, Sacrifice this enchantment: Exile target creature that's attacking you or a planeswalker you control.",
      ),
    ).toEqual([
      {
        kind: 'activated',
        cost: [
          { kind: 'mana', symbols: ['W'] },
          { kind: 'sacrifice', what: { kind: 'this' } },
        ],
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: {
                zone: 'battlefield',
                types: ['creature'],
                attackingYou: 'orPlaneswalkers',
              },
            },
          },
        ],
        effect: { kind: 'exile', objects: { kind: 'target', id: 't1' } },
      },
    ]);
  });

  test('another cost (SYNTHETIC)', () => {
    expect(
      enchantment(
        "{1}{W}, Sacrifice this enchantment: Exile target creature that's attacking you or a planeswalker you control.",
      ),
    ).toMatchObject([
      {
        kind: 'activated',
        targets: [{ what: { filter: { attackingYou: 'orPlaneswalkers' } } }],
      },
    ]);
  });

  test.each([
    "{W}, Sacrifice this enchantment: Exile target creature that's attacking you.",
    "{W}, Sacrifice this enchantment: Exile target creature that's attacking you or a planeswalker.",
    "{W}, Sacrifice this enchantment: Exile target creature that's attacking a planeswalker you control.",
    "{W}, Sacrifice this enchantment: Exile target creature that's attacking you or planeswalkers you control.",
    "{W}, Sacrifice this enchantment: Exile target permanent that's attacking you or a planeswalker you control.",
    "{W}, Sacrifice this enchantment: Exile target creatures that's attacking you or a planeswalker you control.",
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(droppedEnchantment(text)).toBe(text.replace('this enchantment', '~'));
  });
});

describe('Vow of Duty: "Enchanted creature gets +2/+2, has vigilance, and can\'t attack you or planeswalkers you control." (CR 508.1a, 506.3)', () => {
  const host = { kind: 'attached', types: ['creature'] };
  const ban = {
    kind: 'static',
    static: { kind: 'cantAttackYou', creatures: { hostOfSource: true }, planeswalkers: true },
  };

  test('the real line: a bonus, a keyword and the restriction, each its own static ability', () => {
    expect(
      aura(
        "Enchant creature\nEnchanted creature gets +2/+2, has vigilance, and can't attack you or planeswalkers you control.",
      ),
    ).toEqual([
      { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
      { kind: 'static', static: { kind: 'modifyPt', subject: host, power: 2, toughness: 2 } },
      {
        kind: 'static',
        static: { kind: 'grantKeyword', subject: host, keyword: { kind: 'vigilance' } },
      },
      ban,
    ]);
  });

  test('the restriction alone (SYNTHETIC)', () => {
    expect(
      aura("Enchant creature\nEnchanted creature can't attack you or planeswalkers you control."),
    ).toEqual([
      { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
      ban,
    ]);
  });

  test("a bonus joined with 'and' to the restriction (SYNTHETIC)", () => {
    expect(
      aura(
        "Enchant creature\nEnchanted creature gets +1/+1 and can't attack you or planeswalkers you control.",
      ),
    ).toMatchObject([
      { kind: 'keyword' },
      { static: { kind: 'modifyPt', power: 1, toughness: 1 } },
      ban,
    ]);
  });

  test("'can't attack' alone still reads as the plain restriction (the comma-and joins nothing else)", () => {
    expect(
      aura("Enchant creature\nEnchanted creature gets +2/+2, has vigilance, and can't attack."),
    ).toMatchObject([
      { kind: 'keyword' },
      { static: { kind: 'modifyPt' } },
      { static: { kind: 'grantKeyword' } },
      { kind: 'static', static: { kind: 'restriction', restriction: 'cantAttack' } },
    ]);
  });

  test.each([
    "Enchant creature\nEnchanted creature can't attack your opponents.",
    "Enchant creature\nEnchanted creature can't attack you or planeswalkers.",
    "Enchant creature\nEnchanted creature can't attack planeswalkers you control.",
    "Enchant creature\nEnchanted creature gets +2/+2, has vigilance, and can't attack you or planeswalkers you control",
    "Enchant creature\nEnchanted creature gets +2/+2, has vigilance, and can't attack you or a planeswalker you control.",
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(droppedEnchantment(text, ['Aura'])).toContain('Enchanted creature');
  });
});

describe('Ever-Watching Threshold: "Whenever an opponent attacks, if they attacked you and/or a planeswalker you control, draw a card." (CR 508.1, 603.2c, 603.4)', () => {
  const threshold = {
    kind: 'triggered',
    trigger: { kind: 'attackBatch', who: 'opponent', atLeast: 1 },
    effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
    interveningIf: { kind: 'attackersAtYouAtLeast', count: 1 },
  };

  test('the real line: an opponent declares attackers, and at least one attacked you or your planeswalker', () => {
    expect(
      enchantment(
        'Whenever an opponent attacks, if they attacked you and/or a planeswalker you control, draw a card.',
      ),
    ).toEqual([threshold]);
  });

  test('another effect (SYNTHETIC)', () => {
    expect(
      enchantment(
        'Whenever an opponent attacks, if they attacked you and/or a planeswalker you control, you gain 1 life.',
      ),
    ).toMatchObject([{ trigger: threshold.trigger, interveningIf: threshold.interveningIf }]);
  });

  test('the older wording with creatures still reads as before (D-643)', () => {
    expect(
      enchantment(
        'Whenever an opponent attacks with creatures, if two or more of those creatures are attacking you and/or planeswalkers you control, draw a card.',
      ),
    ).toMatchObject([{ interveningIf: { kind: 'attackersAtYouAtLeast', count: 2 } }]);
  });

  test.each([
    'Whenever an opponent attacks, if they attacked you, draw a card.',
    'Whenever an opponent attacks, if they attacked you or a planeswalker you control, draw a card.',
    'Whenever an opponent attacks, if they attacked you and/or planeswalkers you control, draw a card.',
    'Whenever an opponent attacks, if they attacked you and/or a planeswalker, draw a card.',
    'Whenever you attack, if they attacked you and/or a planeswalker you control, draw a card.',
    'Whenever another player attacks you, if they attacked you and/or a planeswalker you control, draw a card.',
    'Whenever an opponent attacks you, if they attacked you and/or a planeswalker you control, draw a card.',
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(droppedEnchantment(text)).toBe(text);
  });
});
