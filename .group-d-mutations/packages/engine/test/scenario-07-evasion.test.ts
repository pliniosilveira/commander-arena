// Scenario 7 (SPEC 12): evasion. A creature with menace can't be blocked by just one creature. A
// creature with flying can only be blocked by creatures with flying or reach.
// Pins: CR 702.111b (Menace): a creature with menace can't be blocked except by two or more
// creatures. CR 702.9b (Flying): a creature with flying can't be blocked except by creatures with
// flying and/or reach. CR 702.17b (Reach): a creature with reach can block creatures with flying.
// CR 509.1a-b: the defending player chooses which creatures block, subject to the restrictions; a
// declaration that breaks one is illegal (CR 509.1b) and is refused (CR 733).
// Each rule is checked three ways: the engine rejects the illegal block, the decision does not offer
// it, and getLegalActions does not list it.
import { describe, expect, test } from 'vitest';
import { getLegalActions } from '../src/index';
import { scenario } from '../src/testing/index';

const MENACE = 'SYNTHETIC Menace 2/2';
const BEARS = 'Grizzly Bears';

type B = ReturnType<typeof scenario>;

function attacked(attackers: string[], seat1: (b: B) => void) {
  const b = scenario().seat(0);
  for (const a of attackers) b.battlefield(a);
  b.seat(1);
  seat1(b);
  const g = b.at('precombatMain', { active: 0 }).build();
  g.advanceTo('declareAttackers');
  g.act(0).attack(attackers);
  g.advanceTo('declareBlockers');
  return g;
}

describe('CR 702.111b: menace needs two or more blockers', () => {
  test('one blocker alone is refused by the engine and not listed as a legal action', () => {
    const g = attacked([MENACE], (b) => b.battlefield(BEARS, 'SYNTHETIC Vanilla 3/3'));
    const before = g.hash();
    g.expect.illegal(1, { declareBlockers: [{ blocker: `${BEARS}`, attacker: MENACE }] });
    expect(g.act(1).try.declareBlockers([{ blocker: BEARS, attacker: MENACE }])).toEqual({
      ok: false,
      error: 'A creature with menace needs two or more blockers',
    });
    g.expect.hash(before);
    // The legal list holds no single block of the menace creature, but does hold "no block".
    const legal = getLegalActions(g.state, 1);
    expect(legal.some((a) => a.kind === 'declareBlockers' && a.blocks.length === 0)).toBe(true);
    expect(legal.some((a) => a.kind === 'declareBlockers' && a.blocks.length === 1)).toBe(false);
  });

  test('the decision says menace needs two blockers', () => {
    const g = attacked([MENACE], (b) => b.battlefield(BEARS, 'SYNTHETIC Vanilla 3/3'));
    const d = g.state.pending;
    if (d?.kind !== 'declareBlockers') throw new Error('expected declareBlockers');
    expect(d.attackers).toEqual([
      { attacker: g.id(MENACE), target: { kind: 'player', seat: 1 }, minBlockers: 2 },
    ]);
  });

  test('two blockers are accepted, and so are three', () => {
    for (const blockers of [
      [BEARS, 'SYNTHETIC Vanilla 3/3'],
      [BEARS, 'SYNTHETIC Vanilla 3/3', 'SYNTHETIC Vanilla 2/2'],
    ]) {
      const g = attacked([MENACE], (b) => {
        for (const name of blockers) b.battlefield(name);
      });
      g.act(1).declareBlockers(blockers.map((blocker) => ({ blocker, attacker: MENACE })));
      g.expect.combat({
        blocked: [MENACE],
        blocks: blockers.map((blocker) => ({ blocker, attacker: MENACE })),
      });
    }
  });

  test('with only one creature able to block, the menace creature cannot be blocked at all', () => {
    const g = attacked([MENACE], (b) => b.battlefield(BEARS));
    g.expect.illegal(1, { declareBlockers: [{ blocker: BEARS, attacker: MENACE }] });
    g.act(1).noBlocks();
    g.expect.combat({ unblocked: [MENACE] });
    g.advanceTo('endOfCombat');
    g.expect.life(1, 38);
  });

  test('a lone blocker may block another attacker while the menace creature goes unblocked', () => {
    const g = attacked([MENACE, 'SYNTHETIC Vanilla 3/3'], (b) => b.battlefield(BEARS));
    g.act(1).declareBlockers([{ blocker: BEARS, attacker: 'SYNTHETIC Vanilla 3/3' }]);
    g.expect.combat({ blocked: ['SYNTHETIC Vanilla 3/3'], unblocked: [MENACE] });
  });

  test('the legal list offers a single block of an attacker without menace but not of the menace one', () => {
    const g = attacked([MENACE, 'SYNTHETIC Vanilla 3/3'], (b) => b.battlefield(BEARS));
    const single = getLegalActions(g.state, 1).flatMap((a) =>
      a.kind === 'declareBlockers' && a.blocks.length === 1 ? [a.blocks[0]?.attacker] : [],
    );
    expect(single).toEqual([g.id('SYNTHETIC Vanilla 3/3')]);
  });

  test('two blockers on a menace creature and one on another attacker in the same declaration', () => {
    const g = attacked([MENACE, 'SYNTHETIC Vanilla 3/3'], (b) =>
      b.battlefield(BEARS, 'SYNTHETIC Vanilla 2/2', 'SYNTHETIC Vanilla 5/5'),
    );
    g.expect.illegal(1, {
      declareBlockers: [
        { blocker: BEARS, attacker: MENACE },
        { blocker: 'SYNTHETIC Vanilla 5/5', attacker: 'SYNTHETIC Vanilla 3/3' },
      ],
    });
    g.act(1).declareBlockers([
      { blocker: BEARS, attacker: MENACE },
      { blocker: 'SYNTHETIC Vanilla 2/2', attacker: MENACE },
      { blocker: 'SYNTHETIC Vanilla 5/5', attacker: 'SYNTHETIC Vanilla 3/3' },
    ]);
    g.expect.combat({ blocked: [MENACE, 'SYNTHETIC Vanilla 3/3'] });
  });
});

