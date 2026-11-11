// Scenario 5 (SPEC 12): trample and deathtouch. A 4/4 with trample and deathtouch blocked by a 5/5
// may assign 1 damage to the blocker and 3 to the player.
// Pins: CR 702.19b (Trample): the controller first assigns lethal damage to the blockers; the excess
// may then go to the player, planeswalker or battle the creature is attacking. Damage already marked
// on a blocker counts toward lethal. The controller need not assign lethal to every blocker, but then
// can't assign damage to what it attacks.
// CR 702.2c (Deathtouch): any nonzero amount of combat damage assigned by a deathtouch source is
// lethal damage for the purposes of determining if excess damage is being dealt.
// CR 702.19d: a trampler that is blocked, but has no blockers left when damage is assigned, assigns
// its damage to the player and/or planeswalker it attacks.
// CR 510.1c: lethal damage matters only for trample; with exactly one blocker a non-trampler (or a
// trampler without excess) assigns all its damage to it with no decision.
// CR 702.2b and 704.5h: a creature dealt damage by a deathtouch source is destroyed.
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';

const DT = 'SYNTHETIC Deathtouch Trampler 4/4';
const TR = 'SYNTHETIC Trampler 4/4';
const BIG = 'SYNTHETIC Vanilla 5/5';
const TWO = 'SYNTHETIC Vanilla 2/2';
const PW = 'SYNTHETIC Vanilla Planeswalker';
const BATTLE = 'SYNTHETIC Vanilla Battle';

type B = ReturnType<typeof scenario>;

/** Seat 0 attacks `target` (default the player) with `attacker`, blocked by `blockers` (seat 1). */
function blocked(
  attacker: string,
  blockers: { name: string; damage?: number }[],
  options: {
    target?: string;
    seat0?: (b: B) => void;
    seat1?: (b: B) => void;
  } = {},
) {
  const b = scenario().seat(0).battlefield(attacker).library('Island', { count: 3 });
  options.seat0?.(b);
  b.seat(1).library('Island', { count: 3 });
  for (const blk of blockers) b.battlefield(blk.name, blk.damage ? { damage: blk.damage } : {});
  options.seat1?.(b);
  const g = b.at('precombatMain', { active: 0 }).build();
  g.advanceTo('declareAttackers');
  g.act(0).attack(attacker, options.target);
  g.advanceTo('declareBlockers');
  return g;
}

function blockWith(g: ReturnType<typeof blocked>, attacker: string, ...names: string[]) {
  g.act(1).declareBlockers(names.map((blocker) => ({ blocker, attacker })));
  g.passAll();
}

