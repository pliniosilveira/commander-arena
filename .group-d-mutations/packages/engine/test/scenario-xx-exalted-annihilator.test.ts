// Exalted (CR 702.83a) and Annihilator N (CR 702.86a), triggered abilities that `derive` expands from their
// keywords (D-104, D-110).
// Pins: CR 702.83a, 702.83b and 506.5 (a creature attacks alone if it is the only creature declared as an
// attacker), CR 702.83a (the creature that attacked gets +1/+1, not the permanent with exalted), CR 603.2c
// (one trigger per instance and per attack), CR 603.3b (identical triggers need no ordering), CR 611.2a
// (until end of turn), CR 702.86a and 702.86b (each instance triggers separately), CR 508.5 (the defending
// player is the player the creature attacks, or the controller of the planeswalker it attacks), CR 701.21a
// (a player sacrifices only permanents they control, of their choice), CR 608.2d (the choice is made on
// resolution). Cards are SYNTHETIC (src/cards/fixtures/synthetic-keywords.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { type Action, applyAction, getLegalActions } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { choosePermanentDecision } from './pending-helpers';

const SQUIRE = 'SYNTHETIC Exalted Squire'; // 1/1 {W}, Exalted
const BANNER = 'SYNTHETIC Exalted Banner'; // enchantment {2}{W}, Exalted
const TITAN = 'SYNTHETIC Annihilator Titan'; // 5/5 {6}, Annihilator 2
const IMP = 'SYNTHETIC Eater Imp'; // 2/3 {3}{B}, Annihilator 1
const BEARS = 'Grizzly Bears';
const ELVES = 'Llanowar Elves';
const WALKER = 'SYNTHETIC Vanilla Planeswalker';

function attackWith(g: ScenarioGame, ...attackers: string[]): ScenarioGame {
  g.advanceTo('declareAttackers', { attack: false });
  g.act(0).attack(attackers);
  return g;
}

