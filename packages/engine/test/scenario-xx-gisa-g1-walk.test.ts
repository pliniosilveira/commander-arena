// The Gisa deck (issue 41), group 1 (D-1401, D-1402): landwalk that is given ("Other Zombie creatures have swampwalk", Zombie Master; "Target creature gains swampwalk until
// end of turn", Zombie Trailblazer) and "Target land becomes a Swamp until end of turn" (Zombie Trailblazer).
// Pins: CR 702.14c (a creature with landwalk can't be blocked as long as the defending player controls a land with the land type, tapped or not), CR 702.14e (the same landwalk
// twice is redundant), CR 702.14d and 509.1b (different landwalks are different abilities, each an evasion), CR 613.1f (a granted keyword, layer 6, in timestamp order with the
// rest, ends with its source or its duration), CR 305.6 (a land with a basic land type has the intrinsic "{T}: Add [mana symbol]"), CR 305.7 (an effect that sets a land's subtype to
// a basic land type: the old land types go, the abilities of its rules text go, the mana ability of the new type comes, abilities other effects gave stay), CR 205.1a (a subtype
// changes only the subtypes of its own card type), CR 611.2a and 514.2 (until end of turn), CR 118.3 and 302.6 (a cost that taps an untapped creature: summoning sick ones too).
// Cards: the SYNTHETIC cards of src/cards/fixtures/synthetic-gisa-g1.ts and of synthetic-restrictions.ts, Grizzly Bears and the basic lands.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { derive } from '../src/rules/derive';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { attackedGame, canBlock } from './restriction-helpers';

const MASTER = 'SYNTHETIC Walk Master'; // 2/3 Zombie: other Zombie creatures have swampwalk, other Zombies have "{B}: Regenerate this permanent."
const SCOUT = 'SYNTHETIC Trail Scout'; // 2/2 Zombie Scout: tap an untapped Zombie you control: target land becomes a Swamp / target creature gains swampwalk
const ZOMBIE = 'SYNTHETIC Gisa Zombie'; // 2/2
const DUAL = 'SYNTHETIC Dual Island'; // a nonbasic land with the types Island and Swamp
const BEARS = 'Grizzly Bears';

const LIBRARY = ['Island', 'Island', 'Island', 'Island'] as const;

const ISLAND_ZOMBIE = singleFace({
  name: 'SYNTHETIC Test Island Zombie',
  manaCost: ['1', 'U'],
  types: ['creature'],
  subtypes: ['Zombie'],
  colors: ['U'],
  colorIdentity: ['U'],
  power: 1,
  toughness: 1,
  oracleText: 'Islandwalk',
  abilities: [{ kind: 'keyword', keyword: { kind: 'landwalk', landType: 'Island' } }],
});

const subtypesOf = (g: ScenarioGame, card: Parameters<ScenarioGame['id']>[0]) => {
  const obj = g.state.objects[g.id(card)];
  if (obj === undefined) throw new Error('no such object');
  return derive(g.state, obj).subtypes;
};
const walks = (g: ScenarioGame, card: Parameters<ScenarioGame['id']>[0]) => {
  const obj = g.state.objects[g.id(card)];
  if (obj === undefined) throw new Error('no such object');
  return derive(g.state, obj).abilities.flatMap((a) =>
    a.kind === 'keyword' && a.keyword.kind === 'landwalk' ? [a.keyword.landType] : [],
  );
};

