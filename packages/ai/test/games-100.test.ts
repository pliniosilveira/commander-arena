// M1 done-when (SPEC 15): 100 games of RandomLegalAgent against RandomLegalAgent, with small decks
// so games end by decking or by burn, finish with a result, and produce no fallback, no rejected
// action and no exception.
//
// Deck styles rotate by game number (see stylesFor in helpers), one game in five each: the old
// spell mix against itself, a creature-heavy mix of the combat fixtures against itself, creature
// mix against spell mix, spell mix against creature mix, and a keyword-creature mix against
// itself. The creature pools
// are read from the engine's fixtures (23 creatures, a planeswalker and a battle when this was
// measured), so they grow by themselves.
//
// Observed distribution (game seeds 1 to 100, agent seeds 1000 + 2 * seed and 1001 + 2 * seed;
// the test prints the same summary to the console):
// wins: seat 0 42, seat 1 58, draws 0. 99 ended by decking (a player drew from an empty library),
// 1 by life loss; random agents rarely race. Turns: min 11, median 29, mean 29.1, max 36.
// Actions per game: mean 720, max 949. Games with at least one: attack 94, block 74, assignDamage
// decision 24 (multiple blockers in 21, a trampler in 5, a deathtouch creature in 4, a first strike
// damage step decision in 4), first strike damage step reached 38, attack by a trampler 12, by a
// first striker or double striker 35, by a flier 50, a block decision offering a menace attacker 7,
// attack on a planeswalker or battle 9. Whole run: 711 attack declarations, 165 block declarations,
// 30 assignDamage decisions. No combat answer was a concession. The whole test takes about 5 s.
// These numbers date from when the pools were small. Since the creature pool grew past 50, the
// generic decks rarely draw and attack with a trampler or a menace creature, so 30 more games on the
// 'combat' deck style carry the keyword assertions (see COVERAGE_GAMES).
import { DECISION_KINDS, type DecisionKind } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { type Agent, RandomLegalAgent, runGame } from '../src/index';
import {
  addTally,
  type CombatTally,
  CREATURES,
  newTally,
  noteDecision,
  POOL_KEYWORDS,
  smallGameConfig,
  stylesFor,
} from './helpers';

// Measured: the longest of the 100 games lasts well under 60 turns, so 150 turns and 5000 actions
// leave a wide margin while still catching a game that never ends.
const MAX_TURNS = 150;
const MAX_ACTIONS = 5000;
const GAMES = 100;
// Extra games after the 100, played on the 'combat' deck style (see COVERAGE_KEYWORDS in helpers):
// decks of creatures with trample, menace, first strike or double strike only, on basic lands of
// every color. The 100 seeded games draw from the generic pools, which grow with every slice of
// creature fixtures (two tramplers among more than 50 creatures), so whether one of them is drawn,
// cast and sent to attack is luck of the seed. These games make the keyword assertions below depend
// on the deck construction instead. They count only toward the keyword assertions: the distribution
// of the 100 games and its decision kinds stay exactly those of the generic styles.
const COVERAGE_GAMES = 30;

/** Delegates to `inner` and notes which decision kinds it was handed. */
function recording(inner: RandomLegalAgent, kinds: Set<DecisionKind>, tally: CombatTally): Agent {
  return {
    name: inner.name,
    decide: async (view, decision, ctx) => {
      kinds.add(decision.kind);
      const action = await inner.decide(view, decision, ctx);
      noteDecision(tally, view, decision, action);
      return action;
    },
    get fallbacks() {
      return inner.fallbacks;
    },
  };
}