describe('CR 702.19b and 702.2c: trample with deathtouch needs only 1 damage on the blocker', () => {
  test('the 4/4 deathtouch trampler blocked by a 5/5 assigns 1 to the blocker and 3 to the player', () => {
    const g = blocked(DT, [{ name: BIG }]);
    blockWith(g, DT, BIG);
    g.expect.pending('assignDamage', 0);
    const d = g.state.pending;
    if (d?.kind !== 'assignDamage') throw new Error('expected assignDamage');
    expect(d.choices[0]).toMatchObject({ power: 4, deathtouch: true, trample: true });
    // Deathtouch: 1 damage is lethal to a 5/5 for assignment purposes (CR 702.2c).
    expect(d.choices[0]?.blockers.map((b) => b.lethal)).toEqual([1]);
    g.act(0).assignDamage([
      { from: DT, to: BIG, amount: 1 },
      { from: DT, to: { player: 1 }, amount: 3 },
    ]);
    g.expect.life(1, 37);
    // The 5/5 is destroyed by deathtouch damage although it only has 1 damage marked...
    g.expect.zone(BIG, 'graveyard', { seat: 1 });
    // ...and it dealt its 5 damage to the 4/4 at the same moment.
    g.expect.zone(DT, 'graveyard', { seat: 0 });
  });

  test('the deathtouch trampler may still put all 4 on the blocker, or 2 and 2', () => {
    for (const [onBlocker, toPlayer] of [
      [4, 0],
      [2, 2],
    ] as const) {
      const g = blocked(DT, [{ name: BIG }]);
      blockWith(g, DT, BIG);
      g.act(0).assignDamage(
        toPlayer === 0
          ? [{ from: DT, to: BIG, amount: onBlocker }]
          : [
              { from: DT, to: BIG, amount: onBlocker },
              { from: DT, to: { player: 1 }, amount: toPlayer },
            ],
      );
      g.expect.life(1, 40 - toPlayer);
      g.expect.zone(BIG, 'graveyard', { seat: 1 });
    }
  });

  test('0 damage on the blocker and 4 to the player is refused: the blocker has not been assigned lethal damage', () => {
    const g = blocked(DT, [{ name: BIG }]);
    blockWith(g, DT, BIG);
    const before = g.hash();
    g.expect.illegal(0, { assignDamage: [{ from: DT, to: { player: 1 }, amount: 4 }] });
    const r = g.act(0).try.assignDamage([{ from: DT, to: { player: 1 }, amount: 4 }]);
    expect(r).toEqual({
      ok: false,
      error: 'Assign lethal damage to every blocker before trampling over',
    });
    g.expect.hash(before);
    g.expect.pending('assignDamage', 0);
  });

  test('two blockers: 1 to each (lethal by deathtouch) and 2 to the player', () => {
    const g = blocked(DT, [{ name: BIG }, { name: TWO }]);
    blockWith(g, DT, BIG, TWO);
    g.act(0).assignDamage([
      { from: DT, to: BIG, amount: 1 },
      { from: DT, to: TWO, amount: 1 },
      { from: DT, to: { player: 1 }, amount: 2 },
    ]);
    g.expect.life(1, 38);
    g.expect.zone(BIG, 'graveyard');
    g.expect.zone(TWO, 'graveyard');
  });

  test('two blockers: lethal on only one of them forbids damage to the player (CR 702.19b last sentence)', () => {
    const g = blocked(DT, [{ name: BIG }, { name: TWO }]);
    blockWith(g, DT, BIG, TWO);
    g.expect.illegal(0, {
      assignDamage: [
        { from: DT, to: BIG, amount: 1 },
        { from: DT, to: { player: 1 }, amount: 3 },
      ],
    });
    // Not assigning lethal to every blocker is allowed, but then nothing can go to the player.
    g.act(0).assignDamage([
      { from: DT, to: BIG, amount: 1 },
      { from: DT, to: TWO, amount: 3 },
    ]);
    g.expect.life(1, 40);
  });

  test('the default division is lethal to each blocker in order, the rest to the player', () => {
    const g = blocked(DT, [{ name: BIG }, { name: TWO }]);
    blockWith(g, DT, BIG, TWO);
    g.act(0).defaultDamage();
    g.expect.life(1, 38);
  });
});

