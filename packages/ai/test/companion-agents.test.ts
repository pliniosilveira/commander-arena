// The companion (CR 103.2b, 116.2g, 702.139a, SPEC A35): when the CasualAgent and the HeuristicAgent bring it. It is card
// advantage that costs {3}, so they bring it in their own second main phase with mana nothing else used, never in place of a
// play they chose, at most once per game, and cast it afterwards like any card. Cards are SYNTHETIC, defined here.
import { deckOf } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { type Agent, CasualAgent, HeuristicAgent, runGame } from '../src/index';
import { expectLegal } from './casual-helpers';
import { smallGameConfig } from './helpers';
import { creature, ctxFor } from './heuristic-helpers';

const BEAR = 'SYNTHETIC Companion Bear'; // {1}{G} 2/2
const OGRE = 'SYNTHETIC Companion Ogre'; // {2}{G} 3/3: a play the agent chooses
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

const bear = creature(BEAR, 2, 2, [], { cost: ['1', 'G'] });
const ogre = creature(OGRE, 3, 3, [], { cost: ['2', 'G'] });

type Builder = ReturnType<typeof scenario>;
type Maker = (seed: number) => Agent;
const KINDS: readonly (readonly [string, Maker])[] = [
  ['CasualAgent', (seed) => new CasualAgent({ seed })],
  ['HeuristicAgent', (seed) => new HeuristicAgent({ seed })],
];

/** Seat 0 has the companion; `place` stocks its battlefield and hand. */
function game(
  place: (b: Builder) => Builder,
  step: Parameters<Builder['at']>[0] = 'postcombatMain',
  at: Parameters<Builder['at']>[1] = { active: 0, turn: 3 },
): ScenarioGame {
  return place(
    scenario()
      .define(bear)
      .define(ogre)
      .seat(0)
      .life(20)
      .companion(BEAR)
      .library(...FILLER),
  )
    .seat(1)
    .life(20)
    .library(...FILLER)
    .at(step, at)
    .build();
}

const forests = (n: number) => (b: Builder) =>
  b.seat(0).battlefield('Forest', { count: n }).seat(0);

/** What the agent answers to the priority decision of the seat now deciding. */
async function decide(g: ScenarioGame, agent: Agent) {
  const seat = g.deciding;
  const view = g.view(seat);
  if (view.pending === null) throw new Error('no decision');
  return agent.decide(view, view.pending, ctxFor(g));
}

describe.each(KINDS)('%s and the companion', (_name, make) => {
  test('it brings the companion in its second main phase with mana to spare', async () => {
    const g = game(forests(3));
    g.expect.legal(0, { bringCompanion: true });
    const action = await decide(g, make(1));
    expect(action).toEqual({ kind: 'bringCompanion' });
    expectLegal(g, action);
  });

  test('not in the first main phase: its mana may still be wanted in combat', async () => {
    const g = game(forests(3), 'precombatMain');
    g.expect.legal(0, { bringCompanion: true });
    expect(await decide(g, make(1))).toEqual({ kind: 'pass' });
  });

  test('not when {3} is not payable (the engine does not offer it)', async () => {
    const g = game(forests(2));
    g.expect.illegal(0, { bringCompanion: true });
    expect((await decide(g, make(1))).kind).not.toBe('bringCompanion');
  });

  test('it casts the spell it chose instead of spending its mana on the companion', async () => {
    const g = game((b) => forests(3)(b).hand(OGRE));
    g.expect.legal(0, { bringCompanion: true });
    const action = await decide(g, make(1));
    expect(action).toMatchObject({ kind: 'castSpell', object: g.id({ name: OGRE, zone: 'hand' }) });
    expectLegal(g, action);
  });

  test('it brings the companion with what the spell left over, then casts it when it can', async () => {
    const g = game((b) => forests(8)(b).hand(OGRE));
    const agent = make(1);
    const first = await decide(g, agent);
    expect(first).toMatchObject({ kind: 'castSpell' });
    g.act(0).cast(OGRE, { pay: true });
    g.passAll();
    expect(await decide(g, agent)).toEqual({ kind: 'bringCompanion' });
    g.act(0).bringCompanion();
    // Five lands are left: the companion in the hand is an ordinary card now.
    const cast = await decide(g, agent);
    expect(cast).toMatchObject({ kind: 'castSpell', object: g.id({ name: BEAR, zone: 'hand' }) });
    expectLegal(g, cast);
  });

  test('once brought it is never brought again, even with mana to spare', async () => {
    const g = game(forests(8));
    const agent = make(1);
    g.act(0).bringCompanion();
    g.act(0).cast(BEAR, { pay: true });
    g.passAll();
    g.expect.illegal(0, { bringCompanion: true });
    expect((await decide(g, agent)).kind).not.toBe('bringCompanion');
  });

  test('it never takes it in the opponent’s turn', async () => {
    const g = game(forests(3), 'precombatMain', { active: 1, turn: 4, priority: 0 });
    g.expect.illegal(0, { bringCompanion: true });
    expect((await decide(g, make(1))).kind).not.toBe('bringCompanion');
  });

  test('the same seed gives the same answer', async () => {
    const answers = await Promise.all(
      [1, 2].map(() =>
        decide(
          game((b) => forests(8)(b).hand(OGRE)),
          make(7),
        ),
      ),
    );
    expect(answers[0]).toEqual(answers[1]);
  });
});

describe('the HeuristicAgent records why', () => {
  test('the reason is companion', async () => {
    const g = game(forests(3));
    const agent = new HeuristicAgent({ seed: 1 });
    await decide(g, agent);
    expect(agent.reasons[agent.reasons.length - 1]?.reason).toBe('companion');
  });
});

describe('whole games with a companion on both seats', () => {
  const GAMES = 4;
  const run = async (seed: number, make: Maker) => {
    const config = smallGameConfig(seed);
    const companion = deckOf([['Grizzly Bears', 1]])[0];
    if (companion === undefined) throw new Error('no companion card');
    const withCompanion = {
      ...config,
      decks: config.decks.map((deck) => ({ ...deck, companion })),
    };
    const agents = [make(seed), make(seed + 100)];
    const result = await runGame(withCompanion, agents, { maxTurns: 40, maxActions: 4000 });
    return { result, agents };
  };

  test.each(KINDS)(
    '%s: no fallback, no rejected action, at most one bring per seat',
    async (_n, make) => {
      let brought = 0;
      for (let seed = 1; seed <= GAMES; seed += 1) {
        const { result, agents } = await run(seed, make);
        expect(result.counters.fallbacks).toBe(0);
        expect(result.rejected).toEqual([]);
        expect(result.agentErrors).toEqual([]);
        expect(result.reason).not.toBe('stuck');
        for (const a of agents) expect(a.fallbacks?.length ?? 0).toBe(0);
        for (const seat of [0, 1]) {
          const n = result.log.filter((l) => l.seat === seat && l.action.kind === 'bringCompanion');
          expect(n.length).toBeLessThanOrEqual(1);
          brought += n.length;
        }
      }
      expect(brought).toBeGreaterThan(0);
    },
    120_000,
  );

  test('a game replays to the same log for the same seeds', async () => {
    const [a, b] = await Promise.all([
      run(3, KINDS[1]?.[1] as Maker),
      run(3, KINDS[1]?.[1] as Maker),
    ]);
    expect(a.result.log.map((l) => l.action)).toEqual(b.result.log.map((l) => l.action));
  }, 120_000);
});
