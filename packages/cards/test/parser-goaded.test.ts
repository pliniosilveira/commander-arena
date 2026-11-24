// Issue 89 (Silverquill Influence), goad (D-639): "Enchanted creature ... is goaded" of an Aura read through the whole pipeline: the real Oracle lines of Coercive Impetus,
// Parasitic Impetus, Redemption Arc and Ghoulish Impetus (its first line), the nodes they lower to, SYNTHETIC variants and the near misses the grammar must not read.
// The engine runs what is lowered in packages/engine/test/scenario-xx-goad.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const ATTACHED = { kind: 'attached', types: ['creature'] } as const;
const GOADED = {
  kind: 'static',
  static: { kind: 'goaded', subject: ATTACHED },
} as const;
const ENCHANT = {
  kind: 'keyword',
  keyword: { kind: 'enchant', filter: { types: ['creature'] } },
} as const;
const aura = (text: string) =>
  readAll(`Enchant creature\n${text}`, 'enchantment', ['Aura']).abilities;
const pt = (power: number, toughness: number) =>
  ({ kind: 'static', static: { kind: 'modifyPt', subject: ATTACHED, power, toughness } }) as const;
const keyword = (kind: string) =>
  ({
    kind: 'static',
    static: { kind: 'grantKeyword', subject: ATTACHED, keyword: { kind } },
  }) as const;

describe('"Enchanted creature gets +N/+N and is goaded." (CR 701.15b, 613.4c)', () => {
  test('the real line of Coercive Impetus', () => {
    expect(aura('Enchanted creature gets +1/+1 and is goaded.')).toEqual([
      ENCHANT,
      pt(1, 1),
      GOADED,
    ]);
  });

  test('the real line of Parasitic Impetus, with another bonus', () => {
    expect(aura('Enchanted creature gets +2/+2 and is goaded.')).toEqual([
      ENCHANT,
      pt(2, 2),
      GOADED,
    ]);
  });

  test('the real line of Redemption Arc: a keyword and the goad', () => {
    expect(aura('Enchanted creature has indestructible and is goaded.')).toEqual([
      ENCHANT,
      keyword('indestructible'),
      GOADED,
    ]);
  });

  test('the first line of Ghoulish Impetus: a bonus, a keyword and the goad in a list', () => {
    expect(aura('Enchanted creature gets +1/+1, has deathtouch, and is goaded.')).toEqual([
      ENCHANT,
      pt(1, 1),
      keyword('deathtouch'),
      GOADED,
    ]);
  });

  test.each([
    ['Enchanted creature gets +1/+1 and is goaded', ''],
    ['Enchanted creature gets +1/+1 and is goaded by you.', 'by you.'],
    ['Enchanted creature gets +1/+1 and is goaded twice.', 'twice.'],
  ])('is dropped, never half read (SYNTHETIC): %s', (text, part) => {
    expect(dropped(`Enchant creature\n${text}`, 'enchantment', ['Aura']).stoppedAt).toBe(part);
  });
});

describe('"Goad target creature." and "goad it" as effects (CR 701.15a, D-651)', () => {
  test('the real first line of Killian, Decisive Mentor: tap and goad the same creature', () => {
    const abilities = readAll(
      'Whenever an enchantment you control enters, tap up to one target creature and goad it.',
      'creature',
    ).abilities;
    expect(abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { types: ['enchantment'], controller: 'you' } },
        targets: [
          {
            id: 't1',
            what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
            min: 0,
            max: 1,
          },
        ],
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'tap', objects: { kind: 'target', id: 't1' } },
            { kind: 'goad', objects: { kind: 'target', id: 't1' } },
          ],
        },
      },
    ]);
  });

  test('a spell that goads a target (SYNTHETIC)', () => {
    expect(readAll('Goad target creature.', 'instant').spell?.effect).toEqual({
      kind: 'goad',
      objects: { kind: 'target', id: 't1' },
    });
  });

  test.each([
    // A group of "each" is read since the Riders of Rohan deck (Taunt from the Rampart), and refused for naming no player's creatures: the diagnostic points past it.
    ['Goad each creature.', '.'],
    ['Goad target player.', 'player.'],
    ['Goad target creature until end of turn.', 'until end of turn.'],
  ])('is dropped, never half read (SYNTHETIC): %s', (text, part) => {
    expect(dropped(text, 'instant').stoppedAt).toBe(part);
  });
});
