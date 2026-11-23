// A battle's protector (CR 310.9a, 310.12a): as a battle enters, its controller chooses a player to be its protector, from among their living opponents. With one legal player nothing
// is asked. Pins: CR 310.9a, 310.12a (opponents only), 800.4a (a player who left cannot be chosen). Cards are SYNTHETIC.
import { describe, expect, test } from 'vitest';
import { applyAction, type GameState } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const BATTLE = 'SYNTHETIC Vanilla Battle';

/** Seat 0 holds the battle and three Mountains; it is the active seat in its main phase. */
function build(seats: 2 | 3 | 4): ScenarioGame {
  const b = scenario({ seats }).seat(0).hand(BATTLE).battlefield('Mountain', { count: 3 });
  return b.at('precombatMain', { active: 0, turn: 1 }).build();
}

const protectorOf = (state: GameState): number | null => {
  const battle = Object.values(state.objects).find(
    (o) => o.zone === 'battlefield' && o.protector !== null,
  );
  return battle === undefined ? null : battle.protector;
};

/** Seat 0 casts the battle and everybody passes until the spell resolves (or a question is asked). `edit` changes the state while the spell is on the stack. */
function castAndResolve(
  g: ScenarioGame,
  edit: (state: GameState) => GameState = (s) => s,
): GameState {
  g.act(0).cast(BATTLE, { pay: true });
  let state = edit(g.state);
  for (let i = 0; i < 4 && state.pending?.kind === 'priority' && state.stack.length > 0; i += 1) {
    const out = applyAction(state, state.pending.seat, { kind: 'pass' });
    if (!out.ok) throw new Error(out.error);
    state = out.state;
  }
  return state;
}

describe('the protector of a battle (CR 310.9a)', () => {
  test('with one opponent nothing is asked and that opponent protects it', () => {
    const state = castAndResolve(build(2));
    expect(state.pending?.kind).not.toBe('chooseOption');
    expect(protectorOf(state)).toBe(1);
  });

  test('with two opponents the controller is asked and can choose the third seat', () => {
    const state = castAndResolve(build(3));
    const d = state.pending;
    if (d?.kind !== 'chooseOption' || d.purpose !== 'protector') {
      throw new Error(`expected the protector question, got ${d?.kind}`);
    }
    expect(d.seat).toBe(0);
    expect(d.options).toEqual(['seat:1', 'seat:2']);
    const out = applyAction(state, 0, { kind: 'chooseOption', option: 'seat:2' });
    if (!out.ok) throw new Error(out.error);
    expect(out.state.pending?.kind).not.toBe('chooseOption');
    expect(protectorOf(out.state)).toBe(2);
  });

  test('the controller can choose the first opponent too', () => {
    const state = castAndResolve(build(4));
    const d = state.pending;
    if (d?.kind !== 'chooseOption' || d.purpose !== 'protector') throw new Error('no question');
    expect(d.options).toEqual(['seat:1', 'seat:2', 'seat:3']);
    const out = applyAction(state, 0, { kind: 'chooseOption', option: 'seat:1' });
    if (!out.ok) throw new Error(out.error);
    expect(protectorOf(out.state)).toBe(1);
  });

  test('an answer that is not one of the options is refused, and the controller is not one', () => {
    const state = castAndResolve(build(3));
    for (const option of ['seat:0', 'seat:3', 'nope']) {
      expect(applyAction(state, 0, { kind: 'chooseOption', option }).ok).toBe(false);
    }
  });

  test('a player who has left the game is not offered (CR 800.4a): the one left protects it unasked', () => {
    const state = castAndResolve(build(3), (st) => ({
      ...st,
      seats: st.seats.map((s) => (s.id === 1 ? { ...s, hasLost: true } : s)),
    }));
    expect(state.pending?.kind).not.toBe('chooseOption');
    expect(protectorOf(state)).toBe(2);
  });
});
