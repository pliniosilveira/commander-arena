// "{T}, Pay 2 life, Tap X untapped tokens you control: Add X mana in any combination of colors." (Hazel of the Rootbloom shape), played by the agents: CasualAgent activates it once a turn
// for the mana a spell it wants is missing (the engine's payment never taps it), taps the fewest tokens, names the colors the spell needs and keeps its life above the guard; it never
// does it for nothing. Every answer is one the engine takes (the activation names tokens and colors the options list only in part). Cards are SYNTHETIC (engine fixtures).
import { type Action, applyAction, checkInvariants, stateHash } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, HeuristicAgent, RandomLegalAgent } from '../src/index';
import { CTX, deckFromMix, stepGame } from './helpers';

const DRUID = 'SYNTHETIC Rootbloom Druid';
const SWARM = 'SYNTHETIC Squirrel Swarm';
const TRIAD = 'SYNTHETIC Triad Rite'; // {1}{W}{U}
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

async function answer(g: ScenarioGame): Promise<Action> {
  const decision = g.state.pending;
  if (decision === null) throw new Error('nothing is pending');
  const view = g.view(decision.seat);
  if (view.pending === null) throw new Error('the seat does not see its decision');
  return new CasualAgent({ seed: 1 }).decide(view, view.pending, CTX);
}

/** The Druid, a Forest to make four tokens with and a spell in hand that the Forest's mana could not pay. */
function board(life = 20): ScenarioGame {
  const g = scenario()
    .seat(0)
    .life(life)
    .battlefield(DRUID)
    .battlefield('Forest')
    .hand(SWARM, TRIAD)
    .library(...LIBRARY)
    .seat(1)
    .life(20)
    .library(...LIBRARY)
    .at('precombatMain', { active: 0 })
    .build();
  g.act(0).cast(SWARM, { pay: true });
  g.passAll();
  return g;
}

describe('CasualAgent and the mana ability that taps X tokens', () => {
  test('it taps three tokens for a spell of {1}{W}{U} it cannot pay otherwise, naming white and blue', async () => {
    const g = board();
    const action = await answer(g);
    expect(action.kind).toBe('activateAbility');
    if (action.kind !== 'activateAbility') return;
    expect(action.source).toBe(g.id(DRUID));
    expect(action.tappedMany).toHaveLength(3);
    expect(action.combination).toHaveLength(3);
    expect(action.combination).toContain('W');
    expect(action.combination).toContain('U');
    // The engine takes it (it is not among the listed options, which tap every token), and the spell is castable next.
    g.choose(0, action);
    g.expect.life(0, 18);
    const next = await answer(g);
    expect(next).toEqual({ kind: 'castSpell', object: g.id(TRIAD) });
    g.choose(0, next);
    g.act(0).payAuto();
    g.passAll();
    g.expect.life(0, 19);
    g.expect.invariants();
  });

  test('it leaves the tokens that are not needed untapped, taking those that cannot attack yet', async () => {
    const g = board();
    const action = await answer(g);
    if (action.kind !== 'activateAbility') throw new Error('expected an activation');
    const all = g.state.battlefield.filter((id) => g.state.objects[id]?.token !== null);
    expect(all).toHaveLength(4);
    expect(new Set(action.tappedMany).size).toBe(3);
    g.choose(0, action);
    expect(all.filter((id) => g.state.objects[id]?.tapped === false)).toHaveLength(1);
  });

  test('it does not pay the life when that would leave it at the guard (10 life or less)', async () => {
    const g = board(11);
    expect((await answer(g)).kind).toBe('pass');
  });

  test('it does not activate it when the spell can be paid by the lands', async () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(DRUID)
      .battlefield('Plains')
      .battlefield('Island')
      .battlefield('Forest')
      .battlefield('Forest')
      .hand(SWARM, TRIAD)
      .library(...LIBRARY)
      .seat(1)
      .life(20)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(SWARM, { pay: true });
    g.passAll();
    expect(await answer(g)).toEqual({ kind: 'castSpell', object: g.id(TRIAD) });
  });

  test('it does not activate it with no spell to pay for', async () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(DRUID)
      .battlefield('Forest')
      .hand(SWARM)
      .library(...LIBRARY)
      .seat(1)
      .life(20)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(SWARM, { pay: true });
    g.passAll();
    expect((await answer(g)).kind).toBe('pass');
  });

  test('a second activation in the same turn is not on offer, so it passes', async () => {
    const g = board();
    const action = await answer(g);
    g.choose(0, action);
    g.choose(0, await answer(g)); // cast the spell
    g.act(0).payAuto();
    g.passAll();
    expect((await answer(g)).kind).toBe('pass');
  });
});

describe('whole games with the ability', () => {
  const MIX = {
    commander: 'Isamaru, Hound of Konda',
    lands: [
      ...Array.from({ length: 3 }, () => 'Plains'),
      ...Array.from({ length: 3 }, () => 'Island'),
      ...Array.from({ length: 3 }, () => 'Forest'),
      ...Array.from({ length: 3 }, () => 'Swamp'),
    ],
    spells: [
      ...Array.from({ length: 4 }, () => DRUID),
      ...Array.from({ length: 5 }, () => SWARM),
      ...Array.from({ length: 3 }, () => TRIAD),
    ],
  };

  test('games of CasualAgent, HeuristicAgent and a random agent finish clean, use the ability and keep the state consistent', async () => {
    let activations = 0;
    let withCasual = 0;
    for (let seed = 1; seed <= 8; seed += 1) {
      const agents =
        seed % 3 === 0
          ? ([new HeuristicAgent({ seed }), new CasualAgent({ seed: seed + 1 })] as const)
          : seed % 3 === 1
            ? ([new CasualAgent({ seed }), new CasualAgent({ seed: seed + 1 })] as const)
            : ([new CasualAgent({ seed }), new RandomLegalAgent({ seed: seed + 1 })] as const);
      const config = { seed, decks: [deckFromMix(MIX), deckFromMix(MIX)] as const };
      const { state, capped } = await stepGame(
        config,
        agents,
        { maxTurns: 60, maxActions: 4000 },
        (step) => {
          if (step.action.kind === 'activateAbility' && step.action.tappedMany !== undefined) {
            activations += 1;
            if (step.seat === 0 && seed % 3 !== 2) withCasual += 1;
            expect(step.action.combination?.length).toBe(step.action.tappedMany.length);
          }
        },
      );
      expect(checkInvariants(state), `seed ${seed}`).toEqual([]);
      expect(capped || state.result !== null).toBe(true);
    }
    expect(activations).toBeGreaterThan(0);
    expect(withCasual).toBeGreaterThan(0);
  }, 120_000);

  test('the engine takes every play the agents send, and a refused stale play changes nothing', () => {
    // A play naming a token that is not there is refused with the state untouched.
    const g = board();
    const before = stateHash(g.state);
    const stale: Action = {
      kind: 'activateAbility',
      source: g.id(DRUID),
      abilityIndex: 0,
      color: null,
      combination: ['W'],
      tappedMany: ['o99999'],
    };
    expect(applyAction(g.state, 0, stale).ok).toBe(false);
    expect(stateHash(g.state)).toBe(before);
  });
});
