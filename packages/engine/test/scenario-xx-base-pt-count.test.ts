// "Equipped creature gets +1/+1 for each creature you control with base power or toughness 1." (Squirreled Away deck, group 4)
// Pins: CR 208.4b (base power and toughness are what layer 7b leaves, before counters and "+N/+N" effects), CR 613.4b-c (layer 7b sets, layer 7c modifies: a "+N/+N" does not
// change which creatures have a base value of 1), CR 611.3a (the count follows the board), CR 613.8 (the count of a characteristic-defining ability may not read base values).
// Cards are SYNTHETIC, built here.
import { describe, expect, test } from 'vitest';
import type { ObjectFilter } from '../src/ast/types';
import { validateCard } from '../src/ast/validate';
import { singleFace } from '../src/cards/fixtures/helpers';
import { scenario } from '../src/testing/index';

const SWORD = 'SYNTHETIC Squeaky Sword';
const SHRINK = 'SYNTHETIC Shrink Ray';
const BEARS = 'Grizzly Bears'; // 2/2
const GOBLIN = 'Raging Goblin'; // 1/1
const CANNON = 'SYNTHETIC Glass Cannon'; // 4/1
const WALL = 'SYNTHETIC Brick Wall'; // 0/5

const COUNTED: ObjectFilter = {
  types: ['creature'],
  controller: 'you',
  basePowerOrToughnessIs: 1,
};
const sword = singleFace({
  name: SWORD,
  manaCost: ['2'],
  types: ['artifact'],
  subtypes: ['Equipment'],
  colors: [],
  colorIdentity: [],
  oracleText:
    'Equipped creature gets +1/+1 for each creature you control with base power or toughness 1.',
  abilities: [
    {
      kind: 'static',
      static: {
        kind: 'modifyPt',
        subject: { kind: 'attached', types: ['creature'] },
        power: { kind: 'countOf', filter: COUNTED },
        toughness: { kind: 'countOf', filter: COUNTED },
      },
    },
  ],
});
const cannon = singleFace({
  name: CANNON,
  manaCost: ['2', 'R'],
  types: ['creature'],
  subtypes: ['Goblin'],
  colors: ['R'],
  colorIdentity: ['R'],
  power: 4,
  toughness: 1,
  oracleText: '',
});
const shrink = singleFace({
  name: SHRINK,
  manaCost: ['U'],
  types: ['instant'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText: 'Target creature has base power and toughness 1/1 until end of turn.',
  spell: {
    targets: [{ id: 't1', what: { kind: 'object', filter: { types: ['creature'] } } }],
    effect: {
      kind: 'setPt',
      objects: { kind: 'target', id: 't1' },
      power: 1,
      toughness: 1,
      duration: 'untilEndOfTurn',
    },
  },
});

const base = () => {
  const b = scenario().define(sword).define(cannon).define(shrink);
  b.seat(0).library('Island', { count: 4 });
  return b;
};

describe('the card is valid', () => {
  test(SWORD, () => {
    expect(validateCard(sword)).toEqual([]);
  });
});

describe('"for each creature you control with base power or toughness 1" (CR 208.4b)', () => {
  test('a creature with base power 1 or base toughness 1 counts, once; another with neither does not', () => {
    const b = base();
    b.battlefield(BEARS, { label: 'host' });
    b.battlefield(SWORD, { attachedTo: 'host' });
    b.battlefield(GOBLIN).battlefield(CANNON).battlefield(WALL);
    b.seat(1).library('Island', { count: 4 });
    const g = b.at('precombatMain', { active: 0 }).build();
    // Goblin (1/1) and Cannon (4/1) count; Bears (2/2) and Wall (0/5) do not: +2/+2.
    g.expect.pt('host', 4, 4);
  });

  test('with none counted the equipped creature gets nothing', () => {
    const b = base();
    b.battlefield(BEARS, { label: 'host' });
    b.battlefield(SWORD, { attachedTo: 'host' });
    b.seat(1).library('Island', { count: 4 });
    const g = b.at('precombatMain', { active: 0 }).build();
    g.expect.pt('host', 2, 2);
  });

  test('a +1/+1 counter does not change a base value: a 1/1 with counters still counts', () => {
    const b = base();
    b.battlefield(BEARS, { label: 'host' });
    b.battlefield(SWORD, { attachedTo: 'host' });
    b.battlefield(GOBLIN, { counters: { '+1/+1': 2 } });
    b.seat(1).library('Island', { count: 4 });
    const g = b.at('precombatMain', { active: 0 }).build();
    g.expect.pt('host', 3, 3);
  });

  test('the creatures of another player are not counted', () => {
    const b = base();
    b.battlefield(BEARS, { label: 'host' });
    b.battlefield(SWORD, { attachedTo: 'host' });
    b.seat(1).library('Island', { count: 4 });
    b.battlefield(GOBLIN);
    const g = b.at('precombatMain', { active: 0 }).build();
    g.expect.pt('host', 2, 2);
  });

  test('an effect that sets base power and toughness (layer 7b) changes what is counted', () => {
    const b = base();
    b.battlefield(BEARS, { label: 'host' });
    b.battlefield(SWORD, { attachedTo: 'host' });
    b.battlefield(WALL, { label: 'wall' });
    b.hand(SHRINK);
    b.battlefield('Island');
    b.seat(1).library('Island', { count: 4 });
    const g = b.at('precombatMain', { active: 0 }).build();
    g.expect.pt('host', 2, 2);
    g.act(0).cast(SHRINK, { targets: ['wall'], pay: true });
    g.passAll();
    // The Wall is a 1/1 until end of turn: +1/+1 for the Sword's creature.
    g.expect.pt('wall', 1, 1);
    g.expect.pt('host', 3, 3);
  });

  test('the equipped creature itself counts when its base value is 1', () => {
    const b = base();
    b.battlefield(CANNON, { label: 'host' });
    b.battlefield(SWORD, { attachedTo: 'host' });
    b.seat(1).library('Island', { count: 4 });
    const g = b.at('precombatMain', { active: 0 }).build();
    // 4/1 base, itself counted once: +1/+1.
    g.expect.pt('host', 5, 2);
  });
});

describe('where the engine refuses the filter', () => {
  const wrap = (filter: ObjectFilter, kind: 'modifyPt' | 'characteristicPt') =>
    singleFace({
      name: 'SYNTHETIC Refused Count',
      manaCost: ['2'],
      types: ['creature'],
      subtypes: ['Elf'],
      colors: [],
      colorIdentity: [],
      power: kind === 'modifyPt' ? 1 : '*',
      toughness: kind === 'modifyPt' ? 1 : '*',
      oracleText: 'test',
      abilities: [
        {
          kind: 'static',
          static:
            kind === 'modifyPt'
              ? {
                  kind: 'modifyPt',
                  subject: { kind: 'this' },
                  power: { kind: 'countOf', filter },
                  toughness: 0,
                }
              : {
                  kind: 'characteristicPt',
                  power: { kind: 'countOf', filter },
                  toughness: { kind: 'countOf', filter },
                },
        },
      ],
    });

  test('a "+N/+N" count may read it', () => {
    expect(validateCard(wrap(COUNTED, 'modifyPt'))).toEqual([]);
  });

  test('a characteristic-defining ability may not (it would count itself in layer 7a)', () => {
    expect(validateCard(wrap(COUNTED, 'characteristicPt')).length).toBeGreaterThan(0);
  });

  // Zinnia, Valley's Voice (issue 111): "+X/+0, where X is the number of other creatures you control with base power 1": the base power alone reads the same base values.
  test('"base power 1" is read in a "+N/+N" count and refused in a characteristic-defining ability (CR 613.8)', () => {
    const basePower: ObjectFilter = { types: ['creature'], controller: 'you', basePowerIs: 1 };
    expect(validateCard(wrap(basePower, 'modifyPt'))).toEqual([]);
    expect(validateCard(wrap(basePower, 'characteristicPt')).length).toBeGreaterThan(0);
  });

  test('a non-integer is refused', () => {
    expect(
      validateCard(wrap({ ...COUNTED, basePowerOrToughnessIs: 1.5 }, 'modifyPt')).length,
    ).toBeGreaterThan(0);
  });

  test('the subject of a static ability may not name it (derive matches it before layer 7)', () => {
    const card = singleFace({
      name: 'SYNTHETIC Refused Subject',
      manaCost: ['2'],
      types: ['enchantment'],
      colors: [],
      colorIdentity: [],
      oracleText: 'test',
      abilities: [
        {
          kind: 'static',
          static: {
            kind: 'modifyPt',
            subject: { kind: 'filter', filter: COUNTED },
            power: 1,
            toughness: 1,
          },
        },
      ],
    });
    expect(validateCard(card).length).toBeGreaterThan(0);
  });
});
