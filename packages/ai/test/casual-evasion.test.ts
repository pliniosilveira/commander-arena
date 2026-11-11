// CasualAgent and restrictions (D-094): the heuristics of src/casual-evasion.ts and the combat
// handlers, run against real engine states built with the scenario DSL (SYNTHETIC cards). Pins: a
// creature that attacks each combat if able is always declared; an attacker nothing can block counts
// as safe; the blocks it makes are accepted by the engine; it uses "can't be blocked this turn" when
// it helps and not otherwise.
import { type Action, applyAction } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { couldBlock, isUnblockable, wantsUnblockable } from '../src/casual-evasion';
import { findObject } from '../src/casual-view';
import { CasualAgent, RandomLegalAgent } from '../src/index';
import { CTX } from './helpers';

const BERSERKER = 'SYNTHETIC Berserker'; // 3/3, attacks each combat if able
const SHADOW = 'SYNTHETIC Shadow Bear';
const ISLANDWALKER = 'SYNTHETIC Islandwalker';
const GATE = 'SYNTHETIC Rogue Gate';
const VANILLA_5 = 'SYNTHETIC Vanilla 5/5';
const BEARS = 'Grizzly Bears';

async function answer(g: ScenarioGame, seed = 1): Promise<Action> {
  const seat = g.deciding;
  const view = g.view(seat);
  if (view.pending === null) throw new Error('no decision');
  return new CasualAgent({ seed }).decide(view, view.pending, CTX);
}

describe('a creature that attacks each combat if able is declared', () => {
  test('even into a blocker that would kill it, and even though it is an unsafe attack', async () => {
    const g = scenario()
      .seat(0)
      .battlefield(BERSERKER)
      .library('Island', { count: 4 })
      .seat(1)
      .battlefield(VANILLA_5)
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    const action = await answer(g);
    expect(action).toEqual({
      kind: 'declareAttackers',
      attacks: [{ attacker: g.id(BERSERKER), target: { kind: 'player', seat: 1 } }],
    });
    expect(applyAction(g.state, 0, action).ok).toBe(true);
  });

  test('the other creatures are still judged by the usual safety test', async () => {
    const g = scenario()
      .seat(0)
      .battlefield(BERSERKER, BEARS)
      .library('Island', { count: 4 })
      .seat(1)
      .battlefield(VANILLA_5)
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    const action = await answer(g);
    if (action.kind !== 'declareAttackers') throw new Error('expected an attack declaration');
    expect(action.attacks.map((a) => a.attacker)).toEqual([g.id(BERSERKER)]);
    expect(applyAction(g.state, 0, action).ok).toBe(true);
  });
});

describe('evasion is valued: an attack nothing can block is a safe attack', () => {
  test('a shadow creature attacks into a board of big creatures without shadow', async () => {
    const g = scenario()
      .seat(0)
      .battlefield(SHADOW)
      .library('Island', { count: 4 })
      .seat(1)
      .battlefield(VANILLA_5, VANILLA_5)
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    const view = g.view(0);
    const shadow = findObject(view, g.id(SHADOW));
    if (shadow === undefined) throw new Error('missing');
    expect(isUnblockable(view, shadow)).toBe(true);
    const action = await answer(g);
    expect(action).toMatchObject({ kind: 'declareAttackers' });
    if (action.kind === 'declareAttackers') expect(action.attacks).toHaveLength(1);
  });

  test('an islandwalker is unblockable only against a player with an Island', () => {
    const withIsland = scenario()
      .seat(0)
      .battlefield(ISLANDWALKER)
      .seat(1)
      .battlefield(VANILLA_5, 'Island')
      .build();
    const view = withIsland.view(0);
    const walker = findObject(view, withIsland.id(ISLANDWALKER));
    const wall = findObject(view, withIsland.id(VANILLA_5));
    if (walker === undefined || wall === undefined) throw new Error('missing');
    expect(couldBlock(view, walker, wall)).toBe(false);
    const without = scenario()
      .seat(0)
      .battlefield(ISLANDWALKER)
      .seat(1)
      .battlefield(VANILLA_5, 'Forest')
      .build();
    const v2 = without.view(0);
    const w2 = findObject(v2, without.id(ISLANDWALKER));
    const b2 = findObject(v2, without.id(VANILLA_5));
    if (w2 === undefined || b2 === undefined) throw new Error('missing');
    expect(couldBlock(v2, w2, b2)).toBe(true);
  });
});

describe('the blocks it makes are accepted by the engine', () => {
  test('against a fear attacker it blocks only with what can block it, or not at all', async () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Fear Bear')
      .library('Island', { count: 4 })
      .seat(1)
      .battlefield(BEARS, 'SYNTHETIC Black Blocker', 'SYNTHETIC Artifact Golem')
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack('SYNTHETIC Fear Bear');
    g.advanceTo('declareBlockers');
    const action = await answer(g, 3);
    expect(applyAction(g.state, 1, action).ok).toBe(true);
    if (action.kind === 'declareBlockers') {
      for (const b of action.blocks) expect(b.blocker).not.toBe(g.id(BEARS));
    }
  });

  test("a creature that can't block is never chosen to block", async () => {
    const g = scenario()
      .seat(0)
      .battlefield(VANILLA_5)
      .library('Island', { count: 4 })
      .seat(1)
      .battlefield('SYNTHETIC Cant Block Bear', BEARS)
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(VANILLA_5);
    g.advanceTo('declareBlockers');
    const action = await answer(g, 5);
    expect(applyAction(g.state, 1, action).ok).toBe(true);
    if (action.kind === 'declareBlockers') {
      for (const b of action.blocks) expect(b.blocker).not.toBe(g.id('SYNTHETIC Cant Block Bear'));
    }
  });
});

describe('"{4}, {T}: Target creature can\'t be blocked this turn"', () => {
  const board = (opponent: string[]) =>
    scenario()
      .seat(0)
      .battlefield(GATE, 'Forest', 'Forest', 'Forest', 'Forest', VANILLA_5)
      .library('Island', { count: 4 })
      .seat(1)
      .battlefield(...opponent)
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();

  test('it is activated before attacking when the opponent could block', async () => {
    const g = board([BEARS]);
    const view = g.view(0);
    expect(wantsUnblockable(view)).toBe(true);
    const action = await answer(g);
    expect(action).toMatchObject({ kind: 'activate', object: g.id(GATE) });
  });

  test('it is not activated when the opponent has no creature to block with', async () => {
    const g = board([]);
    expect(wantsUnblockable(g.view(0))).toBe(false);
    const action = await answer(g);
    expect(action).not.toMatchObject({ kind: 'activate', object: g.id(GATE) });
  });
});

describe('RandomLegalAgent declares a required attacker whatever it draws', () => {
  test('over many seeds the declaration is always accepted', async () => {
    const g = scenario()
      .seat(0)
      .battlefield(BERSERKER, BEARS, 'SYNTHETIC Raging Brute')
      .library('Island', { count: 4 })
      .seat(1)
      .battlefield(VANILLA_5)
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    const view = g.view(0);
    if (view.pending === null) throw new Error('no decision');
    for (let seed = 1; seed <= 40; seed += 1) {
      const action = await new RandomLegalAgent({ seed }).decide(view, view.pending, CTX);
      expect(applyAction(g.state, 0, action).ok, `seed ${seed}`).toBe(true);
    }
  });
});
