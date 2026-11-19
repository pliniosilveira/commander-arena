// Issue 89 (Silverquill Influence): an Aura or Equipment card an effect puts onto the battlefield attached to an object the effect names, not one its controller chooses (Forum
// Filibuster: "Create a 2/1 Inkling token. When you do, return up to one target Aura or Equipment card from your graveyard to the battlefield attached to that token"; Gift of
// Immortality: "When enchanted creature dies, return that card to the battlefield under its owner's control. Return this card to the battlefield attached to that creature at the
// beginning of the next end step").
// Pins: CR 603.12 (a reflexive ability: its targets are chosen as it goes on the stack, and it knows the token the resolution before it made), CR 303.4f and CR 303.4g (an Aura that
// enters by an effect that names its host is attached to it; one that cannot enchant it stays where it is), CR 603.7c and CR 400.7 (the delayed ability is about the creature that
// returned, a new object, and the Aura's own card), CR 704.5m (not needed: the Aura never enters illegally).
// Cards: the SYNTHETIC cards of this file, the real Grizzly Bears, Lightning Bolt and Plains.
import { describe, expect, test } from 'vitest';
import { validateCard } from '../src/index';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const FILIBUSTER = 'SYNTHETIC Filibuster Enchantment';
const CREATURE_AURA = 'SYNTHETIC Creature Aura'; // Enchant creature
const LAND_AURA = 'SYNTHETIC Land Aura'; // Enchant land
const SWORD = 'SYNTHETIC Plain Sword'; // Equipment
const GIFT = 'SYNTHETIC Gift Aura'; // Enchant creature; the Gift of Immortality text
const BEARS = 'Grizzly Bears';
const BOLT = 'Lightning Bolt';
const LIBRARY = Array.from({ length: 10 }, () => 'Plains');

const inkling = {
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
} as const;

const filibuster = singleFaceCard({
  name: FILIBUSTER,
  manaCost: ['3', 'W', 'W'],
  types: ['enchantment'],
  colors: ['W'],
  colorIdentity: ['W'],
  oracleText: 'SYNTHETIC upkeep trigger of Forum Filibuster',
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'upkeep', whose: 'you' },
      effect: {
        kind: 'sequence',
        effects: [
          inkling,
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
    },
  ],
});

const aura = (name: string, enchant: 'creature' | 'land') =>
  singleFaceCard({
    name,
    manaCost: ['1', 'W'],
    types: ['enchantment'],
    subtypes: ['Aura'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: `Enchant ${enchant}`,
    abilities: [{ kind: 'keyword', keyword: { kind: 'enchant', filter: { types: [enchant] } } }],
  });

const sword = singleFaceCard({
  name: SWORD,
  manaCost: ['1'],
  types: ['artifact'],
  subtypes: ['Equipment'],
  colors: [],
  colorIdentity: [],
  oracleText: '',
  abilities: [],
});

const gift = singleFaceCard({
  name: GIFT,
  manaCost: ['2', 'W'],
  types: ['enchantment'],
  subtypes: ['Aura'],
  colors: ['W'],
  colorIdentity: ['W'],
  oracleText:
    "Enchant creature\nWhen enchanted creature dies, return that card to the battlefield under its owner's control. Return this card to the battlefield attached to that creature at the beginning of the next end step.",
  abilities: [
    { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
    {
      kind: 'triggered',
      trigger: { kind: 'dies', what: { kind: 'attached' } },
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'moveToZone',
            objects: { kind: 'triggerCard' },
            to: 'battlefield',
            controller: 'owner',
          },
          {
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
        ],
      },
    },
  ],
});

const upkeep = (graveyard: readonly string[], battlefield: readonly string[] = []) => {
  const b = scenario()
    .define(filibuster)
    .define(aura(CREATURE_AURA, 'creature'))
    .define(aura(LAND_AURA, 'land'))
    .define(sword)
    .seat(0)
    .library(...LIBRARY)
    .battlefield(FILIBUSTER, ...battlefield);
  for (const card of graveyard) b.graveyard(card);
  return b
    .seat(1)
    .library(...LIBRARY)
    .at('precombatMain', { active: 1, turn: 2 })
    .build();
};

