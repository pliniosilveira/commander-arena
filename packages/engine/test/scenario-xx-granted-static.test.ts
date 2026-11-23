// A static ability that gives other permanents a static "+N/+N" ability and equip abilities (the shape of "Treasures you control are Equipment in addition to their other types
// and have 'Equipped creature gets +2/+0,' equip Pirate {1}, and equip {3}"). Pins: CR 613.1d (the type is added in layer 4), 613.1f (the abilities are given in layer 6, in
// timestamp order with "loses all abilities"), 613.4c (what the granted ability does is applied in layer 7c), 702.6a and 702.6c (equip and its restriction), 301.5 and 704.5p
// (a permanent that is no longer an Equipment becomes unattached). Cards are SYNTHETIC (src/cards/fixtures/synthetic-granted-statics.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { derive } from '../src/rules/derive';
import { twoSeatGame } from './two-seat-helpers';

const CUTTER = 'SYNTHETIC Gem Cutter'; // 1/3 Orc Pirate
const FIND = 'SYNTHETIC Coin Find'; // instant: create a Treasure token
const BLANK = 'SYNTHETIC Blank Slate'; // instant: target permanent loses all abilities until end of turn
const BEARS = 'Grizzly Bears'; // 2/2 Bear
const TREASURE = 'Treasure';
const MOUNTAINS = ['Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain'] as const;

type Game = ReturnType<typeof twoSeatGame>;

/** Seat 0 controls the Cutter, Bears and a Treasure it has just made. */
const board = (extra: readonly string[] = [], hand: readonly string[] = []) => {
  const g = twoSeatGame((b) =>
    b.battlefield(CUTTER, BEARS, ...MOUNTAINS, 'Island', ...extra).hand(FIND, ...hand),
  );
  g.act(0).cast(FIND, { pay: true });
  g.passAll();
  return g;
};

const abilitiesOf = (g: Game, card: string) => derive(g.state, g.object(card)).abilities;

/** The index of the granted equip ability with this generic cost among the derived abilities of the Treasure. */
const equipIndex = (g: Game, generic: string) =>
  abilitiesOf(g, TREASURE).findIndex(
    (a) =>
      a.kind === 'activated' &&
      a.equip === true &&
      a.cost.some((c) => c.kind === 'mana' && c.symbols.includes(generic)),
  );

const equip = (g: Game, generic: string, to: string) =>
  g.act(0).activate(TREASURE, { ability: equipIndex(g, generic), targets: [to], pay: true });

describe('permanents given a type, a static "+N/+N" ability and equip abilities by another permanent', () => {
  test('the Treasure is an Equipment as well and has the two equip abilities (CR 613.1d, 613.1f, 702.6a)', () => {
    const g = board();
    g.expect.derived(TREASURE, { subtypes: ['Treasure', 'Equipment'], types: ['artifact'] });
    expect(equipIndex(g, '1')).toBeGreaterThanOrEqual(0);
    expect(equipIndex(g, '3')).toBeGreaterThanOrEqual(0);
    expect(
      abilitiesOf(g, TREASURE).filter((a) => a.kind === 'static' && a.static.kind === 'modifyPt'),
    ).toHaveLength(1);
  });

  test('equipped, the creature gets what the granted static ability says (CR 613.4c)', () => {
    const g = board();
    g.expect.pt(BEARS, 2, 2);
    equip(g, '3', BEARS);
    g.passAll();
    g.expect.attached(TREASURE, BEARS);
    g.expect.pt(BEARS, 4, 2);
    g.expect.pt(CUTTER, 1, 3);
    g.expect.invariants();
  });

  test('"equip Pirate {1}" may target only a Pirate (CR 702.6c)', () => {
    const g = board();
    const pirate = equipIndex(g, '1');
    expect(g.act(0).try.activate(TREASURE, { ability: pirate }).ok).toBe(true);
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected the targets question, got ${d?.kind}`);
    expect(JSON.stringify(d)).toContain(g.object(CUTTER).id);
    expect(JSON.stringify(d)).not.toContain(g.object(BEARS).id);
    g.act(0).cancel();
    g.act(0).activate(TREASURE, { ability: pirate, targets: [CUTTER], pay: true });
    g.passAll();
    g.expect.attached(TREASURE, CUTTER);
    g.expect.pt(CUTTER, 3, 3);
  });

  test('an unattached Treasure gives nothing, and an opponent’s Treasure is not changed', () => {
    const g = twoSeatGame(
      (b) => b.battlefield(CUTTER, BEARS),
      (b) => b.battlefield('Mountain').hand(FIND),
    );
    g.expect.pt(BEARS, 2, 2);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(1).cast(FIND, { pay: true });
    g.passAll();
    g.expect.derived(TREASURE, { subtypes: ['Treasure'] });
    expect(abilitiesOf(g, TREASURE).some((a) => a.kind === 'activated' && a.equip === true)).toBe(
      false,
    );
  });

  test('when the permanent that gives them leaves, the Treasure is no Equipment, becomes unattached and gives nothing (CR 704.5p)', () => {
    const g = board(['Swamp', 'Swamp'], ['Murder']);
    equip(g, '3', BEARS);
    g.passAll();
    g.expect.pt(BEARS, 4, 2);
    g.act(0).cast('Murder', { targets: [CUTTER], pay: true });
    g.passAll();
    g.expect.zone(CUTTER, 'graveyard', { seat: 0 });
    g.expect.derived(TREASURE, { subtypes: ['Treasure'] });
    g.expect.attached(TREASURE, null);
    g.expect.pt(BEARS, 2, 2);
    g.expect.invariants();
  });

  test('a Treasure that loses all abilities after it was given them gives nothing, though it stays attached (CR 613.1f, 613.7)', () => {
    const g = board([], [BLANK]);
    equip(g, '3', BEARS);
    g.passAll();
    g.act(0).cast(BLANK, { targets: [TREASURE], pay: true });
    g.passAll();
    g.expect.attached(TREASURE, BEARS); // still an Equipment: the type is layer 4
    g.expect.derived(TREASURE, { subtypes: ['Treasure', 'Equipment'] });
    g.expect.pt(BEARS, 2, 2);
  });

  test('the permanent that gives them losing all its abilities takes them away (CR 613.1f)', () => {
    const g = board([], [BLANK]);
    equip(g, '3', BEARS);
    g.passAll();
    g.act(0).cast(BLANK, { targets: [CUTTER], pay: true });
    g.passAll();
    g.expect.pt(BEARS, 2, 2);
    g.expect.derived(TREASURE, { subtypes: ['Treasure'] });
  });

  test('two permanents that give the ability give two instances of it (CR 613.1f)', () => {
    const g = twoSeatGame((b) => b.battlefield(CUTTER, CUTTER, BEARS, ...MOUNTAINS).hand(FIND));
    g.act(0).cast(FIND, { pay: true });
    g.passAll();
    equip(g, '3', BEARS);
    g.passAll();
    g.expect.pt(BEARS, 6, 2);
  });

  test('the Treasure can still be sacrificed for mana while attached, and its bonus goes with it', () => {
    const g = board();
    equip(g, '3', BEARS);
    g.passAll();
    g.act(0).tapForMana(TREASURE, { color: 'R' });
    g.expect.zone(TREASURE, 'battlefield', { count: 0 });
    g.expect.pt(BEARS, 2, 2);
    g.expect.invariants();
  });
});