describe('CR 702.14c, 613.1f: "Other Zombie creatures have swampwalk"', () => {
  test('a Zombie of the controller is unblockable while the defending player controls a Swamp', () => {
    const g = attackedGame(
      [ZOMBIE, MASTER],
      (b) => b.battlefield('Swamp', BEARS),
      () => {},
    );
    expect(canBlock(g, BEARS, ZOMBIE)).toBe(false);
  });

  test('without a Swamp the Zombie can be blocked as usual', () => {
    const g = attackedGame([ZOMBIE, MASTER], (b) => b.battlefield('Forest', 'Island', BEARS));
    expect(canBlock(g, BEARS, ZOMBIE)).toBe(true);
  });

  test('the Master itself does not have it ("other"), so a Swamp does not stop the block of it', () => {
    const g = attackedGame([MASTER, ZOMBIE], (b) => b.battlefield('Swamp', BEARS));
    expect(canBlock(g, BEARS, MASTER)).toBe(true);
    expect(canBlock(g, BEARS, ZOMBIE)).toBe(false);
  });

  test('a creature that is not a Zombie does not have it', () => {
    const g = attackedGame([BEARS, MASTER], (b) => b.battlefield('Swamp', BEARS));
    expect(canBlock(g, { name: BEARS, seat: 1 }, { name: BEARS, seat: 0 })).toBe(true);
  });

  test('a Zombie of the other player has it too: the Master says "other Zombie creatures", not "you control"', () => {
    // Seat 1's Zombie attacks seat 0, who controls the Master and a Swamp.
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(MASTER, 'Swamp', BEARS)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(ZOMBIE)
      .at('precombatMain', { active: 1 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).attack([ZOMBIE]);
    g.advanceTo('declareBlockers', { block: false });
    expect(canBlock(g, { name: BEARS, seat: 0 }, ZOMBIE)).toBe(false);
  });

  test('the grant is layer 6 and the keyword is gone with the Master', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(MASTER, ZOMBIE, 'Swamp', 'Swamp', 'Swamp')
      .hand('Murder')
      .seat(1)
      .library(...LIBRARY)
      .build();
    expect(walks(g, ZOMBIE)).toEqual(['Swamp']);
    g.act(0).cast('Murder', { targets: [MASTER], pay: true });
    g.passAll();
    g.expect.zone(MASTER, 'graveyard', { seat: 0 });
    expect(walks(g, ZOMBIE)).toEqual([]);
  });

  test('a creature with another landwalk and the granted one has both (CR 702.14d), and each is an evasion of its own', () => {
    const board = (land: string) =>
      scenario()
        .seat(0)
        .define(ISLAND_ZOMBIE)
        .library(...LIBRARY)
        .battlefield(MASTER, ISLAND_ZOMBIE.name)
        .seat(1)
        .library(...LIBRARY)
        .battlefield(land, BEARS)
        .at('precombatMain', { active: 0 })
        .build();
    const g = board('Forest');
    expect(walks(g, ISLAND_ZOMBIE.name).sort()).toEqual(['Island', 'Swamp']);
    for (const [land, canBeBlocked] of [
      ['Forest', true],
      ['Island', false],
      ['Swamp', false],
    ] as const) {
      const h = board(land);
      h.advanceTo('declareAttackers', { attack: false });
      h.act(0).attack([ISLAND_ZOMBIE.name]);
      h.advanceTo('declareBlockers', { block: false });
      expect(canBlock(h, { name: BEARS, seat: 1 }, ISLAND_ZOMBIE.name), land).toBe(canBeBlocked);
    }
  });

  test('swampwalk given twice is one ability (CR 702.14e)', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(MASTER, SCOUT, ZOMBIE)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).activate(SCOUT, { ability: 1, targets: [ZOMBIE] });
    g.act(0).choosePermanents(SCOUT);
    g.passAll();
    expect(walks(g, ZOMBIE)).toEqual(['Swamp']);
  });
});

