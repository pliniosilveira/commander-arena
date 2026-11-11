// Slice soak (D-128): whole games with the 'later' deck style (SYNTHETIC delayed triggers, Suspend, Madness and
// Foretell cards) between random agents, with CasualAgent in some seats. Every game finishes with a result, no
// fallback, no rejected action, no agent error and consistent state after every action; the action log replays to
// the same final state; a face-down foretold card is never shown to the other seat; and every path of the slice occurs.
// The count is `soakGames()` (D-126); the path checks run from 100 games up.
import { checkInvariants, getView, stateHash } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { type Agent, CasualAgent, RandomLegalAgent, replayGame } from '../src/index';
import { cardNameOf } from './game-names';
import {
  LATER_NAMES,
  LATER_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

interface Tally {
  delayedCreated: number;
  delayedTriggered: number;
  suspended: number;
  timeTicks: number;
  suspendAsked: number;
  suspendCast: number;
  suspendDeclined: number;
  /** A suspended creature that entered with haste. */
  suspendHaste: number;
  /** A suspended card whose last counter came off with nothing to cast it at: it stayed exiled, nothing asked. */
  suspendNotAsked: number;
  madnessExiled: number;
  madnessAsked: number;
  madnessCast: number;
  madnessDeclined: number;
  /** A card with madness that went to the graveyard because it could not be cast (nothing asked). */
  madnessNotAsked: number;
  foretold: number;
  foretellCast: number;
  foretoldViewsChecked: number;
  casualSpecial: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  delayedCreated: 0,
  delayedTriggered: 0,
  suspended: 0,
  timeTicks: 0,
  suspendAsked: 0,
  suspendCast: 0,
  suspendDeclined: 0,
  suspendHaste: 0,
  suspendNotAsked: 0,
  madnessExiled: 0,
  madnessAsked: 0,
  madnessCast: 0,
  madnessDeclined: 0,
  madnessNotAsked: 0,
  foretold: 0,
  foretellCast: 0,
  foretoldViewsChecked: 0,
  casualSpecial: 0,
  byCard: new Map(),
});

/** Notes what one applied action did, for the paths this slice added. */
function note(tally: Tally, casual: ReadonlySet<number>, step: StepInfo): void {
  const { after, events, before } = step;
  const asked = before.pending;

  tally.delayedCreated += Math.max(0, after.delayedTriggers.length - before.delayedTriggers.length);

  // The questions of the slice: what was answered.
  if (
    asked?.kind === 'confirmOptional' &&
    (asked.purpose === 'suspend' || asked.purpose === 'madness')
  ) {
    const accepted = step.action.kind === 'acceptOptional';
    if (asked.purpose === 'suspend') {
      tally.suspendAsked += 1;
      if (accepted) tally.suspendCast += 1;
      else tally.suspendDeclined += 1;
    } else {
      tally.madnessAsked += 1;
      if (accepted) tally.madnessCast += 1;
      else tally.madnessDeclined += 1;
    }
  }
  if (step.action.kind === 'suspend' || step.action.kind === 'foretell') {
    if (casual.has(step.seat)) tally.casualSpecial += 1;
  }

  for (const e of events) {
    if (e.kind === 'suspended') tally.suspended += 1;
    if (e.kind === 'counterRemoved' && e.counter === 'time') tally.timeTicks += 1;
    if (e.kind === 'madnessExiled') tally.madnessExiled += 1;
    if (e.kind === 'foretold') tally.foretold += 1;
    if (e.kind === 'spellCast') {
      const name = cardNameOf(after, e.object);
      tally.byCard.set(name, (tally.byCard.get(name) ?? 0) + 1);
      if (e.alternative === 'foretell') tally.foretellCast += 1;
    }
    if (e.kind === 'abilityTriggered') {
      const ability = after.objects[e.stackObject as never]?.stack?.ability ?? null;
      if (
        ability?.kind === 'triggered' &&
        ability.trigger.kind === 'step' &&
        ability.effect.kind !== 'castExiled'
      ) {
        tally.delayedTriggered += 1;
      }
    }
  }

  // A creature that came from a suspended spell is a new permanent that remembers it (haste).
  for (const id of after.battlefield) {
    if (after.objects[id]?.alt === 'suspend' && before.objects[id] === undefined) {
      tally.suspendHaste += 1;
    }
  }

  // A castExiled ability that resolved without asking: the card could not be cast, so a suspended card stays exiled
  // and a card exiled by madness went to the graveyard.
  for (const e of events) {
    if (e.kind !== 'resolved' || before.pending?.kind === 'confirmOptional') continue;
    const ability = before.objects[e.object]?.stack?.ability;
    if (ability?.kind !== 'triggered' || ability.effect.kind !== 'castExiled') continue;
    if (ability.effect.mode === 'madness') tally.madnessNotAsked += 1;
    else tally.suspendNotAsked += 1;
  }

  // Hidden information: a foretold card is face down to everyone but its owner, in every view.
  for (const obj of Object.values(after.objects)) {
    if (obj.zone !== 'exile' || obj.foretoldTurn === undefined) continue;
    const other = 1 - obj.owner;
    const seen = getView(after, other).exile.find((o) => o.id === obj.id);
    if (seen === undefined || seen.faceDown !== true || seen.name !== 'Face-down card') {
      throw new Error(`a foretold card is shown to the other seat: ${JSON.stringify(seen)}`);
    }
    const own = getView(after, obj.owner).exile.find((o) => o.id === obj.id);
    if (own?.foretold !== true || own.name === 'Face-down card') {
      throw new Error('the owner of a foretold card cannot see it');
    }
    tally.foretoldViewsChecked += 1;
  }
}

test(
  `${GAMES} cast-later games run clean, replay exactly and use every path of the slice`,
  async () => {
    const total = newTally();
    const turns: number[] = [];
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = LATER_STYLE_PAIRS[g % LATER_STYLE_PAIRS.length] ?? ['later', 'later'];
      const config = smallGameConfig(g, styles);
      // Seats of CasualAgent by game: seat 0, seat 1, both, neither (random against random).
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? new CasualAgent({ seed: 9900 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 9900 + 2 * g + seat });
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
    console.log(`${GAMES} cast-later games: ${JSON.stringify(summary)}`);

    expectPath(total.delayedCreated);
    expectPath(total.delayedTriggered);
    expectPath(total.suspended);
    expectPath(total.timeTicks);
    expectPath(total.suspendAsked);
    expectPath(total.suspendCast);
    expectPath(total.suspendHaste);
    expectPath(total.madnessExiled);
    expectPath(total.madnessAsked);
    expectPath(total.madnessCast);
    expectPath(total.foretold);
    expectPath(total.foretellCast);
    expectPath(total.foretoldViewsChecked);
    expectPath(total.casualSpecial);
    // Every cast-later card was cast at least once somewhere in the games, except the one that needs a creature to
    // aim at when its last counter comes off (it was suspended and stayed exiled: `suspendNotAsked`).
    for (const name of LATER_NAMES.filter((n) => n !== 'SYNTHETIC Suspend Scrap')) {
      expectPath(total.byCard.get(name) ?? 0, name);
    }
  },
  soakTimeout(240_000),
);
