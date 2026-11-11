// Slice soak (D-185): whole games with the 'korvoldKeywords' deck style (SYNTHETIC cards of the Korvold slice 6: Encore, Devour on a card and on a token a
// card makes each upkeep, Riot of its own and given to a group, a land that is a creature with riot, and creature spells that cannot be countered) between
// random agents, with CasualAgent in some seats. Every game finishes with a result, no fallback, no rejected action and consistent state after every
// action; the action log replays to the same final state; and rules of the slice are restated from the events and the state, apart from the engine: a
// permanent with devour N enters with N +1/+1 counters for each creature sacrificed as it entered, the token copies Encore makes do not outlive the turn
// they were made in and every one of them was a token, and a spell that Rhythm of the Wild protects is never countered.
// The count is `soakGames()` (D-126); the path checks run from 100 games up.
import {
  checkInvariants,
  type GameState,
  getView,
  type ObjectId,
  stateHash,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { type Agent, CasualAgent, RandomLegalAgent, replayGame } from '../src/index';
import {
  KORVOLD_KEYWORD_LAND_NAMES,
  KORVOLD_KEYWORD_NAMES,
  KORVOLD_KEYWORD_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

interface Tally {
  encores: number;
  devourQuestions: number;
  devourSacrificed: number;
  riotQuestions: number;
  riotCounters: number;
  riotHaste: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  encores: 0,
  devourQuestions: 0,
  devourSacrificed: 0,
  riotQuestions: 0,
  riotCounters: 0,
  riotHaste: 0,
  byCard: new Map(),
});

const nameOf = (state: GameState, id: ObjectId): string => {
  const obj = state.objects[id] ?? state.lki[id]?.object;
  if (obj === undefined) return '?';
  if (obj.token !== null) return obj.token.characteristics.name;
  const card = obj.card == null ? undefined : state.cards[obj.card];
  return card === undefined
    ? '?'
    : (state.definitions[card.definition]?.faces[obj.face ?? 0]?.name ?? '?');
};

const tally = (t: Tally, name: string): void => {
  t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
};

interface Memory {
  /** The tokens an Encore ability made, with the turn number they were made in. */
  encoreTokens: Map<ObjectId, number>;
}

function checkRules(t: Tally, step: StepInfo, memory: Memory): void {
  const { before, after, action, events } = step;

  // An Encore token is made while the ability resolves: the delayed triggers that sacrifice it name it, so those are the new tokens.
  for (const d of after.delayedTriggers) {
    if (d.ability.effect.kind === 'sacrifice' && !memory.encoreTokens.has(d.source)) {
      const obj = after.objects[d.source];
      if (obj !== undefined) {
        if (obj.token === null) throw new Error('a copy Encore made is not a token');
        memory.encoreTokens.set(d.source, after.turn.number);
        t.encores += 1;
      }
    }
  }
  // CR 702.141a: sacrificed at the beginning of the next end step, so it is gone before the next turn begins.
  for (const e of events) {
    if (e.kind === 'turnBegan') {
      for (const [id, turn] of memory.encoreTokens) {
        if (turn < after.turn.number && after.objects[id]?.zone === 'battlefield') {
          throw new Error(`the Encore token ${id} outlived its turn`);
        }
      }
      memory.encoreTokens.clear();
    }
    if (e.kind === 'spellCast') tally(t, nameOf(after, e.object));
    if (e.kind === 'landPlayed') tally(t, nameOf(after, e.object));
    if (e.kind === 'tokenCreated') tally(t, e.name);
    if (e.kind === 'optionChosen' && e.purpose === 'riot') {
      t.riotQuestions += 1;
      if (e.option === 'counter') t.riotCounters += 1;
      else t.riotHaste += 1;
    }
  }
  if (before.pending?.kind === 'choosePermanent' && before.pending.purpose === 'devour') {
    t.devourQuestions += 1;
    if (action.kind === 'choosePermanents') {
      t.devourSacrificed += action.objects.length;
      // The creatures chosen are creatures of the seat's, from the list the question offered.
      for (const id of action.objects) {
        if (!before.pending.legal.includes(id)) throw new Error('a creature that was not legal');
      }
    }
  }
  // CR 101.2: a creature spell of the seat that controls a Rhythm of the Wild is never countered.
  for (const e of events) {
    if (e.kind !== 'countered') continue;
    const spell = before.objects[e.object];
    if (spell === undefined || spell.zone !== 'stack') continue;
    const types =
      getView(before, spell.controller).stack.find((o) => o.id === e.object)?.types ?? [];
    const rhythm = before.battlefield.some(
      (id) =>
        before.objects[id]?.controller === spell.controller &&
        nameOf(before, id) === 'SYNTHETIC Rhythm of the Wild',
    );
    if (rhythm && types.includes('creature')) {
      throw new Error('a creature spell that Rhythm of the Wild protects was countered');
    }
  }
}

test(
  `${GAMES} Korvold keywords games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    const turns: number[] = [];
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = KORVOLD_KEYWORD_STYLE_PAIRS[g % KORVOLD_KEYWORD_STYLE_PAIRS.length] ?? [
        'korvoldKeywords',
        'korvoldKeywords',
      ];
      const config = smallGameConfig(g, styles);
      // Seats of CasualAgent by game: seat 0, seat 1, both, neither (random against random).
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? new CasualAgent({ seed: 18500 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 18500 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const t = newTally();
      const memory: Memory = { encoreTokens: new Map() };
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        checkRules(t, step, memory);
        const problems = checkInvariants(step.after);
        if (problems.length > 0) throw new Error(`game ${g}: ${problems.join('; ')}`);
      });
      const tag = `game ${g}`;
      expect(run.capped, tag).toBe(false);
      expect(run.state.result, tag).not.toBeNull();
      for (const agent of agents) expect(agent.fallbacks, tag).toHaveLength(0);
      expect(stateHash(replayGame(config, log)), tag).toBe(stateHash(run.state));
      turns.push(run.state.turn.number);
      for (const key of Object.keys(t) as (keyof Tally)[]) {
        const v = t[key];
        if (typeof v === 'number') (total[key] as number) += v;
      }
      for (const [name, n] of t.byCard) total.byCard.set(name, (total.byCard.get(name) ?? 0) + n);
    }
    const summary = {
      ...total,
      byCard: Object.fromEntries([...total.byCard].sort()),
      turnsMax: Math.max(...turns),
    };
    console.log(`${GAMES} Korvold keywords games: ${JSON.stringify(summary)}`);

    // Every card of the slice was cast or played at least once somewhere in the games.
    for (const name of [...KORVOLD_KEYWORD_NAMES, ...KORVOLD_KEYWORD_LAND_NAMES]) {
      expectPath(total.byCard.get(name) ?? 0, name);
    }
    expectPath(total.devourQuestions, 'devour');
    expectPath(total.riotQuestions, 'riot');
    expectPath(total.encores, 'encore');
  },
  soakTimeout(240_000),
);
