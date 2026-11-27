// CasualAgent, HeuristicAgent and RandomLegalAgent answer "As this enters, choose a player" and "choose a nonland card name" (CR 614.12a, 607.2d) with an answer the engine accepts,
// on real engine states built with the scenario DSL and the SYNTHETIC cards of the engine's fixtures, with 2, 3 and 4 seats.
import { type Action, applyAction, getLegalActions } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, HeuristicAgent, RandomLegalAgent } from '../src/index';
import { CTX } from './helpers';

const PLAYER = 'SYNTHETIC Player Chooser';
const NAMER = 'SYNTHETIC Name Chooser';
const FIREBREATHER = 'SYNTHETIC Firebreather'; // {R}: +1/+0 until end of turn
const BEARS = 'Grizzly Bears';
const FILLER = Array.from({ length: 8 }, () => 'Plains');

type Agent = CasualAgent | HeuristicAgent | RandomLegalAgent;
const AGENTS: readonly (readonly [string, () => Agent])[] = [
  ['casual', () => new CasualAgent({ seed: 1 })],
  ['heuristic', () => new HeuristicAgent({ seed: 1 })],
  ['random', () => new RandomLegalAgent({ seed: 1 })],
];

async function decide(g: ScenarioGame, agent: Agent): Promise<Action> {
  const view = g.view(0);
  if (view.pending === null) throw new Error('the seat does not see its decision');
  return agent.decide(view, view.pending, CTX);
}

/** Seat 0 cast the card and it resolved, so seat 0 is asked. */
function asked(card: string, seats: 2 | 3 | 4, mine: readonly string[] = []): ScenarioGame {
  const b = scenario({ seats })
    .seat(0)
    .hand(card)
    .pool('BBBBBB')
    .library(...FILLER);
  for (const name of mine) b.battlefield(name);
  b.seat(1).library(...FILLER);
  if (seats > 2) b.seat(2).library(...FILLER);
  if (seats > 3) b.seat(3).library(...FILLER);
  const g = b.at('precombatMain', { active: 0, turn: 1 }).build();
  g.act(0).cast(card, { pay: true });
  g.passAll();
  return g;
}

describe('choose a player', () => {
  test.each(AGENTS)('the %s agent answers with a player the engine offers', async (_n, make) => {
    for (const seats of [2, 3, 4] as const) {
      const g = asked(PLAYER, seats);
      g.expect.pending('chooseOption', 0);
      const a = await decide(g, make());
      if (a.kind !== 'chooseOption') throw new Error(`expected chooseOption, got ${a.kind}`);
      expect(getLegalActions(g.state, 0).some((l) => JSON.stringify(l) === JSON.stringify(a))).toBe(
        true,
      );
      expect(applyAction(g.state, 0, a).ok).toBe(true);
    }
  });

  test('the casual agent chooses an opponent, the one with the most cards in their graveyard', async () => {
    const b = scenario({ seats: 4 })
      .seat(0)
      .hand(PLAYER)
      .pool('BBBBBB')
      .library(...FILLER);
    b.seat(1)
      .graveyard(BEARS)
      .library(...FILLER);
    b.seat(2)
      .graveyard(BEARS, BEARS, BEARS)
      .library(...FILLER);
    b.seat(3)
      .graveyard(BEARS, BEARS)
      .library(...FILLER);
    const g = b.at('precombatMain', { active: 0, turn: 1 }).build();
    g.act(0).cast(PLAYER, { pay: true });
    g.passAll();
    expect(await decide(g, new CasualAgent({ seed: 1 }))).toEqual({
      kind: 'chooseOption',
      option: 'seat:2',
    });
  });
});

describe('choose a nonland card name', () => {
  test.each(AGENTS)('the %s agent answers with a name the engine accepts', async (_n, make) => {
    for (const seats of [2, 3, 4] as const) {
      const g = asked(NAMER, seats);
      g.expect.pending('chooseOption', 0);
      const a = await decide(g, make());
      if (a.kind !== 'chooseOption') throw new Error(`expected chooseOption, got ${a.kind}`);
      expect(a.option.trim()).not.toBe('');
      expect(getLegalActions(g.state, 0).some((l) => JSON.stringify(l) === JSON.stringify(a))).toBe(
        true,
      );
      expect(applyAction(g.state, 0, a).ok).toBe(true);
    }
  });

  test("the casual agent names the opponent's nonland permanent with an activated ability", async () => {
    const b = scenario({ seats: 3 })
      .seat(0)
      .hand(NAMER)
      .pool('CC')
      .library(...FILLER);
    b.seat(1)
      .battlefield(BEARS)
      .battlefield('Mountain')
      .library(...FILLER);
    b.seat(2)
      .battlefield(FIREBREATHER)
      .library(...FILLER);
    const g = b.at('precombatMain', { active: 0, turn: 1 }).build();
    g.act(0).cast(NAMER, { pay: true });
    g.passAll();
    expect(await decide(g, new CasualAgent({ seed: 1 }))).toEqual({
      kind: 'chooseOption',
      option: FIREBREATHER,
    });
  });
});
