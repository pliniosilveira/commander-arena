// Restrictions from continuous effects (D-094): "target creature can't be blocked this turn",
// "can't block this turn", "attacks this turn if able", from a spell and from an activated ability.
// Pins: CR 613.11 (effects that change the rules of the game apply after the layers, so "loses all
// abilities" does not remove them), CR 611.2a (it lasts until end of turn), CR 611.2c (the set is
// fixed when the effect begins), CR 514.2 (the end of the turn ends it), CR 509.1b, CR 508.1d.
// All cards are SYNTHETIC (src/cards/fixtures/synthetic-restrictions.ts).
import { describe, expect, test } from 'vitest';
import { derive } from '../src/rules/derive';
import { scenario } from '../src/testing/index';
import { canBlock } from './restriction-helpers';

const BEARS = 'Grizzly Bears';
const VANILLA = 'SYNTHETIC Vanilla 3/3';
const GHOST = 'SYNTHETIC Ghost Step';
const MUZZLE = 'SYNTHETIC Muzzle';
const GOAD = 'SYNTHETIC Goad Rage';
const WIPE = 'SYNTHETIC Mind Wipe';
const GATE = 'SYNTHETIC Rogue Gate';
const CANT_BLOCK = 'SYNTHETIC Cant Block Bear';

describe('"Target creature can\'t be blocked this turn." as a spell', () => {
  test('cast before blockers, it makes the attacker unblockable for the turn', () => {
    const g = scenario()
      .seat(0)
      .battlefield(VANILLA)
      .hand(GHOST)
      .pool('U')
      .library('Island', { count: 4 })
      .seat(1)
      .battlefield(BEARS)
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(GHOST, { targets: [VANILLA], pay: true });
    g.passAll();
    expect(derive(g.state, g.object(VANILLA)).restrictions).toEqual(['cantBeBlocked']);
    g.advanceTo('declareAttackers');
    g.act(0).attack(VANILLA);
    g.advanceTo('declareBlockers');
    g.expect.pending('priority', 0);
    expect(canBlock(g, BEARS, VANILLA)).toBe(false);
    g.advanceTo('endOfCombat');
    g.expect.life(1, 37);
  });

  test('it ends with the turn (cleanup removes it, CR 514.2)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(VANILLA)
      .hand(GHOST)
      .pool('U')
      .library('Island', { count: 4 })
      .seat(1)
      .battlefield(BEARS)
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(GHOST, { targets: [VANILLA], pay: true });
    g.passAll();
    expect(g.state.continuousEffects.map((e) => e.change.kind)).toEqual(['restrict']);
    g.advanceTo('upkeep', { turn: 'next' });
    expect(g.state.continuousEffects).toEqual([]);
    expect(derive(g.state, g.object(VANILLA)).restrictions).toEqual([]);
  });

  test('another creature of the same player is not affected (CR 611.2c: the set is fixed)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(VANILLA, 'SYNTHETIC Vanilla 2/2')
      .hand(GHOST)
      .pool('U')
      .library('Island', { count: 4 })
      .seat(1)
      .battlefield(BEARS)
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(GHOST, { targets: [VANILLA], pay: true });
    g.passAll();
    expect(derive(g.state, g.object('SYNTHETIC Vanilla 2/2')).restrictions).toEqual([]);
  });

  test('cast after blockers were declared, it does not undo the block (CR 509.1b)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(VANILLA, 'Island')
      .hand(GHOST)
      .library('Island', { count: 4 })
      .seat(1)
      .battlefield(BEARS)
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(VANILLA);
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([{ blocker: BEARS, attacker: VANILLA }]);
    g.act(0).cast(GHOST, { targets: [VANILLA], pay: true });
    g.passAll();
    g.expect.combat({ blocked: [VANILLA] });
  });
});

describe('"Target creature can\'t block this turn."', () => {
  test("the creature that was muzzled can't block, its neighbour still can", () => {
    const g = scenario()
      .seat(0)
      .battlefield(VANILLA)
      .hand(MUZZLE)
      .pool('R')
      .library('Island', { count: 4 })
      .seat(1)
      .battlefield(BEARS, 'Serra Angel')
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(MUZZLE, { targets: [BEARS], pay: true });
    g.passAll();
    g.advanceTo('declareAttackers');
    g.act(0).attack(VANILLA);
    g.advanceTo('declareBlockers');
    expect(canBlock(g, BEARS, VANILLA)).toBe(false);
    expect(canBlock(g, 'Serra Angel', VANILLA)).toBe(true);
  });
});