test('100 random-vs-random games all finish with a result and no faults', async () => {
  const wins = [0, 0];
  let draws = 0;
  let byLife = 0;
  let byDecking = 0;
  const turns: number[] = [];
  const actions: number[] = [];
  const decisionKinds = new Set<DecisionKind>();
  const total = newTally();
  // Number of games with at least one of each combat event.
  const gamesWith: Record<keyof CombatTally, number> = { ...newTally() };
  // The same count over the combat-style coverage games only.
  const coverageGamesWith: Record<keyof CombatTally, number> = { ...newTally() };

  for (let g = 1; g <= GAMES + COVERAGE_GAMES; g += 1) {
    const isCoverage = g > GAMES;
    const inner = [
      new RandomLegalAgent({ seed: 1000 + 2 * g }),
      new RandomLegalAgent({ seed: 1001 + 2 * g }),
    ] as const;
    const tally = newTally();
    const kinds = isCoverage ? new Set<DecisionKind>() : decisionKinds;
    const agents = [recording(inner[0], kinds, tally), recording(inner[1], kinds, tally)] as const;
    // Deck styles rotate: spell mirror, creature mirror, and both mixed ways (see stylesFor).
    const styles = isCoverage ? (['combat', 'combat'] as const) : stylesFor(g);
    const run = await runGame(smallGameConfig(g, styles), agents, {
      maxTurns: MAX_TURNS,
      maxActions: MAX_ACTIONS,
    });
    // Failures name the game so it can be rerun alone.
    const tag = `game ${g}`;
    expect(run.reason, tag).toBe('result');
    expect(run.result, tag).not.toBeNull();
    expect(run.counters.fallbacks, tag).toBe(0);
    expect(run.counters.rejectedActions, tag).toBe(0);
    expect(run.agentErrors, tag).toEqual([]);
    expect(inner[0].fallbacks, tag).toHaveLength(0);
    expect(inner[1].fallbacks, tag).toHaveLength(0);

    if (isCoverage) {
      for (const key of Object.keys(tally) as (keyof CombatTally)[]) {
        if (tally[key] > 0) coverageGamesWith[key] += 1;
      }
      expect(tally.concedes, tag).toBe(0);
      continue;
    }
    if (run.result?.kind === 'win') wins[run.result.winner] = (wins[run.result.winner] ?? 0) + 1;
    else draws += 1;
    // The loser has 0 or less life (burn) or drew from an empty library (decking).
    const losers = run.state.seats.filter((seat) => seat.hasLost);
    if (losers.some((seat) => seat.life <= 0)) byLife += 1;
    else byDecking += 1;
    addTally(total, tally);
    for (const key of Object.keys(tally) as (keyof CombatTally)[]) {
      if (tally[key] > 0) gamesWith[key] += 1;
    }
    expect(tally.concedes, tag).toBe(0);
    turns.push(run.state.turn.number);
    actions.push(run.log.length);
  }

  // The 100 games must exercise every decision kind, not only priority, except the kinds only a
  // dedicated deck style asks (their own soak test checks them): "As this enters, choose ..." comes
  // from cards that no style of this mix plays, so that these seeded games stay as they were (D-106;
  // chosen-games.test.ts asks and answers it in every game it plays). X comes from cards that no
  // style of this mix plays either (D-103; x-games.test.ts), and so do the modes of a modal spell or
  // ability (D-114; modal-games.test.ts). The same holds for the pay options of Convoke, Improvise and
  // Delve (D-120; keyword-batch2-games.test.ts).
  const askedElsewhere: readonly DecisionKind[] = [
    'chooseOption',
    'chooseX',
    'chooseModes',
    'choosePayOptions',
  ];
  expect([...decisionKinds].sort()).toEqual(
    [...DECISION_KINDS].filter((kind) => !askedElsewhere.includes(kind)).sort(),
  );

  // The creature decks made combat happen: attacks, blocks and damage assignments occurred, and
  // each combat keyword in the fixtures was used in at least one attack.
  expect(gamesWith.attacks).toBeGreaterThan(0);
  expect(gamesWith.blocks).toBeGreaterThan(0);
  expect(gamesWith.assignDamageDecisions).toBeGreaterThan(0);
  if (CREATURES.length > 0) expect(gamesWith.attacks).toBeGreaterThan(GAMES / 2);
  // The keyword assertions count the generic games and the coverage games together; the coverage
  // games guarantee them (their decks hold nothing but these creatures), the generic ones add more.
  const keywordGames = (key: keyof CombatTally) => gamesWith[key] + coverageGamesWith[key];
  if (POOL_KEYWORDS.has('trample')) expect(keywordGames('trampleAttackers')).toBeGreaterThan(0);
  if (POOL_KEYWORDS.has('menace')) expect(keywordGames('menaceBlockDecisions')).toBeGreaterThan(0);
  if (POOL_KEYWORDS.has('firstStrike') || POOL_KEYWORDS.has('doubleStrike'))
    expect(keywordGames('firstStrikeSteps')).toBeGreaterThan(0);

  const sorted = [...turns].sort((a, b) => a - b);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const summary = {
    winsSeat0: wins[0],
    winsSeat1: wins[1],
    draws,
    endedByLife: byLife,
    endedByDecking: byDecking,
    turnsMin: sorted[0],
    turnsMedian: sorted[Math.floor(sorted.length / 2)],
    turnsMax: sorted[sorted.length - 1],
    turnsMean: Number(mean(turns).toFixed(1)),
    actionsMean: Math.round(mean(actions)),
    actionsMax: Math.max(...actions),
    creatureFixtures: CREATURES.length,
    gamesWith,
    coverageGamesWith,
    totals: total,
  };
  console.log(`100-game distribution: ${JSON.stringify(summary)}`);
  expect(byLife + byDecking).toBe(GAMES);
  expect((wins[0] ?? 0) + (wins[1] ?? 0) + draws).toBe(GAMES);
}, 180_000);
