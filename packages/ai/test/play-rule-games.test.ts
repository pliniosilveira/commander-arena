// Slice soak (D-125): whole games (the `soakGames()` count, test/soak.ts) with the 'playRules' deck style (SYNTHETIC extra-land-drop cards, and
// the top-card, attack-tax and optional-untap cards as the slice grows) between random agents, with
// CasualAgent in some seats. Every game finishes with a result, no fallback, no rejected action, no agent
// error and consistent state after every action; the action log replays to the same final state; and every
// path of the slice occurs.
import { checkInvariants, getView, stateHash } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { type Agent, CasualAgent, RandomLegalAgent, replayGame } from '../src/index';
import { cardNameOf } from './game-names';
import {
  PLAY_RULE_NAMES,
  PLAY_RULE_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

interface Tally {
  landPlays: number;
  extraLandPlays: number;
  casualExtraLandPlays: number;
  /** Views in which a seat saw its own top card (CR 401.5). */
  topCardViews: number;
  /** Attacks of the declare attackers step that a tax covered, and what happened (CR 508.1h). */
  taxedDeclarations: number;
  taxPaid: number;
  taxCasualPaid: number;
  /** Declarations in which the attacker chose fewer creatures than it could (a tax made it hold back). */
  declinedByTax: number;
  /** The untap question (CR 502.3): asked, answered with every permanent, answered with fewer. */
  untapAsked: number;
  untapAll: number;
  untapSome: number;
  untapCasualAll: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  landPlays: 0,
  extraLandPlays: 0,
  casualExtraLandPlays: 0,
  topCardViews: 0,
  taxedDeclarations: 0,
  taxPaid: 0,
  taxCasualPaid: 0,
  declinedByTax: 0,
  untapAsked: 0,
  untapAll: 0,
  untapSome: 0,
  untapCasualAll: 0,
  byCard: new Map(),
});

/** Notes what one applied action did, for the paths this slice added. */
function note(tally: Tally, casual: ReadonlySet<number>, step: StepInfo): void {
  const { after, events } = step;
  // CR 401.5 (D-125): a seat sees its own top card only, and it is the real one; the other seat never does.
  if (after.actionCount % 5 === 0) {
    for (const seat of [0, 1] as const) {
      const view = getView(after, seat);
      for (const s of view.seats) {
        if (s.id !== seat) {
          if (s.libraryTop !== undefined) throw new Error('a top card in another seat view');
        } else if (s.libraryTop !== undefined) {
          if (s.libraryTop.id !== after.seats[seat]?.library[0])
            throw new Error('not the top card');
          tally.topCardViews += 1;
        }
      }
    }
  }
  // CR 508.1h (D-125): a declaration covered by a tax is paid for before the attackers are declared.
  const asked = step.before.pending;
  if (asked?.kind === 'declareAttackers' && asked.attackCosts !== undefined) {
    tally.taxedDeclarations += 1;
    const sent = step.action.kind === 'declareAttackers' ? step.action.attacks.length : 0;
    if (sent < asked.candidates.length) tally.declinedByTax += 1;
  }
  if (
    asked?.kind === 'payMana' &&
    asked.purpose === 'attackTax' &&
    step.action.kind === 'payAuto'
  ) {
    tally.taxPaid += 1;
    if (casual.has(asked.seat)) tally.taxCasualPaid += 1;
    // The declaration that was paid for is now in combat, with the mana spent.
    if (step.after.combat === null) throw new Error('the attackers were not declared');
    if (
      asked.attacks === undefined ||
      step.after.combat.attackers.length !== asked.attacks.length
    ) {
      throw new Error('the declared attackers are not the ones that were paid for');
    }
  }
  // CR 502.3 (D-125): the untap question; what was chosen untapped and the rest stayed tapped.
  if (asked?.kind === 'choosePermanent' && asked.purpose === 'untap') {
    tally.untapAsked += 1;
    if (step.action.kind !== 'choosePermanents')
      throw new Error('the untap question has no answer');
    const chosen = step.action.objects;
    for (const id of asked.legal) {
      const tapped = step.after.objects[id]?.tapped === true;
      if (tapped === chosen.includes(id)) throw new Error('the answer was not carried out');
    }
    if (chosen.length === asked.legal.length) {
      tally.untapAll += 1;
      if (casual.has(asked.seat)) tally.untapCasualAll += 1;
    } else {
      tally.untapSome += 1;
    }
    if (step.after.turn.step !== 'upkeep') throw new Error('the untap step did not end');
  }
  for (const e of events) {
    if (e.kind === 'spellCast') {
      const name = cardNameOf(after, e.object);
      tally.byCard.set(name, (tally.byCard.get(name) ?? 0) + 1);
    }
    if (e.kind === 'landPlayed') {
      tally.landPlays += 1;
      const played = after.seats[e.seat]?.landsPlayedThisTurn ?? 0;
      // CR 305.2a: never more lands in a turn than the limit the view reports.
      const allowed = getView(after, e.seat).seats[e.seat]?.landPlaysAllowed ?? 0;
      if (played > allowed) throw new Error(`${played} lands played, ${allowed} allowed`);
      if (played >= 2) {
        tally.extraLandPlays += 1;
        if (casual.has(e.seat)) tally.casualExtraLandPlays += 1;
      }
    }
  }
}

test(
  `${GAMES} play-rule games run clean, replay exactly and use every path of the slice`,
  async () => {
    const total = newTally();
    const turns: number[] = [];
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = PLAY_RULE_STYLE_PAIRS[g % PLAY_RULE_STYLE_PAIRS.length] ?? [
        'playRules',
        'playRules',
      ];
      const config = smallGameConfig(g, styles);
      // Seats of CasualAgent by game: seat 0, seat 1, both, neither (random against random).
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? new CasualAgent({ seed: 9500 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 9500 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const tally = newTally();
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        note(tally, casual, step);
        const problems = checkInvariants(step.after);
        if (problems.length > 0) throw new Error(`game ${g}: ${problems.join('; ')}`);
      });
      const tag = `game ${g}`;
      expect(run.capped, tag).toBe(false);
      expect(run.state.result, tag).not.toBeNull();
      for (const agent of agents) expect(agent.fallbacks, tag).toHaveLength(0);
      expect(stateHash(replayGame(config, log)), tag).toBe(stateHash(run.state));
      turns.push(run.state.turn.number);
      for (const key of Object.keys(tally) as (keyof Tally)[]) {
        const v = tally[key];
        if (typeof v === 'number') (total[key] as number) += v;
      }
      for (const [name, n] of tally.byCard)
        total.byCard.set(name, (total.byCard.get(name) ?? 0) + n);
    }
    const summary = {
      ...total,
      byCard: Object.fromEntries([...total.byCard].sort()),
      turnsMax: Math.max(...turns),
    };
    console.log(`100 play-rule games: ${JSON.stringify(summary)}`);

    expectPath(total.extraLandPlays);
    expectPath(total.casualExtraLandPlays);
    expectPath(total.topCardViews);
    expectPath(total.taxedDeclarations);
    expectPath(total.taxPaid);
    expectPath(total.taxCasualPaid);
    expectPath(total.declinedByTax);
    expectPath(total.untapAsked);
    expectPath(total.untapAll);
    expectPath(total.untapSome);
    expectPath(total.untapCasualAll);
    // Every play-rule card was cast at least once somewhere in the 100 games.
    for (const name of PLAY_RULE_NAMES) {
      expectPath(total.byCard.get(name) ?? 0, name);
    }
  },
  soakTimeout(240_000),
);