describe('CR 702.9b and 702.17b: flying is blocked only by flying or reach', () => {
  const ANGEL = 'Serra Angel';
  const defenders = (b: B) =>
    b.battlefield(BEARS).battlefield('Giant Spider').battlefield('SYNTHETIC Flier 1/1');

  test('a creature with neither cannot block the flier: the engine rejects it, the decision and list omit it', () => {
    const g = attacked([ANGEL], defenders);
    const before = g.hash();
    g.expect.illegal(1, { declareBlockers: [{ blocker: BEARS, attacker: ANGEL }] });
    expect(g.act(1).try.declareBlockers([{ blocker: BEARS, attacker: ANGEL }])).toEqual({
      ok: false,
      // It has no legal block at all here, so it is not even a blocking candidate.
      error: 'That creature cannot block',
    });
    g.expect.hash(before);
    g.expect.canBlock(BEARS, ANGEL, false);
    const d = g.state.pending;
    if (d?.kind !== 'declareBlockers') throw new Error('expected declareBlockers');
    const blockersOfAngel = d.candidates
      .filter((c) => c.canBlock.includes(g.id(ANGEL)))
      .map((c) => c.blocker)
      .sort();
    expect(blockersOfAngel).toEqual([g.id('Giant Spider'), g.id('SYNTHETIC Flier 1/1')].sort());
    expect(d.candidates.find((c) => c.blocker === g.id(BEARS))).toBeUndefined();
    const listed = getLegalActions(g.state, 1).flatMap((a) =>
      a.kind === 'declareBlockers' ? a.blocks.map((b) => b.blocker) : [],
    );
    expect(listed).not.toContain(g.id(BEARS));
    expect(listed).toContain(g.id('Giant Spider'));
    expect(listed).toContain(g.id('SYNTHETIC Flier 1/1'));
  });

  test('reach blocks the flier (CR 702.17b)', () => {
    const g = attacked([ANGEL], defenders);
    g.expect.canBlock('Giant Spider', ANGEL);
    g.act(1).declareBlockers([{ blocker: 'Giant Spider', attacker: ANGEL }]);
    g.expect.combat({ blocked: [ANGEL] });
    g.advanceTo('endOfCombat');
    // The Angel's 4 damage is lethal to the 2/4 Spider; the Spider's 2 is marked on the Angel.
    g.expect.zone('Giant Spider', 'graveyard', { seat: 1 });
    g.expect.damage(ANGEL, 2);
  });

  test('flying blocks the flier (CR 702.9b)', () => {
    const g = attacked([ANGEL], defenders);
    g.expect.canBlock('SYNTHETIC Flier 1/1', ANGEL);
    g.act(1).declareBlockers([{ blocker: 'SYNTHETIC Flier 1/1', attacker: ANGEL }]);
    g.advanceTo('endOfCombat');
    g.expect.zone('SYNTHETIC Flier 1/1', 'graveyard', { seat: 1 });
  });

  test('a mixed double block of the flier is legal only if every blocker has flying or reach', () => {
    const g = attacked([ANGEL], defenders);
    g.expect.illegal(1, {
      declareBlockers: [
        { blocker: 'Giant Spider', attacker: ANGEL },
        { blocker: BEARS, attacker: ANGEL },
      ],
    });
    g.expect.legal(1, {
      declareBlockers: [
        { blocker: 'Giant Spider', attacker: ANGEL },
        { blocker: 'SYNTHETIC Flier 1/1', attacker: ANGEL },
      ],
    });
  });

  test('fliers and reach creatures may also block ground attackers', () => {
    const g = attacked(['SYNTHETIC Vanilla 3/3'], defenders);
    g.expect.canBlock('SYNTHETIC Flier 1/1', 'SYNTHETIC Vanilla 3/3');
    g.expect.canBlock('Giant Spider', 'SYNTHETIC Vanilla 3/3');
    g.expect.canBlock(BEARS, 'SYNTHETIC Vanilla 3/3');
  });

  test('when nothing on the ground can block the flier the engine does not even ask', () => {
    const g = scenario()
      .seat(0)
      .battlefield(ANGEL)
      .seat(1)
      .battlefield(BEARS, 'Wall of Stone')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(ANGEL);
    // Neither defender can block it: no declareBlockers decision (CR 509.1), priority instead.
    g.advanceTo('declareBlockers');
    g.expect.step('declareBlockers');
    g.expect.pending('priority', 0);
    g.advanceTo('endOfCombat');
    g.expect.life(1, 36);
  });

  test('the Angel has vigilance and flying: it stays untapped and flies over', () => {
    const g = scenario()
      .seat(0)
      .battlefield(ANGEL)
      .seat(1)
      .battlefield(BEARS)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(ANGEL);
    g.expect.tapped(ANGEL, false);
  });

  test('a ground blocker cannot block a flier even when it is the only attacker and the only creature', () => {
    const g = attacked([ANGEL, 'SYNTHETIC Vanilla 3/3'], (b) => b.battlefield(BEARS));
    g.expect.canBlock(BEARS, ANGEL, false);
    g.expect.canBlock(BEARS, 'SYNTHETIC Vanilla 3/3');
    // The Bears may block the other attacker, so the engine names the flier as the problem.
    expect(g.act(1).try.declareBlockers([{ blocker: BEARS, attacker: ANGEL }])).toEqual({
      ok: false,
      error: 'That creature cannot block that attacker',
    });
    g.act(1).declareBlockers([{ blocker: BEARS, attacker: 'SYNTHETIC Vanilla 3/3' }]);
    g.expect.combat({ unblocked: [ANGEL], blocked: ['SYNTHETIC Vanilla 3/3'] });
  });
});
