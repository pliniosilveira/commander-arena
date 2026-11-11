// "Equip commander {3}" and "protection from each color that's not in your commander's color identity" (D-259, the Bruna deck).
// Pins: CR 702.6c (an equip ability may further restrict its target: "Equip [quality]" can target only a creature the player controls that has the quality),
// CR 903.3 (a commander is a card a player designated), CR 903.4 (color identity), CR 903.4f (no commander: the quality is undefined and that part of the
// ability does nothing), CR 702.16b, 702.16e (protection from a color: can't be targeted by, damage from sources of that color is prevented), CR 702.16h,
// 702.16i ("protection from each ..." is one protection ability for each color of the set), CR 613.1f (layer 6: the keyword a static ability gives).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-plate.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { SYNTHETIC_PLATE_LIST } from '../src/cards/fixtures/synthetic-plate';
import { getLegalActions, validateCard } from '../src/index';
import { derive } from '../src/rules/derive';
import { protectedColors } from '../src/rules/protection';
import { definitionOf } from '../src/state/ops';
import { type ScenarioGame, scenario } from '../src/testing/index';

const PLATE = 'SYNTHETIC Plate Armor';
const BLADE = 'SYNTHETIC Red Blue Ward Blade';
const WARDER = 'SYNTHETIC Identity Warder';
const WU = 'SYNTHETIC White Blue Commander';
const COLORLESS = 'SYNTHETIC Colorless Commander';
const FIVE = 'SYNTHETIC Five Color Commander';
const BLACK = 'SYNTHETIC Black Partner';
const BEARS = 'Grizzly Bears';
const MURDER = 'Murder'; // black
const BOLT = 'Lightning Bolt'; // red
const UNSUMMON = 'Unsummon'; // blue

const colorsOf = (g: ScenarioGame, name: string): string[] =>
  [...protectedColors(g.state, g.object(name))].sort();

/** The indices of the two equip abilities among the derived abilities of the Plate: the commander one, then the any-creature one. */
function equipIndices(g: ScenarioGame): [number, number] {
  const abilities = derive(g.state, g.object(PLATE)).abilities;
  const at = abilities.flatMap((a, i) => (a.kind === 'activated' ? [i] : []));
  const [first, second] = at;
  if (first === undefined || second === undefined) throw new Error('two equip abilities');
  return [first, second];
}

/** The targets the engine offers for the equip ability `index` of the Plate; none when the ability is not offered (it has no legal target). */
function equipTargets(g: ScenarioGame, index: number): string[] {
  const offered = getLegalActions(g.state, 0).some(
    (a) => a.kind === 'activate' && a.object === g.id(PLATE) && a.abilityIndex === index,
  );
  if (!offered) return [];
  g.act(0).activate(PLATE, { ability: index });
  const d = g.state.pending;
  if (d?.kind !== 'targets') throw new Error('expected a target decision');
  return (d.specs[0]?.legal ?? []).flatMap((t) => {
    if (t.kind !== 'object') return [];
    const o = g.object(t.id);
    return [`${o.controller}:${o.card === null ? 'token' : definitionOf(g.state, o.card).name}`];
  });
}

describe('the fixtures are valid', () => {
  test.each(SYNTHETIC_PLATE_LIST.map((d) => d.name))('%s', (name) => {
    const def = SYNTHETIC_PLATE_LIST.find((d) => d.name === name);
    expect(def === undefined ? ['missing'] : validateCard(def)).toEqual([]);
  });
});

