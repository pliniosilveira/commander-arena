// Who may attack, and what attacking does to the attacker.
// Pins: CR 508.1a (Declare Attackers Step): only untapped creatures may be declared as attackers.
// CR 302.6 (Creatures): a creature can't attack unless its controller has controlled it continuously
// since their most recent turn began, and its {T} abilities have the same condition; CR 702.10b
// (Haste) lifts both. CR 702.3b (Defender): a creature with defender can't attack. CR 508.1f and
// 702.20b (Vigilance): attacking causes the attacker to tap unless it has vigilance. CR 506.3: only a
// creature can attack. CR 509.1a: summoning sickness does not restrict blocking, and blocking does
// not tap the blocker.
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';

const BEARS = 'Grizzly Bears';

type B = ReturnType<typeof scenario>;

function atAttackers(seat0: (b: B) => void, seat1: (b: B) => void = () => {}) {
  const b = scenario().seat(0).library('Island', { count: 4 });
  seat0(b);
  b.seat(1).library('Island', { count: 4 });
  seat1(b);
  const g = b.at('precombatMain', { active: 0 }).build();
  g.advanceTo('declareAttackers');
  return g;
}

describe('summoning sickness and haste (CR 302.6, 702.10b)', () => {
  test('a creature that came under its controller control this turn cannot attack', () => {
    const g = atAttackers((b) => b.battlefield(BEARS, { fresh: true }).battlefield('Serra Angel'));
    g.expect.canAttack(BEARS, false);
    g.expect.canAttack('Serra Angel', true);
    const before = g.hash();
    expect(g.act(0).try.declareAttackers([{ attacker: BEARS }])).toEqual({
      ok: false,
      error: 'That creature cannot attack',
    });
    g.expect.hash(before);
  });

  test('a creature with haste can attack the turn it came under control', () => {
    const g = atAttackers((b) => b.battlefield('Raging Goblin', { fresh: true }));
    g.expect.canAttack('Raging Goblin');
    g.act(0).attack('Raging Goblin');
    g.advanceTo('endOfCombat');
    g.expect.life(1, 39);
  });

  test('a creature that arrives this turn can attack on its controller next turn', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BEARS, { fresh: true })
      .library('Island', { count: 4 })
      .seat(1)
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.expect.canAttack(BEARS, false);
    g.advanceTo('declareAttackers', { turn: 5 });
    g.expect.pending('declareAttackers', 0);
    g.expect.canAttack(BEARS, true);
  });

  test('a creature of the other player cannot be declared even when it could attack on its own turn', () => {
    const g = atAttackers(
      (b) => b.battlefield(BEARS),
      (b) => b.battlefield('Serra Angel'),
    );
    const angel = g.object({ name: 'Serra Angel', seat: 1 }).id;
    const before = g.hash();
    const r = g.act(0).try.action({
      kind: 'declareAttackers',
      attacks: [{ attacker: angel, target: { kind: 'player', seat: 1 } }],
    });
    expect(r).toEqual({ ok: false, error: 'That creature cannot attack' });
    g.expect.hash(before);
  });
});

describe('mana creatures and summoning sickness (CR 302.6, 702.10b)', () => {
  test('Llanowar Elves, in play since the turn began, can attack; once tapped by attacking it cannot make mana', () => {
    const g = atAttackers((b) => b.battlefield('Llanowar Elves'));
    g.expect.canAttack('Llanowar Elves');
    g.act(0).attack('Llanowar Elves');
    g.expect.tapped('Llanowar Elves');
    g.expect.illegal(0, { tap: 'Llanowar Elves' });
  });

  test('a fresh Llanowar Elves can neither attack nor tap for mana', () => {
    const g = atAttackers((b) => b.battlefield('Llanowar Elves', { fresh: true }));
    g.expect.canAttack('Llanowar Elves', false);
    g.expect.illegal(0, { tap: 'Llanowar Elves' });
  });

  test('a fresh mana creature with haste can tap for mana (CR 302.6, 702.10b) and can attack', () => {
    const tap = scenario().seat(0).battlefield('SYNTHETIC Hasty Mana Elf', { fresh: true }).build();
    tap.expect.legal(0, { tap: 'SYNTHETIC Hasty Mana Elf' });
    tap.act(0).tapForMana('SYNTHETIC Hasty Mana Elf');
    tap.expect.pool(0, 'G');
    const g = atAttackers((b) => b.battlefield('SYNTHETIC Hasty Mana Elf', { fresh: true }));
    g.expect.canAttack('SYNTHETIC Hasty Mana Elf');
  });

  test('a mana creature that blocks is not tapped, and a fresh one may block (CR 509.1a)', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Vanilla 3/3')
      .seat(1)
      .battlefield('Llanowar Elves', { fresh: true })
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack('SYNTHETIC Vanilla 3/3');
    g.advanceTo('declareBlockers');
    g.expect.canBlock('Llanowar Elves', 'SYNTHETIC Vanilla 3/3');
    g.act(1).declareBlockers([{ blocker: 'Llanowar Elves', attacker: 'SYNTHETIC Vanilla 3/3' }]);
    g.expect.tapped('Llanowar Elves', false);
  });
});

