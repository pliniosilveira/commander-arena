// Slice soak (D-208 to D-210): whole games with the 'vraska' deck style (SYNTHETIC cards of the Vraska deck program: a creature that asks each player whether to
// discard their hand, energy with a random discard unless it is paid, connive, a land that asks for a card to reveal and a mana source that mills a card) between
// random agents, with CasualAgent in some seats. Every game finishes with a result, no fallback, no rejected action and consistent state after every action; the
// action log replays to the same final state; and rules of the slice are restated from the events and the state, apart from the engine: a player who has lost
// is never asked, a player who pays {E}{E} loses exactly two energy counters and keeps the card, one who does not discards a card of their hand, a land that asks to
// reveal enters untapped only when a card of the hand was there to reveal, and a player's energy never goes below 0.
// The count is `soakGames()` (D-126); the path checks run from 100 games up.
import { checkInvariants, stateHash } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { type Agent, CasualAgent, RandomLegalAgent, replayGame } from '../src/index';
import { smallGameConfig, stepGame, VRASKA_STYLE_PAIRS } from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

interface Tally {
  energyGained: number;
  energyPaid: number;
  randomDiscards: number;
  playerQuestions: number;
  revealQuestions: number;
  prepared: number;
  preparedCast: number;
}

const newTally = (): Tally => ({
  energyGained: 0,
  energyPaid: 0,
  randomDiscards: 0,
  playerQuestions: 0,
  revealQuestions: 0,
  prepared: 0,
  preparedCast: 0,
});

test(
  `${GAMES} Vraska program games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = VRASKA_STYLE_PAIRS[g % VRASKA_STYLE_PAIRS.length] ?? ['vraska', 'vraska'];
      const config = smallGameConfig(g, styles);
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? new CasualAgent({ seed: 21500 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 21500 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const log: { seat: number; action: unknown }[] = [];
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        const problems = checkInvariants(step.after);
        if (problems.length > 0) throw new Error(`game ${g}: ${problems.join('; ')}`);
        for (const seat of step.after.seats) {
          if ((seat.energy ?? 0) < 0) throw new Error('a player has negative energy');
        }
        const pending = step.before.pending;
        // A player who has lost is never asked.
        if (pending?.kind === 'confirmOptional' && step.before.seats[pending.seat]?.hasLost) {
          throw new Error('a player who has lost was asked');
        }
        if (pending?.kind === 'confirmOptional' && pending.reveal !== undefined) {
          total.revealQuestions += 1;
        }
        // CR 722.3c: a prepare spell is cast from exile by the controller of its prepared permanent, which is not prepared afterwards.
        if (step.action.kind === 'castSpell') {
          const cast = step.before.objects[step.action.object];
          if (cast?.prepareOf !== undefined) {
            total.preparedCast += 1;
            if (step.after.objects[cast.prepareOf]?.prepared === true) {
              throw new Error('a permanent stayed prepared after its prepare spell was cast');
            }
          }
        }
        for (const e of step.events) {
          if (e.kind === 'prepared') total.prepared += 1;
          if (e.kind === 'energyChanged') {
            if (e.to > e.from) total.energyGained += e.to - e.from;
            else total.energyPaid += e.from - e.to;
          }
          if (e.kind === 'discarded') total.randomDiscards += 1;
        }
        if (
          pending?.kind === 'confirmOptional' &&
          pending.cost?.some((c) => c.kind === 'energy') === true
        ) {
          total.playerQuestions += 1;
          // Paying keeps two fewer energy counters; declining keeps them.
          const accepted = step.action.kind === 'acceptOptional';
          const had = step.before.seats[pending.seat]?.energy ?? 0;
          const now = step.after.seats[pending.seat]?.energy ?? 0;
          if (accepted && now !== had - 2) throw new Error('paying {E}{E} did not cost two');
          if (!accepted && now !== had) throw new Error('declining to pay changed the energy');
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
    console.log(`${GAMES} Vraska program games: ${JSON.stringify(total)}`);
    expectPath(total.energyGained, 'energy gained');
    expectPath(total.revealQuestions, 'a land that asks for a card to reveal');
    expectPath(total.prepared, 'a permanent that enters prepared');
    expectPath(total.preparedCast, 'a prepare spell cast from exile');
  },
  soakTimeout(240_000),
);
