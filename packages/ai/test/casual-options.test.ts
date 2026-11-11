// CasualAgent and RandomLegalAgent answer "As this enters, choose a creature type / a color" (D-100)
// on real engine states built with the scenario DSL. The casual heuristic: the creature type found on
// most of the creature cards in its hand and the creatures it controls (ties to the option listed first),
// the color found on most of its hand and permanents, its commander when it has nothing to count, and the
// first option when it has nothing at all; no randomness. Every answer is one the engine lists and accepts.
import {
  type Action,
  applyAction,
  type ChooseOptionDecision,
  getLegalActions,
} from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, createCasualHandlers, RandomLegalAgent } from '../src/index';
import { CTX } from './helpers';

const BANNER = 'SYNTHETIC Rally Banner'; // chooses a creature type
const HUE = 'SYNTHETIC Hue Banner'; // chooses a color

/** Seat 0 has cast `card` and it resolved: the choice is open, `build` set the rest of the board. */
function atQuestion(
  card: string,
  setup: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario> = (b) => b,
): ScenarioGame {
  const base = scenario()
    .seat(0)
    .hand(card)
    .battlefield('Plains', 'Forest', 'Forest', 'Island', 'Island');
  const g = setup(base).seat(1).build();
  g.act(0).cast(card, { pay: true });
  g.passAll();
  g.expect.pending('chooseOption', 0);
  return g;
}

async function answer(g: ScenarioGame, agent = new CasualAgent({ seed: 1 })): Promise<Action> {
  const view = g.view(0);
  if (view.pending === null) throw new Error('the seat does not see its decision');
  return agent.decide(view, view.pending, CTX);
}

function expectLegal(g: ScenarioGame, action: Action) {
  expect(
    getLegalActions(g.state, 0).some((a) => JSON.stringify(a) === JSON.stringify(action)),
  ).toBe(true);
  expect(applyAction(g.state, 0, action).ok).toBe(true);
}

describe('CasualAgent chooses a creature type', () => {
  test('the type most of its hand and creatures share', async () => {
    const g = atQuestion(BANNER, (b) =>
      b.battlefield('Serra Angel', 'Grizzly Bears').seat(0).hand('Serra Angel', 'Raging Goblin'),
    );
    // Angel: the Angel on the battlefield and the one in hand; Bear, Goblin and Berserker: one card each.
    const a = await answer(g);
    expect(a).toEqual({ kind: 'chooseOption', option: 'Angel' });
    expectLegal(g, a);
  });

  test('only creature cards count, and a type a creature has twice over counts once', async () => {
    const g = atQuestion(BANNER, (b) =>
      b.battlefield('Serra Angel').seat(0).hand('Lightning Bolt', 'Murder', 'Sol Ring'),
    );
    expect(await answer(g)).toEqual({ kind: 'chooseOption', option: 'Angel' });
  });

  test("the opponent's creatures do not count", async () => {
    const g = atQuestion(BANNER, (b) =>
      b.battlefield('Grizzly Bears').seat(1).battlefield('Llanowar Elves', 'Llanowar Elves'),
    );
    expect(await answer(g)).toEqual({ kind: 'chooseOption', option: 'Bear' });
  });

  test('a tie goes to the type listed first, deterministically and without randomness', async () => {
    const g = atQuestion(BANNER, (b) => b.battlefield('Llanowar Elves', 'Grizzly Bears'));
    const view = g.view(0);
    const d = view.pending as ChooseOptionDecision;
    const noDraws = createCasualHandlers(view, () => {
      throw new Error('the choice must not use the random generator');
    });
    // Bear is listed before Elf in the rules' list.
    expect(noDraws.chooseOption(d)).toEqual({ kind: 'chooseOption', option: 'Bear' });
    expect(d.options.indexOf('Bear')).toBeLessThan(d.options.indexOf('Elf'));
    // The same view, another agent seed: the same answer.
    expect(await answer(g, new CasualAgent({ seed: 99 }))).toEqual({
      kind: 'chooseOption',
      option: 'Bear',
    });
  });

  test("with nothing to count it takes its commander's type", async () => {
    const g = atQuestion(BANNER, (b) => b.seat(0).commander('Isamaru, Hound of Konda'));
    expect(await answer(g)).toEqual({ kind: 'chooseOption', option: 'Dog' });
  });

  test('with nothing at all it takes the first option', async () => {
    const g = atQuestion(BANNER);
    const view = g.view(0);
    const d = view.pending as ChooseOptionDecision;
    expect(await answer(g)).toEqual({ kind: 'chooseOption', option: d.options[0] });
  });
});

describe('CasualAgent chooses a color', () => {
  test('the color most of its hand and permanents have', async () => {
    const g = atQuestion(HUE, (b) =>
      b
        .battlefield('Llanowar Elves', 'Grizzly Bears', 'Serra Angel')
        .seat(0)
        .hand('Lightning Bolt'),
    );
    const a = await answer(g);
    expect(a).toEqual({ kind: 'chooseOption', option: 'G' });
    expectLegal(g, a);
  });

  test("its commander's color when it has nothing to count", async () => {
    const g = atQuestion(HUE, (b) => b.seat(0).commander('Isamaru, Hound of Konda'));
    expect(await answer(g)).toEqual({ kind: 'chooseOption', option: 'W' });
  });
});

describe('RandomLegalAgent chooses among the options', () => {
  test('any answer is a listed option the engine accepts; the same seed answers the same', async () => {
    for (const card of [BANNER, HUE]) {
      const g = atQuestion(card);
      const seen = new Set<string>();
      for (let seed = 1; seed <= 12; seed += 1) {
        const a = await answer(g, new RandomLegalAgent({ seed }) as never);
        expectLegal(g, a);
        if (a.kind === 'chooseOption') seen.add(a.option);
      }
      expect(seen.size).toBeGreaterThan(1);
      const first = await answer(g, new RandomLegalAgent({ seed: 5 }) as never);
      expect(await answer(g, new RandomLegalAgent({ seed: 5 }) as never)).toEqual(first);
    }
  });

  test('a handler is there for the decision kind, and no fallback was taken', async () => {
    const agent = new RandomLegalAgent({ seed: 3 });
    const g = atQuestion(BANNER);
    const view = g.view(0);
    await agent.decide(view, view.pending as ChooseOptionDecision, CTX);
    expect(agent.fallbacks).toHaveLength(0);
    const casual = new CasualAgent({ seed: 3 });
    await casual.decide(view, view.pending as ChooseOptionDecision, CTX);
    expect(casual.fallbacks).toHaveLength(0);
  });
});