const inklingOf = (g: ReturnType<typeof upkeep>) =>
  Object.values(g.state.objects).find(
    (o) => o.zone === 'battlefield' && o.token?.characteristics.name === 'Inkling',
  );

describe('the cards validate', () => {
  test.each([
    [filibuster.name, filibuster],
    [gift.name, gift],
  ])('%s', (_name, card) => {
    expect(validateCard(card)).toEqual([]);
  });

  test('a reflexive ability that carries what the resolution made needs something made or moved', () => {
    const bad = singleFaceCard({
      name: 'SYNTHETIC Bad Carrier',
      manaCost: ['1'],
      types: ['enchantment'],
      colors: [],
      colorIdentity: [],
      oracleText: '',
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'upkeep', whose: 'you' },
          effect: {
            kind: 'reflexive',
            carriesMoved: true,
            effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
          },
        },
      ],
    });
    expect(validateCard(bad)).not.toEqual([]);
  });
});

describe('"Create a token. When you do, return up to one target Aura or Equipment card ... attached to that token" (CR 603.12, 303.4f)', () => {
  test('the Aura comes back attached to the token, with no choice of host', () => {
    const g = upkeep([CREATURE_AURA], [BEARS]);
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    g.act(0).chooseTargets(CREATURE_AURA);
    g.passAll();
    const token = inklingOf(g);
    expect(token).toBeDefined();
    g.expect.zone(CREATURE_AURA, 'battlefield', { seat: 0 });
    g.expect.attached(CREATURE_AURA, token === undefined ? null : { name: 'Inkling', seat: 0 });
  });

  test('an Equipment card comes back attached to the token too', () => {
    const g = upkeep([SWORD]);
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    g.act(0).chooseTargets(SWORD);
    g.passAll();
    g.expect.attached(SWORD, { name: 'Inkling', seat: 0 });
  });

  test('an Aura that cannot enchant a creature stays in the graveyard (CR 303.4g)', () => {
    const g = upkeep([LAND_AURA]);
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    g.act(0).chooseTargets(LAND_AURA);
    g.passAll();
    g.expect.zone(LAND_AURA, 'graveyard', { seat: 0 });
    // It never entered (a card that entered and fell off would have been put into the graveyard by CR 704.5m).
    g.expect.noEvent({ kind: 'zoneChanged', toZone: 'battlefield' });
    expect(inklingOf(g)).toBeDefined();
  });

  test('with no card to return the token is still made', () => {
    const g = upkeep([]);
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    expect(inklingOf(g)).toBeDefined();
    g.expect.stack([]);
  });
});

describe('"When enchanted creature dies, return that card ... Return this card to the battlefield attached to that creature at the beginning of the next end step." (CR 603.7c, 400.7, 303.4f)', () => {
  const board = () =>
    scenario()
      .define(gift)
      .seat(0)
      .hand(BOLT, BOLT)
      .library(...LIBRARY)
      .battlefield('Mountain', 'Mountain')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .battlefield(GIFT, { attachedTo: BEARS })
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('the creature returns at once and the Aura follows it at the end step', () => {
    const g = board();
    g.act(0).cast(`${BOLT}[0]`, { targets: [BEARS], pay: true });
    g.passAll();
    g.passAll();
    // The creature is back (a new object, under its owner's control), and the Aura waits in the graveyard.
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.zone(GIFT, 'graveyard', { seat: 1 });
    g.expect.attached(GIFT, null);
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(GIFT, 'battlefield', { seat: 1 });
    g.expect.attached(GIFT, { name: BEARS, seat: 1 });
  });

  test('a creature that is gone again at the end step leaves the Aura in the graveyard (CR 303.4g, 400.7)', () => {
    const g = board();
    g.act(0).cast(`${BOLT}[0]`, { targets: [BEARS], pay: true });
    g.passAll();
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    // The new Grizzly Bears dies as well: the delayed ability is about that object only.
    g.act(0).cast(BOLT, { targets: [BEARS], pay: true });
    g.passAll();
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(GIFT, 'graveyard', { seat: 1 });
  });
});