describe('"Equip commander {3}" can target only a commander (CR 702.6c, 903.3)', () => {
  const game = () =>
    scenario()
      .seat(0)
      .battlefield(PLATE, 'Forest', 'Forest', 'Forest', 'Forest', 'Forest')
      .battlefield(WU, { commander: true })
      .battlefield(BEARS)
      .seat(1)
      .battlefield('SYNTHETIC Vanilla 3/3')
      .build();

  test('the commander-only equip offers the commander and nothing else; the plain equip offers every creature of mine', () => {
    const g = game();
    const [onlyCommander, any] = equipIndices(g);
    expect(equipTargets(g, onlyCommander)).toEqual([`0:${WU}`]);
    const h = game();
    expect(equipTargets(h, any).sort()).toEqual([`0:${BEARS}`, `0:${WU}`]);
  });

  test('a creature that is not a commander is refused as a target of the commander equip', () => {
    const g = game();
    const [onlyCommander] = equipIndices(g);
    // the engine refuses the target choice itself (the offer test above shows the legal targets)
    expect(() =>
      g.act(0).activate(PLATE, { ability: onlyCommander, targets: [BEARS], pay: true }),
    ).toThrow(/rejected seat \d chooseTarget/);
  });

  test('equipping the commander pays {3}, attaches at resolution and gives +3/+3', () => {
    const g = scenario()
      .seat(0)
      .battlefield(PLATE, 'Forest', 'Forest', 'Forest')
      .battlefield(WU, { commander: true })
      .seat(1)
      .build();
    const [onlyCommander] = equipIndices(g);
    g.act(0).activate(PLATE, { ability: onlyCommander, targets: [WU], pay: true });
    g.passAll();
    g.expect.attached(PLATE, WU);
    g.expect.pt(WU, 5, 5);
    g.expect.invariants();
  });

  test('a creature that is not flagged as a commander is not one (CR 903.3: a card a player designated)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(PLATE, 'Forest', 'Forest', 'Forest')
      .battlefield(WU)
      .seat(1)
      .build();
    const [onlyCommander, any] = equipIndices(g);
    expect(equipTargets(g, onlyCommander)).toEqual([]);
    const h = scenario()
      .seat(0)
      .battlefield(PLATE, 'Forest', 'Forest', 'Forest', 'Forest', 'Forest')
      .battlefield(WU)
      .seat(1)
      .build();
    expect(equipTargets(h, any)).toEqual([`0:${WU}`]);
  });

  test('with no commander the commander equip has no target; the plain equip still works', () => {
    const g = scenario()
      .seat(0)
      .battlefield(PLATE, 'Forest', 'Forest', 'Forest', 'Forest', 'Forest')
      .battlefield(BEARS)
      .seat(1)
      .build();
    const [onlyCommander, any] = equipIndices(g);
    expect(equipTargets(g, onlyCommander)).toEqual([]);
    const h = scenario()
      .seat(0)
      .battlefield(PLATE, 'Forest', 'Forest', 'Forest', 'Forest', 'Forest')
      .battlefield(BEARS)
      .seat(1)
      .build();
    expect(equipTargets(h, any)).toEqual([`0:${BEARS}`]);
  });

  test("the opponent's commander I do not control is not a target; one I control is (CR 702.6c: a creature I control that is a commander)", () => {
    const theirs = scenario()
      .seat(0)
      .battlefield(PLATE, 'Forest', 'Forest', 'Forest')
      .seat(1)
      .battlefield(BLACK, { commander: true })
      .build();
    const [onlyCommander] = equipIndices(theirs);
    expect(equipTargets(theirs, onlyCommander)).toEqual([]);
    const stolen = scenario()
      .seat(0)
      .battlefield(PLATE, 'Forest', 'Forest', 'Forest')
      .seat(1)
      .battlefield(BLACK, { commander: true, controller: 0 })
      .build();
    expect(equipTargets(stolen, equipIndices(stolen)[0])).toEqual([`0:${BLACK}`]);
  });
});

describe('protection from each color that is not in the color identity of my commander (CR 903.4, 702.16h)', () => {
  test('a white and blue commander: protection from black, red and green, not from white or blue', () => {
    const g = scenario()
      .seat(0)
      .battlefield(WU, { commander: true })
      .battlefield(PLATE, { attachedTo: WU })
      .seat(1)
      .build();
    expect(colorsOf(g, WU)).toEqual(['B', 'G', 'R']);
  });

  test('without the Equipment attached there is no protection', () => {
    const g = scenario()
      .seat(0)
      .battlefield(WU, { commander: true })
      .battlefield(PLATE)
      .seat(1)
      .build();
    expect(colorsOf(g, WU)).toEqual([]);
  });

  test('a colorless commander: protection from all five colors', () => {
    const g = scenario()
      .seat(0)
      .battlefield(COLORLESS, { commander: true })
      .battlefield(PLATE, { attachedTo: COLORLESS })
      .seat(1)
      .build();
    expect(colorsOf(g, COLORLESS)).toEqual(['B', 'G', 'R', 'U', 'W']);
  });

  test('a five color commander: no protection at all', () => {
    const g = scenario()
      .seat(0)
      .battlefield(FIVE, { commander: true })
      .battlefield(PLATE, { attachedTo: FIVE })
      .seat(1)
      .build();
    expect(colorsOf(g, FIVE)).toEqual([]);
    g.expect.pt(FIVE, 5, 5);
  });

  test('no commander: the quality is undefined and that part does nothing (CR 903.4f), the +3/+3 stays', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BEARS)
      .battlefield(PLATE, { attachedTo: BEARS })
      .seat(1)
      .build();
    expect(colorsOf(g, BEARS)).toEqual([]);
    g.expect.pt(BEARS, 5, 5);
  });

  test('two commanders: the colors of both identities count (CR 903.4)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(WU, { commander: true })
      .command(BLACK, { commander: true })
      .battlefield(BEARS)
      .battlefield(PLATE, { attachedTo: BEARS })
      .seat(1)
      .build();
    expect(colorsOf(g, BEARS)).toEqual(['G', 'R']);
  });

  test("'your' is the controller of the Equipment, not of the creature: the opponent's creature gets my colors", () => {
    const g = scenario()
      .seat(0)
      .battlefield(WU, { commander: true })
      .battlefield(PLATE, { attachedTo: BEARS })
      .seat(1)
      .battlefield(BEARS)
      .command(BLACK, { commander: true })
      .build();
    expect(colorsOf(g, BEARS)).toEqual(['B', 'G', 'R']);
  });

  test('a creature that has it printed reads the commander of its own controller', () => {
    const mine = scenario()
      .seat(0)
      .command(WU, { commander: true })
      .battlefield(WARDER)
      .seat(1)
      .build();
    expect(colorsOf(mine, WARDER)).toEqual(['B', 'G', 'R']);
    const theirs = scenario()
      .seat(0)
      .seat(1)
      .command(BLACK, { commander: true })
      .battlefield(WARDER)
      .build();
    expect(colorsOf(theirs, WARDER)).toEqual(['G', 'R', 'U', 'W']);
  });
});