describe('"Tap an untapped Zombie you control: Target creature gains swampwalk until end of turn."', () => {
  function board(extra: (b: ReturnType<typeof scenario>) => void = () => {}) {
    const b = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SCOUT, ZOMBIE, BEARS);
    extra(b);
    return b
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Swamp', 'Grizzly Bears')
      .build();
  }

  test('the creature has swampwalk this turn and the Zombie that paid is tapped', () => {
    const g = board();
    g.act(0).activate(SCOUT, { ability: 1, targets: [{ name: BEARS, seat: 0 }] });
    g.act(0).choosePermanents(ZOMBIE);
    g.expect.tapped(ZOMBIE, true);
    g.expect.tapped(SCOUT, false);
    expect(walks(g, { name: BEARS, seat: 0 })).toEqual([]);
    g.passAll();
    expect(walks(g, { name: BEARS, seat: 0 })).toEqual(['Swamp']);
  });

  test('it wears off at the end of the turn (CR 514.2)', () => {
    const g = board();
    g.act(0).activate(SCOUT, { ability: 1, targets: [{ name: BEARS, seat: 0 }] });
    g.act(0).choosePermanents(ZOMBIE);
    g.passAll();
    expect(walks(g, { name: BEARS, seat: 0 })).toEqual(['Swamp']);
    g.advanceTo('precombatMain', { turn: 'next' });
    expect(walks(g, { name: BEARS, seat: 0 })).toEqual([]);
  });

  test('the creature with swampwalk can not be blocked: the engine, the legal actions and the decision agree', () => {
    const g = board();
    g.act(0).activate(SCOUT, { ability: 1, targets: [{ name: BEARS, seat: 0 }] });
    g.act(0).choosePermanents(ZOMBIE);
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([BEARS]);
    g.advanceTo('declareBlockers', { block: false });
    expect(canBlock(g, { name: BEARS, seat: 1 }, { name: BEARS, seat: 0 })).toBe(false);
  });

  test('summoning sick Zombies pay the cost: it is not a {T} ability of the creature (CR 302.6)', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SCOUT, { fresh: true })
      .battlefield(BEARS)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).activate(SCOUT, { ability: 1, targets: [{ name: BEARS, seat: 0 }] });
    g.passAll();
    expect(walks(g, { name: BEARS, seat: 0 })).toEqual(['Swamp']);
  });

  test('no untapped Zombie, no activation', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SCOUT, { tapped: true })
      .battlefield(BEARS)
      .seat(1)
      .library(...LIBRARY)
      .build();
    expect(g.legalActions(0).some((a) => a.kind === 'activate')).toBe(false);
  });

  test('with two Zombies the controller chooses which one to tap, the source or the other', () => {
    const g = board();
    g.act(0).activate(SCOUT, { ability: 1, targets: [{ name: BEARS, seat: 0 }] });
    g.expect.pending('choosePermanent', 0);
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error('expected a choice');
    expect(d.purpose).toBe('tap');
    expect(d.forCost).toBe(true);
    expect(d.legal).toHaveLength(2);
    g.act(0).choosePermanents(SCOUT);
    g.expect.tapped(SCOUT, true);
    g.expect.tapped(ZOMBIE, false);
  });
});