describe('CR 702.19b: without deathtouch lethal damage must be assigned before trampling over', () => {
  test('a 4/4 trampler blocked by a 5/5 has no excess: all 4 go to the blocker without a decision', () => {
    const g = blocked(TR, [{ name: BIG }]);
    blockWith(g, TR, BIG);
    // The engine asks nothing: no choice exists (CR 510.1c, 702.19b).
    g.expect.step('combatDamage');
    g.expect.pending('priority', 0);
    g.expect.damage(BIG, 4);
    g.expect.life(1, 40);
  });

  test('a 4/4 trampler blocked by a 2/2: 2 on the blocker and 2 to the player is the minimum', () => {
    const g = blocked(TR, [{ name: TWO }]);
    blockWith(g, TR, TWO);
    const d = g.state.pending;
    if (d?.kind !== 'assignDamage') throw new Error('expected assignDamage');
    expect(d.choices[0]?.blockers.map((b) => b.lethal)).toEqual([2]);
    g.act(0).assignDamage([
      { from: TR, to: TWO, amount: 2 },
      { from: TR, to: { player: 1 }, amount: 2 },
    ]);
    g.expect.life(1, 38);
    g.expect.zone(TWO, 'graveyard');
  });

  test.each([
    [2, 2, true],
    [3, 1, true],
    [4, 0, true],
    [1, 3, false],
    [0, 4, false],
  ])(
    'trampler 4 power into a 2/2: %i on the blocker, %i to the player is %s',
    (onBlocker, toPlayer, ok) => {
      const g = blocked(TR, [{ name: TWO }]);
      blockWith(g, TR, TWO);
      const assignments = [
        ...(onBlocker > 0 ? [{ from: TR, to: TWO, amount: onBlocker }] : []),
        ...(toPlayer > 0 ? [{ from: TR, to: { player: 1 as const }, amount: toPlayer }] : []),
      ];
      const r = g.act(0).try.assignDamage(assignments);
      expect(r.ok).toBe(ok);
      if (ok) g.expect.life(1, 40 - toPlayer);
      else g.expect.pending('assignDamage', 0);
    },
  );

  test('damage already marked on the blocker counts toward lethal (CR 702.19b)', () => {
    const g = blocked(TR, [{ name: TWO, damage: 1 }]);
    blockWith(g, TR, TWO);
    const d = g.state.pending;
    if (d?.kind !== 'assignDamage') throw new Error('expected assignDamage');
    expect(d.choices[0]?.blockers.map((b) => b.lethal)).toEqual([1]);
    g.expect.illegal(0, { assignDamage: [{ from: TR, to: { player: 1 }, amount: 4 }] });
    g.act(0).assignDamage([
      { from: TR, to: TWO, amount: 1 },
      { from: TR, to: { player: 1 }, amount: 3 },
    ]);
    g.expect.life(1, 37);
  });

  test('marked damage also lowers the deathtouch-free lethal of a big blocker: a 5/5 with 3 damage needs 2', () => {
    const g = blocked(TR, [{ name: BIG, damage: 3 }]);
    blockWith(g, TR, BIG);
    const d = g.state.pending;
    if (d?.kind !== 'assignDamage') throw new Error('expected assignDamage');
    expect(d.choices[0]?.blockers.map((b) => b.lethal)).toEqual([2]);
    g.act(0).assignDamage([
      { from: TR, to: BIG, amount: 2 },
      { from: TR, to: { player: 1 }, amount: 2 },
    ]);
    g.expect.life(1, 38);
  });

  test('a non-trampler cannot put any damage on the player, however much excess it has', () => {
    const g = blocked('SYNTHETIC Vanilla 5/5', [{ name: TWO }, { name: 'SYNTHETIC Vanilla 1/1' }]);
    blockWith(g, 'SYNTHETIC Vanilla 5/5', TWO, 'SYNTHETIC Vanilla 1/1');
    g.expect.illegal(0, {
      assignDamage: [
        { from: 'SYNTHETIC Vanilla 5/5', to: TWO, amount: 2 },
        { from: 'SYNTHETIC Vanilla 5/5', to: 'SYNTHETIC Vanilla 1/1', amount: 1 },
        { from: 'SYNTHETIC Vanilla 5/5', to: { player: 1 }, amount: 2 },
      ],
    });
  });
});

