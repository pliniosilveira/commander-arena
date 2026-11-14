// "Commander creatures you control get +2/+2 and have indestructible." (D-1310): a static ability whose subject is a group named by `ObjectFilter.commander`. A commander is a card
// its owner designated (CR 903.3), a fact no layer changes, so `derive` reads it from the permanent itself; before D-1310 `validateCard` refused it in a static subject.
// Pins: CR 903.3 (a commander is a card; a token or a copy is not), CR 613.4c (+N/+N in layer 7c), CR 702.12b (indestructible: lethal damage and destroy effects do nothing),
// CR 611.3 (a static ability affects whatever matches at any moment).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-feather-g2.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const GUARD = 'SYNTHETIC Commander Guard'; // 3/3: commander creatures you control get +2/+2 and have indestructible
const BEARS = 'Grizzly Bears'; // 2/2
const SPIDER = 'Giant Spider'; // 2/4
const BOLT = 'Lightning Bolt';
const MURDER = 'Murder';
const LIBRARY = ['Plains', 'Plains', 'Plains'] as const;

describe('the card is valid, and a commander is a legal subject of a static ability', () => {
  test(GUARD, () => {
    expect(validateCard(syntheticCard(GUARD))).toEqual([]);
  });

  test('a count in a static ability still cannot read "commander" (the count is made before the objects are known)', () => {
    const counting = singleFace({
      name: 'SYNTHETIC Test Counter',
      manaCost: ['1'],
      types: ['creature'],
      colors: [],
      colorIdentity: [],
      power: 1,
      toughness: 1,
      oracleText: 'test',
      abilities: [
        {
          kind: 'static',
          static: {
            kind: 'modifyPt',
            subject: { kind: 'this' },
            power: { kind: 'colorsAmong', filter: { types: ['creature'], commander: true } },
            toughness: 0,
          },
        },
      ],
    });
    expect(validateCard(counting).length).toBeGreaterThan(0);
  });
});

describe('who is affected', () => {
  const board = () =>
    scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(GUARD)
      .battlefield(BEARS, { commander: true, label: 'commander' })
      .battlefield(SPIDER, { label: 'other' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { commander: true, label: 'theirs' })
      .battlefield('Mountain', 'Mountain', 'Swamp', 'Swamp', 'Swamp')
      .hand(BOLT, MURDER)
      .at('precombatMain', { active: 0 })
      .build();

  test('your commander gets +2/+2 and indestructible; the rest of your creatures, and the Guard itself, do not', () => {
    const g = board();
    g.expect.pt('commander', 4, 4);
    g.expect.derived('commander', { keywords: ['indestructible'] });
    g.expect.pt('other', 2, 4);
    g.expect.derived('other', { keywords: ['reach'] }); // its own reach, no indestructible
    g.expect.pt(GUARD, 3, 3);
    g.expect.derived(GUARD, { keywords: [] });
    g.expect.invariants();
  });

  test('"you control": the commander of an opponent is not affected', () => {
    const g = board();
    g.expect.pt('theirs', 2, 2);
    g.expect.derived('theirs', { keywords: [] });
  });

  test('a creature that is not a commander card (not designated) is not one even if it has the same name', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(GUARD)
      .battlefield(BEARS, { label: 'plain' })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.expect.pt('plain', 2, 2);
  });

  test('the bonus is there while the Guard is: it ends when the Guard leaves (CR 611.3a)', () => {
    const g = board();
    g.act(0).pass();
    g.act(1).cast(MURDER, { targets: [GUARD], pay: true });
    g.passAll();
    g.expect.zone(GUARD, 'graveyard', { seat: 0 });
    g.expect.pt('commander', 2, 2);
    g.expect.derived('commander', { keywords: [] });
  });

  test('indestructible: lethal damage and a destroy effect do nothing to the commander (CR 702.12b)', () => {
    const g = board();
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: ['commander'], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.damage('commander', 3);
    g.act(0).pass();
    g.act(1).cast(MURDER, { targets: ['commander'], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('without the Guard the same commander dies to the same Bolt', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS, { commander: true, label: 'commander' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Mountain')
      .hand(BOLT)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: ['commander'], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });
});