describe('CR 305.6, 305.7: "Target land becomes a Swamp until end of turn."', () => {
  function board() {
    return scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SCOUT, 'Forest')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .build();
  }

  test('a Forest becomes a Swamp: its types are Swamp only, and it taps for {B}, not {G}', () => {
    const g = board();
    expect(subtypesOf(g, 'Forest')).toEqual(['Forest']);
    g.act(0).activate(SCOUT, { ability: 0, targets: ['Forest'] });
    g.passAll();
    expect(subtypesOf(g, 'Forest')).toEqual(['Swamp']);
    const obj = g.state.objects[g.id('Forest')];
    if (obj === undefined) throw new Error('no land');
    const mana = derive(g.state, obj).abilities.filter((a) => a.kind === 'mana');
    expect(mana).toEqual([
      { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['B'] } },
    ]);
    g.act(0).tapForMana('Forest');
    g.expect.pool(0, 'B');
  });

  test('it is still a land and still a basic one: no card type or supertype changes (CR 305.7)', () => {
    const g = board();
    g.act(0).activate(SCOUT, { ability: 0, targets: ['Forest'] });
    g.passAll();
    const obj = g.state.objects[g.id('Forest')];
    if (obj === undefined) throw new Error('no land');
    const d = derive(g.state, obj);
    expect(d.types).toEqual(['land']);
    expect(d.supertypes).toEqual(['basic']);
  });

  test('a nonbasic land with two land types loses them both and the abilities of its rules text', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SCOUT)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(DUAL)
      .build();
    expect([...subtypesOf(g, DUAL)].sort()).toEqual(['Island', 'Swamp']);
    g.act(0).activate(SCOUT, { ability: 0, targets: [DUAL] });
    g.passAll();
    expect(subtypesOf(g, DUAL)).toEqual(['Swamp']);
    const obj = g.state.objects[g.id(DUAL)];
    if (obj === undefined) throw new Error('no land');
    const mana = derive(g.state, obj).abilities.filter((a) => a.kind === 'mana');
    expect(mana).toHaveLength(1); // the printed {U} and {B} are gone, the Swamp's {B} came
  });

  test('it ends at the cleanup step: the land is a Forest again with its own ability (nothing needed undoing)', () => {
    const g = board();
    g.act(0).activate(SCOUT, { ability: 0, targets: ['Forest'] });
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    expect(subtypesOf(g, 'Forest')).toEqual(['Forest']);
    const obj = g.state.objects[g.id('Forest')];
    if (obj === undefined) throw new Error('no land');
    expect(derive(g.state, obj).abilities).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'mana' })]),
    );
  });

  test("the defending player's Forest that becomes a Swamp lets swampwalk through (the land type is read as it is now)", () => {
    // Seat 0 attacks with a Zombie given swampwalk by the Master; seat 1 controls only a Forest, which seat 0 turns into a Swamp.
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(MASTER, ZOMBIE, SCOUT)
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Forest', BEARS)
      .build();
    g.act(0).activate(SCOUT, { ability: 0, targets: [{ name: 'Forest', seat: 1 }] });
    g.act(0).choosePermanents(SCOUT);
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([ZOMBIE]);
    g.advanceTo('declareBlockers', { block: false });
    expect(canBlock(g, BEARS, ZOMBIE)).toBe(false);
    // Without the activation the same board lets the Bears block it.
    const h = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(MASTER, ZOMBIE, SCOUT)
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Forest', BEARS)
      .build();
    h.advanceTo('declareAttackers', { attack: false });
    h.act(0).attack([ZOMBIE]);
    h.advanceTo('declareBlockers', { block: false });
    expect(canBlock(h, BEARS, ZOMBIE)).toBe(true);
  });
});