describe('defender, tapped creatures and non-creatures', () => {
  test('a creature with defender cannot attack, but can block', () => {
    const g = atAttackers((b) => b.battlefield('Wall of Stone').battlefield(BEARS));
    g.expect.canAttack('Wall of Stone', false);
    g.expect.canAttack(BEARS, true);
    const wall = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Vanilla 3/3')
      .seat(1)
      .battlefield('Wall of Stone')
      .at('precombatMain', { active: 0 })
      .build();
    wall.advanceTo('declareAttackers');
    wall.act(0).attack('SYNTHETIC Vanilla 3/3');
    wall.advanceTo('declareBlockers');
    wall.expect.canBlock('Wall of Stone', 'SYNTHETIC Vanilla 3/3');
  });

  test('a tapped creature cannot attack', () => {
    const g = atAttackers((b) => b.battlefield(BEARS, { tapped: true }).battlefield('Serra Angel'));
    g.expect.canAttack(BEARS, false);
    g.expect.canAttack('Serra Angel');
  });

  test('a tapped creature cannot block either (CR 509.1a)', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Vanilla 3/3')
      .seat(1)
      .battlefield(BEARS, { tapped: true })
      .battlefield('SYNTHETIC Vanilla 2/2')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack('SYNTHETIC Vanilla 3/3');
    g.advanceTo('declareBlockers');
    g.expect.canBlock(BEARS, 'SYNTHETIC Vanilla 3/3', false);
    g.expect.canBlock('SYNTHETIC Vanilla 2/2', 'SYNTHETIC Vanilla 3/3');
  });

  test('only creatures are candidates: lands, planeswalkers and battles are not (CR 506.3)', () => {
    const g = atAttackers((b) =>
      b
        .battlefield('Forest')
        .battlefield('SYNTHETIC Vanilla Planeswalker')
        .battlefield('SYNTHETIC Vanilla Battle')
        .battlefield(BEARS),
    );
    const d = g.state.pending;
    if (d?.kind !== 'declareAttackers') throw new Error('expected declareAttackers');
    expect(d.candidates.map((c) => c.attacker)).toEqual([g.id(BEARS)]);
    for (const name of ['Forest', 'SYNTHETIC Vanilla Planeswalker', 'SYNTHETIC Vanilla Battle']) {
      g.expect.illegal(0, { declareAttackers: [{ attacker: name }] });
    }
  });

  test('the candidates are exactly the untapped, unsick, non-defender creatures', () => {
    const g = atAttackers((b) =>
      b
        .battlefield(BEARS)
        .battlefield('Serra Angel')
        .battlefield('Wall of Stone')
        .battlefield('SYNTHETIC Vanilla 3/3', { tapped: true })
        .battlefield('SYNTHETIC Vanilla 2/2', { fresh: true })
        .battlefield('Raging Goblin', { fresh: true }),
    );
    const d = g.state.pending;
    if (d?.kind !== 'declareAttackers') throw new Error('expected declareAttackers');
    expect(d.candidates.map((c) => c.attacker).sort()).toEqual(
      [g.id(BEARS), g.id('Serra Angel'), g.id('Raging Goblin')].sort(),
    );
    for (const c of d.candidates) expect(c.targets).toEqual([{ kind: 'player', seat: 1 }]);
  });
});

describe('attacking taps the attacker unless it has vigilance (CR 508.1f, 702.20b)', () => {
  test('an attacker without vigilance taps, and a vigilant one does not', () => {
    const g = atAttackers((b) => b.battlefield(BEARS).battlefield('Serra Angel'));
    g.act(0).attack([BEARS, 'Serra Angel']);
    g.expect.tapped(BEARS);
    g.expect.tapped('Serra Angel', false);
    g.expect.combat({ attackers: [BEARS, 'Serra Angel'] });
  });

  test('only the creatures that attack tap', () => {
    const g = atAttackers((b) => b.battlefield(BEARS).battlefield('SYNTHETIC Vanilla 3/3'));
    g.act(0).attack(BEARS);
    g.expect.tapped(BEARS);
    g.expect.tapped('SYNTHETIC Vanilla 3/3', false);
  });

  test('a vigilant attacker that is untapped can attack again next turn and still be blocked normally', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Serra Angel')
      .library('Island', { count: 4 })
      .seat(1)
      .battlefield('Giant Spider')
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack('Serra Angel');
    g.advanceTo('declareBlockers');
    g.act(1).noBlocks();
    g.advanceTo('endOfCombat');
    g.expect.tapped('Serra Angel', false);
    g.expect.life(1, 36);
  });

  test('a tapping attacker untaps in its controller untap step (CR 502.3)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BEARS)
      .library('Island', { count: 4 })
      .seat(1)
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(BEARS);
    g.advanceTo('end');
    g.expect.tapped(BEARS);
    g.advanceTo('upkeep', { turn: 5 });
    g.expect.tapped(BEARS, false);
  });

  test('the tapped event is emitted for each attacker that taps', () => {
    const g = atAttackers((b) => b.battlefield(BEARS).battlefield('Serra Angel'));
    const mark = g.mark();
    g.act(0).attack([BEARS, 'Serra Angel']);
    const tapped = g.eventsSince(mark).filter((e) => e.kind === 'tapped');
    expect(tapped).toEqual([{ kind: 'tapped', object: g.id(BEARS) }]);
  });
});
