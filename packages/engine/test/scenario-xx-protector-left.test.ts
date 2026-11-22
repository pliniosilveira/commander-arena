// A battle whose protector left the game (CR 704.5y, 310.11, 800.4a): when a battle's protector is a player who can't be its protector, its controller chooses an appropriate player
// (one of their opponents still in the game) to become its protector, and when no player can be chosen the battle is put into its owner's graveyard. With one player to
// choose nothing is asked. A creature attacking the battle stops attacking it (CR 506.4c). The battle is the SYNTHETIC one of the engine's fixtures.
import { describe, expect, test } from 'vitest';
import { applyAction, type GameState } from '../src/index';
import { settle } from '../src/rules/settle';
import { type ScenarioGame, scenario } from '../src/testing/index';

const BATTLE = 'SYNTHETIC Vanilla Battle';
const FILLER = Array.from({ length: 10 }, () => 'Island');

/** `seats` seats; seat 0 controls the battle, protected by seat 1. */
function game(seats: 2 | 3 | 4): ScenarioGame {
  const b = scenario({ seats })
    .seat(0)
    .battlefield(BATTLE, { label: 'battle', protector: 1 })
    .library(...FILLER);
  for (let seat = 1; seat < seats; seat += 1) b.seat(seat).library(...FILLER);
  return b.at('precombatMain', { active: 0, priority: 1, turn: 3 }).build();
}

const protectorOf = (g: ScenarioGame) => g.state.objects[g.id('battle')]?.protector;

describe('the protector of a battle leaves the game', () => {
  test('with two opponents left the controller is asked which one protects the battle now', () => {
    const g = game(4);
    g.act(1).concede();
    const d = g.state.pending;
    if (d?.kind !== 'chooseOption' || d.purpose !== 'protector') {
      throw new Error(`expected the protector question, got ${d?.kind}`);
    }
    expect(d.seat).toBe(0);
    expect(d.source).toBe(g.id('battle'));
    expect(d.options).toEqual(['seat:2', 'seat:3']);
    const out = applyAction(g.state, 0, { kind: 'chooseOption', option: 'seat:3' });
    if (!out.ok) throw new Error(out.error);
    const state: GameState = out.state;
    expect(state.objects[g.id('battle')]?.protector).toBe(3);
    expect(state.pending?.kind).not.toBe('chooseOption');
  });

  test('an answer that is not an option is refused', () => {
    const g = game(4);
    g.act(1).concede();
    for (const option of ['seat:0', 'seat:1', 'nope']) {
      expect(applyAction(g.state, 0, { kind: 'chooseOption', option }).ok).toBe(false);
    }
  });

  test('with one opponent left nothing is asked: that opponent protects it', () => {
    const g = game(3);
    g.act(1).concede();
    expect(g.state.pending?.kind).not.toBe('chooseOption');
    expect(protectorOf(g)).toBe(2);
    g.expect.invariants();
  });

  test('a creature that was attacking the battle stops attacking it (CR 506.4c)', () => {
    const b = scenario({ seats: 3 })
      .seat(0)
      .battlefield('Grizzly Bears', { label: 'a' })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .seat(2)
      .battlefield(BATTLE, { label: 'battle', protector: 1 })
      .library(...FILLER);
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack('a', 'battle');
    g.advanceTo('declareBlockers', { block: false });
    // Seat 0 passes priority in the declare blockers step, so seat 1 has it and leaves.
    g.act(0).pass();
    g.act(1).concede();
    const attacker = g.state.combat?.attackers.find((x) => x.object === g.id('a'));
    expect(attacker?.targetGone).toBe(true);
    expect(g.state.objects[g.id('battle')]?.protector).toBe(0);
  });

  test('with no player left who can protect it the battle goes to its owner’s graveyard (CR 704.5y)', () => {
    const g = game(3);
    const base = g.state;
    // Both opponents of the controller are out: nobody can be chosen. (The game ends; the battle is handled by the same check, as a new object in the graveyard, CR 400.7.)
    const state: GameState = {
      ...base,
      seats: base.seats.map((s) => (s.id === 0 ? s : { ...s, hasLost: true })),
    };
    const settled = settle(state).state;
    const objects = Object.values(settled.objects);
    expect(objects.some((o) => o.zone === 'battlefield' && o.protector !== null)).toBe(false);
    expect(objects.filter((o) => o.zone === 'graveyard' && o.owner === 0)).toHaveLength(1);
  });
});