describe('CR 305.7: what a land keeps and what it gains', () => {
  const landSpell = (name: string, effect: unknown) =>
    singleFace({
      name,
      manaCost: ['R'],
      types: ['instant'],
      colors: ['R'],
      colorIdentity: ['R'],
      oracleText: 'SYNTHETIC',
      spell: {
        targets: [{ id: 't1', what: { kind: 'object', filter: { types: ['land'] } } }],
        effect: effect as never,
      },
    });
  // "Lands you control have '{T}: Add {R}.'" (D-099): an ability another effect gives the land, in layer 6.
  const GIFT = singleFace({
    name: 'SYNTHETIC Test Red Lands',
    manaCost: ['R'],
    types: ['enchantment'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'SYNTHETIC',
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'grantAbility',
          subject: { kind: 'filter', filter: { types: ['land'], controller: 'you' } },
          ability: {
            kind: 'mana',
            cost: [{ kind: 'tap' }],
            production: { kind: 'fixed', mana: ['R'] },
          },
        },
      },
    ],
  });
  // "Target land becomes a Swamp in addition to its other land types until end of turn."
  const ALSO = landSpell('SYNTHETIC Test Also Swamp', {
    kind: 'setTypes',
    objects: { kind: 'target', id: 't1' },
    subtypes: ['Swamp'],
    additive: true,
    duration: 'untilEndOfTurn',
  });
  const manaOf = (g: ScenarioGame, card: string) => {
    const obj = g.state.objects[g.id(card)];
    if (obj === undefined) throw new Error('no land');
    return derive(g.state, obj).abilities.flatMap((a) =>
      a.kind === 'mana' && a.production.kind === 'fixed' ? [a.production.mana.join('')] : [],
    );
  };
  const game = () =>
    scenario()
      .seat(0)
      .define(ALSO)
      .library(...LIBRARY)
      .battlefield(SCOUT, 'Forest', 'Mountain', 'Mountain')
      .hand(ALSO.name)
      .seat(1)
      .library(...LIBRARY)
      .build();

  test('a land that is also a Swamp keeps its types and its own ability and gains the Swamp ability (additive)', () => {
    const g = game();
    expect(manaOf(g, 'Forest')).toEqual(['G']);
    g.act(0).cast(ALSO.name, { targets: ['Forest'], pay: true });
    g.passAll();
    expect(subtypesOf(g, 'Forest')).toEqual(['Forest', 'Swamp']);
    expect(manaOf(g, 'Forest')).toEqual(['G', 'B']);
  });

  test('an ability another effect gave the land stays when it becomes a Swamp (CR 305.7), whichever came first', () => {
    for (const giftFirst of [true, false]) {
      const g = scenario()
        .seat(0)
        .define(GIFT)
        .library(...LIBRARY)
        .battlefield(SCOUT, 'Forest', 'Mountain', ...(giftFirst ? [GIFT.name] : []))
        .hand(...(giftFirst ? [] : [GIFT.name]))
        .seat(1)
        .library(...LIBRARY)
        .build();
      const gift = () => {
        g.act(0).cast(GIFT.name, { pay: true });
        g.passAll();
      };
      g.act(0).activate(SCOUT, { ability: 0, targets: ['Forest'] });
      g.passAll();
      if (!giftFirst) gift();
      expect(subtypesOf(g, 'Forest'), `giftFirst ${giftFirst}`).toEqual(['Swamp']);
      expect(manaOf(g, 'Forest').sort(), `giftFirst ${giftFirst}`).toEqual(['B', 'R']);
    }
  });

  test('a second "becomes a Plains" replaces the Swamp: the latest effect wins (CR 613.7)', () => {
    const plains = landSpell('SYNTHETIC Test Make Plains', {
      kind: 'setTypes',
      objects: { kind: 'target', id: 't1' },
      subtypes: ['Plains'],
      duration: 'untilEndOfTurn',
    });
    const g = scenario()
      .seat(0)
      .define(plains)
      .library(...LIBRARY)
      .battlefield(SCOUT, 'Forest', 'Mountain')
      .hand(plains.name)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).activate(SCOUT, { ability: 0, targets: ['Forest'] });
    g.passAll();
    g.act(0).cast(plains.name, { targets: ['Forest'], pay: true });
    g.passAll();
    expect(subtypesOf(g, 'Forest')).toEqual(['Plains']);
    expect(manaOf(g, 'Forest')).toEqual(['W']);
  });

  test('a creature land keeps its creature types and its card types (CR 205.1a, 305.7)', () => {
    const dryad = singleFace({
      name: 'SYNTHETIC Test Dryad Land',
      manaCost: null,
      types: ['land', 'creature'],
      subtypes: ['Forest', 'Dryad'],
      colors: [],
      colorIdentity: ['G'],
      power: 1,
      toughness: 1,
      oracleText: 'SYNTHETIC',
      abilities: [
        { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['G'] } },
      ],
    });
    const g = scenario()
      .seat(0)
      .define(dryad)
      .library(...LIBRARY)
      .battlefield(SCOUT, dryad.name)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).activate(SCOUT, { ability: 0, targets: [dryad.name] });
    g.passAll();
    expect(subtypesOf(g, dryad.name)).toEqual(['Dryad', 'Swamp']);
    expect(manaOf(g, dryad.name)).toEqual(['B']);
    const obj = g.state.objects[g.id(dryad.name)];
    if (obj === undefined) throw new Error('no land');
    expect(derive(g.state, obj).types).toEqual(['land', 'creature']);
  });
});
