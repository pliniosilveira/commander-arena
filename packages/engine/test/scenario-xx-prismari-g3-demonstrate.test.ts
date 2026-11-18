// The Prismari deck (issue 87), group 3: Demonstrate (CR 702.144a, D-657), the keyword of Creative Technique and Replication Technique: "When you cast this spell, you may copy it and you may
// choose new targets for the copy. If you copy the spell, choose an opponent. That player copies the spell and may choose new targets for that copy." (SYNTHETIC Demo Bolt, "Demonstrate.
// ~ deals 2 damage to any target", src/cards/fixtures/synthetic-prismari-g3.ts.) Pins: CR 702.144a (the whole ability: the controller's copy, then the opponent's, only if the controller
// copied, each with new targets), CR 603.3b (the trigger goes on the stack above the spell), CR 707.10 and 707.10c (a copy is a spell that is not cast; new targets are chosen by the player the
// copy belongs to), CR 707.10a (a copy ceases to exist as it leaves the stack), CR 601.2i (no copy is cast: nothing "whenever you cast" sees it, and it is not counted for Storm).
import { describe, expect, test } from 'vitest';
import { type GameObject, getLegalActions, syntheticCard, validateCard } from '../src/index';
import type { ScenarioGame } from '../src/testing/index';
import { scenario } from '../src/testing/index';
import { confirmOptionalDecision, targetsDecision } from './pending-helpers';

const DEMO = 'SYNTHETIC Demo Bolt';
const TECHNIQUE = 'SYNTHETIC Reveal Technique';
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider'; // 2/4
const FILLER = ['Island', 'Island', 'Island', 'Island', 'Island', 'Island'] as const;

function game() {
  return scenario()
    .seat(0)
    .hand(DEMO, TECHNIQUE)
    .battlefield(BEARS, { label: 'mine' })
    .library(...FILLER)
    .pool('RRRRRRRR')
    .seat(1)
    .battlefield(SPIDER, { label: 'theirs' })
    .library(...FILLER)
    .at('precombatMain', { active: 0 })
    .build();
}

/** Casts the Demo Bolt at seat 1's face; the demonstrate trigger is on the stack above it. */
function castBolt(g: ScenarioGame) {
  g.act(0).cast(DEMO, { pay: true, targets: [{ player: 1 }] });
  return g;
}

const copies = (g: ScenarioGame): GameObject[] =>
  [...g.state.stack]
    .map((id) => g.state.objects[id])
    .filter((o): o is GameObject => o?.copyOf !== undefined);

describe('the cards are valid', () => {
  for (const name of [DEMO, TECHNIQUE]) {
    test(name, () => expect(validateCard(syntheticCard(name))).toEqual([]));
  }
});