describe('CR 702.83a (Exalted): a creature you control attacks alone', () => {
  test('one attacker: the trigger goes on the stack, resolves, and the attacker is 2/2 until end of turn', () => {
    const g = scenario()
      .seat(0)
      .battlefield(SQUIRE)
      .library('Island', 'Island')
      .seat(1)
      .library('Island', 'Island')
      .build();
    attackWith(g, SQUIRE);
    g.expect.stack([`${SQUIRE} (ability)`]);
    g.passAll();
    g.expect.pt(SQUIRE, 2, 2);
    g.advanceTo('postcombatMain');
    g.expect.life(1, 38);
    // It wears off at the cleanup step (CR 514.2).
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.pt(SQUIRE, 1, 1);
  });

  test('two attackers: nobody attacks alone, so nothing triggers', () => {
    const g = scenario().seat(0).battlefield(SQUIRE, BEARS).seat(1).build();
    attackWith(g, SQUIRE, BEARS);
    // Nothing triggered at all: no waiting trigger and no ordering question either.
    expect(g.state.pendingTriggers).toHaveLength(0);
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.stack([]);
    g.expect.pt(SQUIRE, 1, 1);
    g.expect.pt(BEARS, 2, 2);
  });

  test('the creature that attacked gets it, whichever creature or permanent has exalted', () => {
    const g = scenario().seat(0).battlefield(SQUIRE, BEARS, BANNER).seat(1).build();
    attackWith(g, BEARS);
    // The Squire and the Banner both have it: two triggers for the Bears, which are identical, so the
    // controller is not asked to order them (CR 603.3b).
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.stack([`${SQUIRE} (ability)`, `${BANNER} (ability)`].sort() as never);
    g.passAll();
    g.expect.pt(BEARS, 4, 4);
    g.expect.pt(SQUIRE, 1, 1);
  });

  test('exalted of the opponent does not trigger for your attacker, and yours not for theirs', () => {
    const g = scenario().seat(0).battlefield(BEARS).seat(1).battlefield(SQUIRE).build();
    attackWith(g, BEARS);
    expect(g.state.pendingTriggers).toHaveLength(0);
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.stack([]);
    const h = scenario()
      .seat(0)
      .battlefield(SQUIRE)
      .seat(1)
      .battlefield(BEARS)
      .at('precombatMain', { active: 1 })
      .build();
    h.advanceTo('declareAttackers', { attack: false });
    h.act(1).attack(BEARS);
    expect(h.state.pendingTriggers).toHaveLength(0);
    expect(h.state.pending?.kind).toBe('priority');
    h.expect.stack([]);
  });

  test('two instances of exalted on one permanent are two triggers (CR 702.83a: each instance)', () => {
    const g = scenario()
      .seat(0)
      .define(
        singleFace({
          name: 'SYNTHETIC Test Double Exalted',
          manaCost: ['W'],
          types: ['creature'],
          colors: ['W'],
          colorIdentity: ['W'],
          power: 1,
          toughness: 1,
          oracleText: 'Exalted. Exalted.',
          abilities: [
            { kind: 'keyword', keyword: { kind: 'exalted' } },
            { kind: 'keyword', keyword: { kind: 'exalted' } },
          ],
        }),
      )
      .battlefield('SYNTHETIC Test Double Exalted')
      .seat(1)
      .build();
    attackWith(g, 'SYNTHETIC Test Double Exalted');
    expect(g.state.stack).toHaveLength(2);
    g.passAll();
    g.expect.pt('SYNTHETIC Test Double Exalted', 3, 3);
  });

  test('the attacker may leave before the trigger resolves: nothing happens and nothing breaks', () => {
    const g = scenario()
      .seat(0)
      .battlefield(SQUIRE)
      .seat(1)
      .battlefield('Mountain')
      .hand('Lightning Bolt')
      .build();
    attackWith(g, SQUIRE);
    g.act(0).pass();
    g.act(1).cast('Lightning Bolt', { targets: [SQUIRE], pay: true });
    g.passAll();
    g.expect.zone(SQUIRE, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });
});

describe('CR 702.86a (Annihilator N): defending player sacrifices N permanents', () => {
  test('0 permanents: nothing happens', () => {
    const g = scenario().seat(0).battlefield(TITAN).seat(1).build();
    attackWith(g, TITAN);
    g.expect.stack([`${TITAN} (ability)`]);
    g.passAll();
    expect(g.state.pending?.kind).not.toBe('choosePermanent');
    expect(g.events.filter((e) => e.kind === 'sacrificed')).toHaveLength(0);
  });

  test('fewer permanents than N: they are all sacrificed, without a question', () => {
    const g = scenario().seat(0).battlefield(TITAN).seat(1).battlefield(BEARS).build();
    attackWith(g, TITAN);
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.eventLog([
      { kind: 'permanentsChosen', seat: 1, purpose: 'sacrifice', automatic: true },
      { kind: 'sacrificed', controller: 1 },
    ]);
  });

  test('as many as N: all of them, automatically', () => {
    const g = scenario().seat(0).battlefield(TITAN).seat(1).battlefield(BEARS, ELVES).build();
    attackWith(g, TITAN);
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.zone(ELVES, 'graveyard', { seat: 1 });
  });

  test('more than N: the defending player chooses, among their own permanents only', () => {
    const g = scenario()
      .seat(0)
      .battlefield(TITAN, 'Forest')
      .seat(1)
      .battlefield(BEARS, ELVES, 'Island', 'Mountain')
      .build();
    attackWith(g, TITAN);
    g.passAll();
    const d = choosePermanentDecision(g);
    // The question goes to the defending player, not to the controller of the trigger.
    expect(d.seat).toBe(1);
    expect(d.purpose).toBe('sacrifice');
    expect(d.min).toBe(2);
    expect(d.max).toBe(2);
    expect(d.legal).toHaveLength(4);
    for (const id of d.legal) expect(g.state.objects[id]?.controller).toBe(1);
    // Legal actions: choices of two of the four, and nobody else may answer.
    const mine = getLegalActions(g.state, 1).filter((a) => a.kind === 'choosePermanents');
    expect(mine).toHaveLength(6);
    expect(getLegalActions(g.state, 0)).toEqual([]);
    expect(
      g.act(0).try.action({ kind: 'choosePermanents', objects: [d.legal[0], d.legal[1]] as never })
        .ok,
    ).toBe(false);
    // Too few, too many, a permanent of the attacker's: all refused.
    const attackerLand = g.id({ name: 'Forest', seat: 0 });
    for (const objects of [
      [d.legal[0]],
      [d.legal[0], d.legal[1], d.legal[2]],
      [d.legal[0], attackerLand],
    ]) {
      expect(g.act(1).try.action({ kind: 'choosePermanents', objects: objects as never }).ok).toBe(
        false,
      );
    }
    const before = g.state;
    g.act(1).choosePermanents(BEARS, 'Island');
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.zone('Island', 'graveyard', { seat: 1 });
    g.expect.zone(ELVES, 'battlefield', { seat: 1 });
    g.expect.zone('Mountain', 'battlefield', { seat: 1 });
    g.expect.zone(TITAN, 'battlefield', { seat: 0 });
    g.expect.zone('Forest', 'battlefield', { seat: 0 });
    expect(before).not.toBe(g.state);
    g.expect.invariants();
  });

  test('Annihilator 1 asks for one', () => {
    const g = scenario().seat(0).battlefield(IMP).seat(1).battlefield(BEARS, ELVES).build();
    attackWith(g, IMP);
    g.passAll();
    expect(choosePermanentDecision(g).max).toBe(1);
    g.act(1).choosePermanents(ELVES);
    g.expect.zone(ELVES, 'graveyard', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
  });

  test('the sacrifice happens on resolution, so blockers can still be chosen from what is left', () => {
    const g = scenario().seat(0).battlefield(IMP).seat(1).battlefield(BEARS, ELVES).build();
    attackWith(g, IMP);
    g.passAll();
    g.act(1).choosePermanents(BEARS);
    // The Bears were sacrificed before blockers are declared: only the Elves can block.
    g.advanceTo('declareBlockers', { attack: false });
    g.expect.canBlock(ELVES, IMP, true);
  });

  test('each instance triggers separately (CR 702.86b)', () => {
    const g = scenario()
      .seat(0)
      .define(
        singleFace({
          name: 'SYNTHETIC Test Double Annihilator',
          manaCost: ['8'],
          types: ['creature'],
          colors: [],
          colorIdentity: [],
          power: 4,
          toughness: 4,
          oracleText: 'Annihilator 1. Annihilator 2.',
          abilities: [
            { kind: 'keyword', keyword: { kind: 'annihilator', count: 1 } },
            { kind: 'keyword', keyword: { kind: 'annihilator', count: 2 } },
          ],
        }),
      )
      .battlefield('SYNTHETIC Test Double Annihilator')
      .seat(1)
      .battlefield(BEARS, ELVES, 'Island', 'Mountain', 'Swamp')
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack('SYNTHETIC Test Double Annihilator');
    // Two different abilities: the controller orders them.
    expect(g.state.pending?.kind).toBe('orderTriggers');
    g.act(0).orderTriggers(0, 1);
    expect(g.state.stack).toHaveLength(2);
    g.passAll();
    expect(choosePermanentDecision(g).max).toBe(2);
    g.act(1).choosePermanents('Island', 'Mountain');
    g.passAll();
    expect(choosePermanentDecision(g).max).toBe(1);
    g.act(1).choosePermanents('Swamp');
    expect(g.state.battlefield.filter((id) => g.state.objects[id]?.controller === 1)).toHaveLength(
      2,
    );
  });

  test('attacking a planeswalker: its controller is the defending player (CR 508.5)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(TITAN)
      .seat(1)
      .battlefield(WALKER, BEARS, ELVES)
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: TITAN, target: WALKER }]);
    g.passAll();
    expect(choosePermanentDecision(g).seat).toBe(1);
    g.act(1).choosePermanents(BEARS, ELVES);
    g.expect.zone(WALKER, 'battlefield', { seat: 1 });
  });

  test('the creature may die before the trigger resolves: the defending player is still the one it attacked', () => {
    const g = scenario()
      .seat(0)
      .battlefield(IMP)
      .seat(1)
      .battlefield(BEARS, ELVES, 'Mountain')
      .hand('Lightning Bolt')
      .build();
    attackWith(g, IMP);
    g.act(0).pass();
    g.act(1).cast('Lightning Bolt', { targets: [IMP], pay: true });
    g.passAll();
    g.expect.zone(IMP, 'graveyard', { seat: 0 });
    // Annihilator still resolves (CR 508.5: the player it was attacking), but the Mountain was tapped for Bolt.
    expect(choosePermanentDecision(g).seat).toBe(1);
  });

  test('applyAction and the legal actions agree on every offered answer', () => {
    const g = scenario()
      .seat(0)
      .battlefield(IMP)
      .seat(1)
      .battlefield(BEARS, ELVES, 'Island')
      .build();
    attackWith(g, IMP);
    g.passAll();
    for (const a of getLegalActions(g.state, 1) as Action[]) {
      if (a.kind === 'concede') continue;
      expect(applyAction(g.state, 1, a).ok, JSON.stringify(a)).toBe(true);
    }
  });
});
