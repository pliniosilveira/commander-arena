// Slice soak (D-396, D-397): whole games with the 'danithaReveal' deck style (SYNTHETIC cards of the engine fixtures `synthetic-danitha-g1a.ts`: a sorcery, a creature with an enters
// trigger, an enchantment sacrificed for its ability and a sorcery with a token, all of which reveal the top cards of the library, ask which card of a kind to take into the hand and
// put the rest into the graveyard, and a sorcery that only looks, with bodies and removal) between random agents, with CasualAgent in some seats. Every game finishes with a
// result, no fallback, no rejected action and consistent state after every action; the action log replays to the same final state; and two rules of the slice are restated from the
// states, apart from the engine: the step that asks "which card to take" has told everyone every card of the top (CR 701.20a: one `cardsRevealed` event with as many cards as the
// question lists, a reveal never a look), and the answer moves exactly the cards looked at out of the library (the card taken to the hand, the rest to the graveyard, CR 701.20b:
// nothing moved before). The question is the `lookTake` of old, so the agents answer only the questions they always do. The count is `soakGames()` (D-126); the path checks run
// from 100 games up.
import { checkInvariants, stateHash } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { type Agent, CasualAgent, RandomLegalAgent, replayGame } from '../src/index';
import { stackNameOf, tokenOrFaceNameOf } from './game-names';
import {
  DANITHA_G1A_NAMES,
  DANITHA_G1A_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

interface Tally {
  reveals: number;
  looks: number;
  taken: number;
  none: number;
  spawns: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  reveals: 0,
  looks: 0,
  taken: 0,
  none: 0,
  spawns: 0,
  byCard: new Map(),
});

function checkRules(t: Tally, step: StepInfo): void {
  const { before, after, events, action } = step;
  for (const e of events) {
    if (e.kind === 'spellCast') {
      const name = tokenOrFaceNameOf(after, e.object);
      t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
    }
    if (e.kind === 'tokenCreated' && e.name === 'Eldrazi Spawn') t.spawns += 1;
  }
  // The step that raised the question of a take.
  const asked = after.pending;
  if (asked?.kind === 'chooseCards' && asked.purpose === 'lookTake' && before.pending !== asked) {
    const revealed = events.filter((e) => e.kind === 'cardsRevealed');
    const isReveal = asked.prompt.startsWith('Reveal the top');
    if (isReveal) {
      t.reveals += 1;
      // CR 701.20a: one event, every card of the top, in the order of the question.
      if (revealed.length !== 1 || revealed[0]?.names.length !== (asked.looked ?? []).length) {
        throw new Error(
          `a reveal of ${(asked.looked ?? []).length} cards told ${JSON.stringify(revealed)}`,
        );
      }
      // CR 701.20b: nothing has moved.
      for (const id of asked.looked ?? []) {
        if (after.objects[id]?.zone !== 'library') throw new Error(`${id} left the library early`);
      }
    } else {
      t.looks += 1;
      if (revealed.length > 0) throw new Error('a look revealed a card before the answer');
    }
  }
  // The answer of a reveal: exactly the cards looked at leave the library, the card taken is in the hand.
  const was = before.pending;
  if (
    was?.kind === 'chooseCards' &&
    was.purpose === 'lookTake' &&
    was.prompt.startsWith('Reveal the top') &&
    action.kind === 'chooseCards'
  ) {
    const looked = was.looked ?? [];
    const library = (s: StepInfo['before']) => s.seats[was.seat]?.library.length ?? 0;
    if (library(after) !== library(before) - looked.length) {
      throw new Error(`the reveal moved ${library(before) - library(after)} of ${looked.length}`);
    }
    if (action.objects.length === 0) t.none += 1;
    else t.taken += action.objects.length;
    if (action.objects.length > 1) throw new Error('more than one card taken');
  }
  void stackNameOf;
}

test(
  `${GAMES} danithaReveal games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = DANITHA_G1A_STYLE_PAIRS[g % DANITHA_G1A_STYLE_PAIRS.length] ?? [
        'danithaReveal',
        'danithaReveal',
      ];
      const config = smallGameConfig(g, styles);
      // Seats of CasualAgent by game: seat 0, seat 1, both, neither (random against random).
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? new CasualAgent({ seed: 41900 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 41900 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const t = newTally();
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        checkRules(t, step);
        const problems = checkInvariants(step.after);
        if (problems.length > 0) throw new Error(`game ${g}: ${problems.join('; ')}`);
      });
      const tag = `game ${g}`;
      expect(run.capped, tag).toBe(false);
      expect(run.state.result, tag).not.toBeNull();
      for (const agent of agents) expect(agent.fallbacks, tag).toHaveLength(0);
      expect(stateHash(replayGame(config, log)), tag).toBe(stateHash(run.state));
      total.reveals += t.reveals;
      total.looks += t.looks;
      total.taken += t.taken;
      total.none += t.none;
      total.spawns += t.spawns;
      for (const [name, n] of t.byCard) total.byCard.set(name, (total.byCard.get(name) ?? 0) + n);
    }
    console.log(
      `${GAMES} danithaReveal games: ${JSON.stringify({ ...total, byCard: Object.fromEntries([...total.byCard].sort()) })}`,
    );
    expectPath(total.reveals);
    expectPath(total.looks);
    expectPath(total.taken);
    expectPath(total.spawns);
    // Every card of the slice that is cast or activated was used at least once somewhere in the games (the enchantment is cast, then sacrificed).
    for (const name of DANITHA_G1A_NAMES) expectPath(total.byCard.get(name) ?? 0, name);
  },
  soakTimeout(240_000),
);