describe('"When you cast this spell, you may copy it" (CR 702.144a, 603.3b)', () => {
  test('the trigger goes on the stack above the spell, and its controller is asked', () => {
    const g = castBolt(game());
    g.expect.stack([`${DEMO} (ability)`, DEMO]);
    g.passAll();
    expect(confirmOptionalDecision(g)).toMatchObject({ seat: 0 });
    g.expect.invariants();
  });

  test('declining: no copy, and the opponent does not copy either ("if you copy the spell")', () => {
    const g = castBolt(game());
    g.passAll();
    g.act(0).decline();
    expect(copies(g)).toHaveLength(0);
    g.expect.stack([DEMO]);
    g.expect.pending('priority', 0);
  });

  test('accepting: a copy of the spell is put onto the stack, and its controller may choose new targets for it', () => {
    const g = castBolt(game());
    g.passAll();
    g.act(0).accept();
    // The copy is on the stack with the original's target, and is asked for new targets (it can be aimed at the creatures, the players and itself being a spell it cannot).
    const d = targetsDecision(g);
    expect(d).toMatchObject({ seat: 0, forCopy: true });
    expect(copies(g)).toHaveLength(1);
    expect(copies(g)[0]?.controller).toBe(0);
    g.act(0).chooseTargets({ name: SPIDER, zone: 'battlefield', seat: 1 });
    // Then the opponent copies it, and chooses new targets for their copy.
    const theirs = targetsDecision(g);
    expect(theirs).toMatchObject({ seat: 1, forCopy: true });
    expect(copies(g)).toHaveLength(2);
    const opp = copies(g).find((c) => c.controller === 1);
    expect(opp?.owner).toBe(1);
    g.act(1).chooseTargets({ name: BEARS, zone: 'battlefield', seat: 0 });
    g.expect.invariants();
  });

  test('the copies resolve before the original, the opponent’s first (it was put on the stack last)', () => {
    const g = castBolt(game());
    g.passAll();
    g.act(0).accept();
    g.act(0).chooseTargets({ player: 1 });
    g.act(1).chooseTargets({ player: 0 });
    // The stack, from the bottom: the original, my copy, the opponent's copy (on top, so it resolves first).
    const order = [...g.state.stack].map((id) => g.state.objects[id]?.controller);
    expect(order).toEqual([0, 0, 1]);
    g.pass();
    g.pass();
    g.expect.life(0, 38); // the opponent's copy at me
    g.expect.life(1, 40);
    g.pass();
    g.pass();
    g.expect.life(1, 38); // my copy at them
    g.pass();
    g.pass();
    g.expect.life(1, 36); // the original
    expect(copies(g)).toHaveLength(0);
  });

  test('keeping the targets: each copy may be left aimed at the original’s target (CR 707.10c)', () => {
    const g = castBolt(game());
    g.passAll();
    g.act(0).accept();
    g.act(0).chooseTargets({ player: 1 });
    g.act(1).chooseTargets({ player: 1 });
    g.passAll();
    g.expect.life(1, 34);
  });

  test('the opponent’s copy is theirs: their copy, controlled by them, aimed at their own creature damages it', () => {
    const g = castBolt(game());
    g.passAll();
    g.act(0).accept();
    g.act(0).chooseTargets({ player: 1 });
    g.act(1).chooseTargets({ name: SPIDER, zone: 'battlefield', seat: 1 });
    g.pass();
    g.pass();
    expect(g.object({ name: SPIDER }).damage).toBe(2);
  });

  test('a copy is not cast: it triggers no "whenever you cast" and is no new cast of the keyword (no demonstrate loop)', () => {
    const g = castBolt(game());
    g.passAll();
    g.act(0).accept();
    g.act(0).chooseTargets({ player: 1 });
    g.act(1).chooseTargets({ player: 1 });
    // Only the one demonstrate trigger was ever on the stack: after it, the stack is the original and two copies.
    expect(g.state.stack).toHaveLength(3);
    expect(g.state.turnLog.castSpells.filter((c) => c.seat === 0)).toHaveLength(1);
  });

  test('each copy is a copy of the spell: the same card, the same damage', () => {
    const g = castBolt(game());
    g.passAll();
    g.act(0).accept();
    g.act(0).chooseTargets({ player: 1 });
    g.act(1).chooseTargets({ player: 1 });
    for (const c of copies(g)) {
      expect(c.copyOf).toBe(g.state.objects[g.state.stack.at(-1) as `o${number}`]?.copyOf);
      expect(c.card).toBeNull();
    }
  });

  test('a spell with no targets asks nothing about them: the two copies are made at once', () => {
    const g = game();
    g.act(0).cast(TECHNIQUE, { pay: true });
    g.passAll();
    g.act(0).accept();
    expect(g.state.pending?.kind).not.toBe('targets');
    expect(copies(g)).toHaveLength(2);
    g.expect.invariants();
  });

  test('the original is countered in response to the trigger: the copies are still made, from its last-known information (CR 113.7a)', () => {
    const g = scenario()
      .seat(0)
      .hand(DEMO)
      .library(...FILLER)
      .pool('RRRR')
      .seat(1)
      .hand('Counterspell')
      .battlefield('Island', { count: 2 })
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(DEMO, { pay: true, targets: [{ player: 1 }] });
    g.act(0).pass();
    g.act(1).cast('Counterspell', {
      pay: true,
      targets: [{ name: DEMO, zone: 'stack', seat: 0 }],
    });
    g.passAll();
    g.act(0).accept();
    g.act(0).chooseTargets({ player: 1 });
    g.act(1).chooseTargets({ player: 1 });
    expect(copies(g)).toHaveLength(2);
    g.passAll();
    // The two copies resolved and the original was countered: 2 + 2 damage.
    g.expect.life(1, 36);
    g.expect.zone(DEMO, 'graveyard', { seat: 0 });
  });

  test('only the opponent is asked about their copy: the controller has no legal action then', () => {
    const g = castBolt(game());
    g.passAll();
    g.act(0).accept();
    g.act(0).chooseTargets({ player: 1 });
    expect(getLegalActions(g.state, 0)).toEqual([]);
    expect(getLegalActions(g.state, 1).length).toBeGreaterThan(0);
  });

  test('a new target must be legal: the copy cannot be aimed at an illegal object', () => {
    const g = castBolt(game());
    g.passAll();
    g.act(0).accept();
    const d = targetsDecision(g);
    const legal = d.specs[0]?.legal ?? [];
    // Any target: the two players and the two creatures; nothing on the stack.
    expect(legal).toHaveLength(4);
  });
});
