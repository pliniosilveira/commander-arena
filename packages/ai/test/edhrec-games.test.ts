// Slice soak (D-216 to D-220): whole games with the 'edhrec' deck style (SYNTHETIC cards of the Vraska EDHREC deck program: lands to untap, the piles of the top
// cards, how many cards to draw for another player, a delayed mana, a batch trigger of tokens, magecraft, a mana ability that sacrifices a creature, the
// replacements of the creation of artifact tokens, doubled triggers, a restricted equip and a payment for the attackers of the opponents) between random agents,
// with CasualAgent in some seats. Every game finishes with a result, no fallback, no rejected action and consistent state after every action; the action log
// replays to the same final state; and rules of the slice are restated from the events and the state, apart from the engine: a player who has Dragon Maker never
// has an artifact token created for them, an answer of "up to N cards" draws that many, and a pile of the top cards is chosen among the cards looked at.
// The count is `soakGames()` (D-126); the path checks run from 100 games up.
import { checkInvariants, stateHash } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { type Agent, CasualAgent, RandomLegalAgent, replayGame } from '../src/index';
import { EDHREC_STYLE_PAIRS, smallGameConfig, stepGame } from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

interface Tally {
  untapQuestions: number;
  splitQuestions: number;
  drawUpToQuestions: number;
  dragonsMade: number;
  treasuresMade: number;
  thoptersMade: number;
}

const newTally = (): Tally => ({
  untapQuestions: 0,
  splitQuestions: 0,
  drawUpToQuestions: 0,
  dragonsMade: 0,
  treasuresMade: 0,
  thoptersMade: 0,
});

test(
  `${GAMES} Vraska EDHREC program games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = EDHREC_STYLE_PAIRS[g % EDHREC_STYLE_PAIRS.length] ?? ['edhrec', 'edhrec'];
      const config = smallGameConfig(g, styles);
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? new CasualAgent({ seed: 24500 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 24500 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const log: { seat: number; action: unknown }[] = [];
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        const problems = checkInvariants(step.after);
        if (problems.length > 0) throw new Error(`game ${g}: ${problems.join('; ')}`);
        const pending = step.before.pending;
        if (pending?.kind === 'choosePermanent' && pending.purpose === 'untapChoice') {
          total.untapQuestions += 1;
          if (step.action.kind === 'choosePermanents') {
            // A chosen land is one of the legal ones, and at most the most that may be untapped.
            if (step.action.objects.length > pending.max)
              throw new Error('too many lands to untap');
            for (const id of step.action.objects) {
              if (!pending.legal.includes(id))
                throw new Error('an untap of a land that was not offered');
            }
          }
        }
        if (pending?.kind === 'chooseCards' && pending.purpose === 'lookSplit') {
          total.splitQuestions += 1;
          if (step.action.kind === 'chooseCards') {
            for (const id of step.action.objects) {
              if (!pending.legal.includes(id))
                throw new Error('a pile chosen among cards not offered');
            }
          }
        }
        if (pending?.kind === 'chooseX' && pending.purpose === 'drawUpTo') {
          total.drawUpToQuestions += 1;
          if (step.action.kind === 'chooseX') {
            const drawn = step.events.filter(
              (e) => e.kind === 'cardDrawn' && e.seat === pending.seat,
            ).length;
            // A library may run out: never more than the answer, and exactly it with cards to draw.
            const library = step.before.seats[pending.seat]?.library.length ?? 0;
            if (drawn !== Math.min(step.action.value, library)) {
              throw new Error(`"up to ${pending.max}" answered ${step.action.value} drew ${drawn}`);
            }
          }
        }
        // A permanent that makes Dragons of artifact tokens: the player's artifact tokens are never made as they are (the Treasure of a copy or a spell is a Dragon).
        const hasDragonMaker = (seat: number) =>
          step.before.battlefield.some((id) => {
            const o = step.before.objects[id];
            return (
              o !== undefined &&
              o.controller === seat &&
              o.card !== null &&
              step.before.definitions[step.before.cards[o.card]?.definition ?? -1]?.name ===
                'SYNTHETIC Dragon Maker'
            );
          });
        for (const e of step.events) {
          if (e.kind !== 'tokenCreated') continue;
          if (e.name === 'Dragon') total.dragonsMade += 1;
          if (e.name === 'Thopter') total.thoptersMade += 1;
          if (e.name === 'Treasure') {
            total.treasuresMade += 1;
            if (hasDragonMaker(e.seat)) {
              throw new Error('an artifact token was created for a player with the Dragon maker');
            }
          }
        }
      });
      const tag = `game ${g}`;
      expect(run.capped, tag).toBe(false);
      expect(run.state.result, tag).not.toBeNull();
      for (const agent of agents) expect(agent.fallbacks, tag).toHaveLength(0);
      expect(stateHash(replayGame(config, log as Parameters<typeof replayGame>[1])), tag).toBe(
        stateHash(run.state),
      );
    }
    console.log(`${GAMES} Vraska EDHREC program games: ${JSON.stringify(total)}`);
    expectPath(total.untapQuestions, 'lands to untap');
    expectPath(total.splitQuestions, 'a pile of the top cards');
    expectPath(total.dragonsMade, 'a Dragon made instead of an artifact token');
  },
  soakTimeout(240_000),
);
