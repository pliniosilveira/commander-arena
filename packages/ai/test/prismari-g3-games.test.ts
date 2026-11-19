// Slice soak (issue 87, D-660 and later): whole games with the 'prismariG3' deck style (SYNTHETIC cards of the engine fixtures `synthetic-prismari-g3.ts`: the sorceries that cast cards from
// exile without paying their mana costs, the two piles with an opponent's choice, the cards exiled until a nonland card, Demonstrate and Retrace) between random agents, with CasualAgent and
// HeuristicAgent in some seats. Every game finishes with a result, no fallback, no rejected action and consistent state after every action; the action log replays to the same final
// state; and, with the rules read again here from 707.12 (copies of spells) and 704.5e, at every step:
//   - a copy of a card is on the stack or the battlefield, and waits in exile only while its controller answers (CR 707.12, 704.5e).
// The count is `soakGames()` (D-126); the path checks run from 100 games up.
import { applyAction, checkInvariants, getLegalActions, stateHash } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import {
  type Agent,
  CasualAgent,
  HeuristicAgent,
  RandomLegalAgent,
  replayGame,
} from '../src/index';
import { PRISMARI_G3_STYLE_PAIRS, type StepInfo, smallGameConfig, stepGame } from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

interface Tally {
  casts: number;
  copiesCast: number;
  decisions: number;
}

const newTally = (): Tally => ({ casts: 0, copiesCast: 0, decisions: 0 });

function checkRules(t: Tally, step: StepInfo): void {
  const { after, events } = step;
  // CR 707.12, 704.5e: a copy of a card ceases to exist outside the stack and the battlefield (it waits in exile only for the answer).
  for (const obj of Object.values(after.objects)) {
    if (obj.cardCopy === true && obj.zone !== 'stack' && obj.zone !== 'battlefield') {
      expect(obj.zone, 'a copy of a card waits in exile only for the answer').toBe('exile');
      expect(after.pending, 'a copy of a card waits in exile only for the answer').not.toBeNull();
    }
  }
  if (after.pending !== null) t.decisions += 1;
  for (const e of events) {
    if (e.kind !== 'spellCast') continue;
    t.casts += 1;
    const obj = after.objects[e.object];
    if (obj?.card === null && obj.copyOf != null) t.copiesCast += 1;
  }
}

test(
  `${GAMES} prismariG3 games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = PRISMARI_G3_STYLE_PAIRS[g % PRISMARI_G3_STYLE_PAIRS.length] ?? [
        'prismariG3',
        'prismariG3',
      ];
      const config = smallGameConfig(g, styles);
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? g % 8 < 4
            ? new CasualAgent({ seed: 265000 + 2 * g + seat })
            : new HeuristicAgent({ seed: 265000 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 265000 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const t = newTally();
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        checkRules(t, step);
        const problems = checkInvariants(step.after);
        if (problems.length > 0) throw new Error(`game ${g}: ${problems.join('; ')}`);
        if (step.index % 97 === 0) {
          const listed = getLegalActions(step.before, step.seat);
          expect(
            listed.some((a) => JSON.stringify(a) === JSON.stringify(step.action)) ||
              applyAction(step.before, step.seat, step.action).ok,
          ).toBe(true);
        }
      });
      const tag = `game ${g}`;
      expect(run.capped, tag).toBe(false);
      expect(run.state.result, tag).not.toBeNull();
      for (const agent of agents) expect(agent.fallbacks, tag).toHaveLength(0);
      expect(stateHash(replayGame(config, log)), tag).toBe(stateHash(run.state));
      for (const key of Object.keys(total) as (keyof Tally)[]) total[key] += t[key];
    }
    console.log(`${GAMES} prismariG3 games: ${JSON.stringify(total)}`);
    expectPath(total.casts, 'a spell that was cast');
    expectPath(total.decisions, 'a decision that was pending');
  },
  soakTimeout(600_000),
);