describe('"{4}, {T}: Target creature can\'t be blocked this turn." (an activated ability)', () => {
  test('the ability goes on the stack, resolves, and the target is unblockable', () => {
    const g = scenario()
      .seat(0)
      .battlefield(GATE, 'Forest', 'Forest', 'Forest', 'Forest')
      .battlefield(VANILLA)
      .library('Island', { count: 4 })
      .seat(1)
      .battlefield(BEARS)
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(GATE, { ability: 1, targets: [VANILLA], pay: true });
    g.expect.tapped(GATE);
    g.passAll();
    expect(derive(g.state, g.object(VANILLA)).restrictions).toEqual(['cantBeBlocked']);
    g.advanceTo('declareAttackers');
    g.act(0).attack(VANILLA);
    g.advanceTo('declareBlockers');
    expect(canBlock(g, BEARS, VANILLA)).toBe(false);
  });
});

describe('CR 613.11: a restriction an effect gives survives "loses all abilities"', () => {
  test('"can\'t be blocked this turn", then "loses all abilities": still unblockable', () => {
    const g = scenario()
      .seat(0)
      .battlefield(VANILLA)
      .hand(GHOST)
      .pool('U')
      .library('Island', { count: 4 })
      .seat(1)
      .hand(WIPE)
      .pool('U')
      .battlefield(BEARS)
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(GHOST, { targets: [VANILLA], pay: true });
    g.passAll();
    g.act(0).pass();
    g.act(1).cast(WIPE, { targets: [VANILLA], pay: true });
    g.passAll();
    expect(derive(g.state, g.object(VANILLA)).restrictions).toEqual(['cantBeBlocked']);
  });

  test('"loses all abilities" first, then "can\'t be blocked": the later effect applies', () => {
    const g = scenario()
      .seat(0)
      .battlefield(VANILLA)
      .hand(GHOST, WIPE)
      .pool('UU')
      .library('Island', { count: 4 })
      .seat(1)
      .battlefield(BEARS)
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(WIPE, { targets: [VANILLA], pay: true });
    g.passAll();
    g.act(0).cast(GHOST, { targets: [VANILLA], pay: true });
    g.passAll();
    expect(derive(g.state, g.object(VANILLA)).restrictions).toEqual(['cantBeBlocked']);
  });

  test('a static "can\'t block" is an ability: "loses all abilities" removes it', () => {
    const g = scenario()
      .seat(0)
      .hand(WIPE)
      .pool('U')
      .battlefield(CANT_BLOCK)
      .library('Island', { count: 4 })
      .seat(1)
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    expect(derive(g.state, g.object(CANT_BLOCK)).restrictions).toEqual(['cantBlock']);
    g.act(0).cast(WIPE, { targets: [CANT_BLOCK], pay: true });
    g.passAll();
    expect(derive(g.state, g.object(CANT_BLOCK)).abilities).toEqual([]);
    expect(derive(g.state, g.object(CANT_BLOCK)).restrictions).toEqual([]);
  });

  test('"can\'t block this turn" on a creature that lost its abilities is still in force', () => {
    const g = scenario()
      .seat(0)
      .battlefield(VANILLA)
      .library('Island', { count: 4 })
      .seat(1)
      .hand(MUZZLE, WIPE)
      .pool('UR')
      .battlefield(BEARS)
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).pass();
    g.act(1).cast(WIPE, { targets: [BEARS], pay: true });
    g.passAll();
    g.act(0).pass();
    g.act(1).cast(MUZZLE, { targets: [BEARS], pay: true });
    g.passAll();
    expect(derive(g.state, g.object(BEARS)).restrictions).toEqual(['cantBlock']);
  });
});

describe('"Target creature attacks this turn if able." (CR 508.1d as an effect)', () => {
  test("the goaded creature must attack on its controller's turn", () => {
    const g = scenario()
      .seat(0)
      .hand(GOAD)
      .pool('R')
      .battlefield(VANILLA, BEARS)
      .library('Island', { count: 4 })
      .seat(1)
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(GOAD, { targets: [BEARS], pay: true });
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    const d = g.state.pending;
    if (d?.kind !== 'declareAttackers') throw new Error('expected declareAttackers');
    expect(d.mustAttack).toEqual([g.id(BEARS)]);
    g.expect.illegal(0, { declareAttackers: [{ attacker: VANILLA }] });
    g.expect.legal(0, { declareAttackers: [{ attacker: BEARS }] });
  });
});