describe('the protection does what protection does (CR 702.16b, 702.16e)', () => {
  const game = () =>
    scenario()
      .seat(0)
      .command(WU, { commander: true })
      .battlefield(BEARS)
      .battlefield(PLATE, { attachedTo: BEARS })
      .seat(1)
      .hand(MURDER, BOLT, UNSUMMON)
      .battlefield('Swamp', 'Mountain', 'Island')
      .at('precombatMain', { active: 1, turn: 2 })
      .build();

  test('a black spell and a red spell cannot target it; a blue spell can', () => {
    const g = game();
    expect(() => g.act(1).cast(MURDER, { pay: true, targets: [BEARS] })).toThrow(
      /rejected seat 1 (castSpell|chooseTarget)/,
    );
    const h = game();
    expect(() => h.act(1).cast(BOLT, { pay: true, targets: [BEARS] })).toThrow(
      /rejected seat 1 (castSpell|chooseTarget)/,
    );
    const i = game();
    i.act(1).cast(UNSUMMON, { pay: true, targets: [BEARS] });
    i.passAll();
    i.expect.zone(BEARS, 'hand');
  });
});

describe('protection from named colors that a static ability gives (CR 702.16, 613.1f)', () => {
  test('protection from red and blue while equipped; none after it is unattached', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BEARS)
      .battlefield(BLADE, { attachedTo: BEARS })
      .seat(1)
      .build();
    expect(colorsOf(g, BEARS)).toEqual(['R', 'U']);
    const h = scenario().seat(0).battlefield(BEARS).battlefield(BLADE).seat(1).build();
    expect(colorsOf(h, BEARS)).toEqual([]);
  });
});

describe('the protection also prevents damage, blocks and unattaches (CR 702.16d, 702.16e, 702.16f)', () => {
  const RATS = 'Typhoid Rats'; // black 1/1 deathtouch
  const CURSE = 'SYNTHETIC Curse Aura'; // a black Aura
  const VANILLA = 'SYNTHETIC Vanilla 1/1'; // colorless

  test('a black creature cannot block it, a colorless one can (CR 702.16f)', () => {
    const attack = (blocker: string) => {
      const g = scenario()
        .seat(0)
        .command(WU, { commander: true })
        .battlefield(BEARS)
        .battlefield(PLATE, { attachedTo: BEARS })
        .seat(1)
        .battlefield(blocker)
        .at('precombatMain', { active: 0 })
        .build();
      g.advanceTo('declareAttackers');
      g.act(0).attack(BEARS);
      g.advanceTo('declareBlockers');
      return g;
    };
    const black = attack(RATS);
    expect(() => black.act(1).declareBlockers([{ blocker: RATS, attacker: BEARS }])).toThrow(
      /rejected seat 1/,
    );
    const colorless = attack(VANILLA);
    colorless.act(1).declareBlockers([{ blocker: VANILLA, attacker: BEARS }]);
  });

  test('damage from a black source is prevented: a deathtouch Rats deals no damage to it (CR 702.16e)', () => {
    const g = scenario()
      .seat(0)
      .command(WU, { commander: true })
      .battlefield(BEARS)
      .battlefield(PLATE, { attachedTo: BEARS })
      .seat(1)
      .battlefield(RATS)
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(1).attack(RATS);
    g.advanceTo('declareBlockers');
    g.act(0).declareBlockers([{ blocker: BEARS, attacker: RATS }]);
    g.passAll();
    g.expect.zone(BEARS, 'battlefield');
    g.expect.zone(RATS, 'graveyard');
    g.expect.invariants();
  });

  test('a black Aura attached to it falls off, a creature without the Plate keeps its Aura (CR 702.16d)', () => {
    const g = scenario()
      .seat(0)
      .command(WU, { commander: true })
      .battlefield(BEARS)
      .battlefield(PLATE, { attachedTo: BEARS })
      .seat(1)
      .battlefield(CURSE, { attachedTo: BEARS })
      .build();
    g.passAll(); // the state-based actions are checked when a player would receive priority
    g.expect.zone(CURSE, 'graveyard');
    const h = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Vanilla 5/5')
      .seat(1)
      .battlefield(CURSE, { attachedTo: 'SYNTHETIC Vanilla 5/5' })
      .build();
    h.passAll();
    h.expect.attached(CURSE, 'SYNTHETIC Vanilla 5/5');
  });
});