describe('CR 702.19b: trample over a planeswalker or battle goes to what the creature attacks', () => {
  test('excess goes to the attacked planeswalker, not to the player', () => {
    const g = blocked(TR, [{ name: TWO }], {
      target: PW,
      seat1: (b) => b.battlefield(PW),
    });
    blockWith(g, TR, TWO);
    g.expect.illegal(0, {
      assignDamage: [
        { from: TR, to: TWO, amount: 2 },
        { from: TR, to: { player: 1 }, amount: 2 },
      ],
    });
    g.act(0).assignDamage([
      { from: TR, to: TWO, amount: 2 },
      { from: TR, to: PW, amount: 2 },
    ]);
    g.expect.counters(PW, { loyalty: 2 });
    g.expect.life(1, 40);
  });

  test('lethal damage to the blocker is still needed before the planeswalker gets any', () => {
    const g = blocked(TR, [{ name: TWO }], { target: PW, seat1: (b) => b.battlefield(PW) });
    blockWith(g, TR, TWO);
    g.expect.illegal(0, {
      assignDamage: [
        { from: TR, to: TWO, amount: 1 },
        { from: TR, to: PW, amount: 3 },
      ],
    });
  });

  test('enough excess removes all loyalty and the planeswalker goes to the graveyard', () => {
    const g = blocked(TR, [{ name: TWO }], {
      target: PW,
      seat1: (b) => b.battlefield(PW, { counters: { loyalty: 1 } }),
    });
    blockWith(g, TR, TWO);
    g.act(0).assignDamage([
      { from: TR, to: TWO, amount: 2 },
      { from: TR, to: PW, amount: 2 },
    ]);
    g.expect.zone(PW, 'graveyard', { seat: 1 });
    g.expect.life(1, 40);
  });

  test('excess goes to the attacked battle, not to the protector', () => {
    const g = blocked(TR, [{ name: TWO }], {
      target: BATTLE,
      seat0: (b) => b.battlefield(BATTLE),
    });
    blockWith(g, TR, TWO);
    g.expect.illegal(0, {
      assignDamage: [
        { from: TR, to: TWO, amount: 2 },
        { from: TR, to: { player: 1 }, amount: 2 },
      ],
    });
    g.act(0).assignDamage([
      { from: TR, to: TWO, amount: 2 },
      { from: TR, to: BATTLE, amount: 2 },
    ]);
    g.expect.counters(BATTLE, { defense: 3 });
    g.expect.life(1, 40);
  });

  test('a creature attacking a planeswalker cannot assign to the player even if the other permanent has no loyalty left to take it', () => {
    const g = blocked(TR, [{ name: TWO }], {
      target: PW,
      seat1: (b) => b.battlefield(PW, { counters: { loyalty: 1 } }),
    });
    blockWith(g, TR, TWO);
    // 2 to the blocker, 2 to a planeswalker that only has 1 loyalty: the extra damage is wasted.
    g.act(0).assignDamage([
      { from: TR, to: TWO, amount: 2 },
      { from: TR, to: PW, amount: 2 },
    ]);
    g.expect.life(1, 40);
  });
});

describe('CR 702.19d: a trampler whose blockers are all gone assigns to what it attacks', () => {
  /** Seat 0 holds Lightning Bolt and Mountains to remove the blocker after blocks. */
  function boltedBlocker(target?: string, seat1?: (b: B) => void) {
    return blocked(TR, [{ name: TWO }], {
      ...(target === undefined ? {} : { target }),
      seat0: (b) => b.battlefield('Mountain').hand('Lightning Bolt'),
      ...(seat1 === undefined ? {} : { seat1 }),
    });
  }

  test('blocked by a creature that is removed: all 4 damage goes to the player, no decision', () => {
    const g = boltedBlocker();
    g.act(1).declareBlockers([{ blocker: TWO, attacker: TR }]);
    g.act(0).cast('Lightning Bolt', { targets: [TWO], pay: true });
    g.passAll();
    g.expect.zone(TWO, 'graveyard', { seat: 1 });
    g.expect.combat({ blocked: [TR] });
    g.passAll();
    g.expect.step('combatDamage');
    g.expect.life(1, 36);
  });

  test('the same when it attacks a planeswalker: all 4 go to the planeswalker, none to the player', () => {
    const g = boltedBlocker(PW, (b) => b.battlefield(PW));
    g.act(1).declareBlockers([{ blocker: TWO, attacker: TR }]);
    g.act(0).cast('Lightning Bolt', { targets: [TWO], pay: true });
    g.passAll();
    g.passAll();
    g.expect.zone(PW, 'graveyard', { seat: 1 });
    g.expect.life(1, 40);
  });
});

describe('deathtouch without trample (CR 702.2b)', () => {
  test('Typhoid Rats blocking a 5/5 destroys it with 1 damage', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BIG)
      .seat(1)
      .battlefield('Typhoid Rats')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(BIG);
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([{ blocker: 'Typhoid Rats', attacker: BIG }]);
    g.advanceTo('endOfCombat');
    g.expect.zone(BIG, 'graveyard', { seat: 0 });
    g.expect.zone('Typhoid Rats', 'graveyard', { seat: 1 });
  });
});
