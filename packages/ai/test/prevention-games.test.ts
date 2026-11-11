// Soak: whole games (the `soakGames()` count, test/soak.ts) with the 'prevention' deck style (SYNTHETIC Fog, shields on a player, a
// creature, any target and creatures you control, a noncombat Fog, numeric combat shields, with
// lifelink, deathtouch, trample and double strike creatures and burn; CR 615, 120.3, 616.1) between
// random agents, with CasualAgent in some seats. Every game finishes with a result, no fallback, no
// rejected action, no agent error and consistent state after every action; the action log replays to
// the same final state (the hash covers the shields); and every new path occurs: shields made, combat
// and noncombat damage prevented, a numeric shield used up by damage, damage partly prevented,
// shields expiring at cleanup, every prevention card cast, and the casual agent casting only the
// shields it understands, only to survive combat.
import {
  type Action,
  applyAction,
  checkInvariants,
  type GameEvent,
  type GameState,
  getLegalActions,
  stateHash,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { type Agent, CasualAgent, RandomLegalAgent, replayGame } from '../src/index';
import { cardNameOf } from './game-names';
import {
  PREVENTION_CARD_NAMES,
  PREVENTION_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };
/** The only prevention spells the CasualAgent casts (src/casual-prevention.ts). */
const CASUAL_CASTS = ['SYNTHETIC Fog Spell', 'SYNTHETIC Self Ward'];

interface Tally {
  shieldsMade: number;
  numericShields: number;
  allShields: number;
  preventedCombat: number;
  preventedNoncombat: number;
  preventedAmount: number;
  usedUp: number;
  partial: number;
  expired: number;
  fullyPreventedWithoutResult: number;
  casualCasts: number;
  casualMisplaced: number;
  casualOther: number;
  legalChecked: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  shieldsMade: 0,
  numericShields: 0,
  allShields: 0,
  preventedCombat: 0,
  preventedNoncombat: 0,
  preventedAmount: 0,
  usedUp: 0,
  partial: 0,
  expired: 0,
  fullyPreventedWithoutResult: 0,
  casualCasts: 0,
  casualMisplaced: 0,
  casualOther: 0,
  legalChecked: 0,
  byCard: new Map(),
});

const shieldsOf = (s: GameState) =>
  s.continuousEffects.filter((e) => e.change.kind === 'preventDamage');

function note(tally: Tally, casual: ReadonlySet<number>, step: StepInfo): void {
  const { before, after, events } = step;
  const prevented = (events as readonly GameEvent[]).flatMap((e) =>
    e.kind === 'damagePrevented' ? [e] : [],
  );
  const dealt = (events as readonly GameEvent[]).flatMap((e) =>
    e.kind === 'damageDealt' ? [e] : [],
  );
  const oldShields = new Map(shieldsOf(before).map((e) => [e.id, e]));
  const newShields = new Map(shieldsOf(after).map((e) => [e.id, e]));

  for (const [id, shield] of newShields) {
    const change = shield.change;
    if (change.kind !== 'preventDamage') continue;
    // A shield is always a positive whole number or 'all', and it only ever shrinks.
    if (change.amount !== 'all') {
      expect(Number.isInteger(change.amount) && change.amount > 0, id).toBe(true);
    }
    const old = oldShields.get(id);
    if (old === undefined) {
      tally.shieldsMade += 1;
      if (change.amount === 'all') tally.allShields += 1;
      else tally.numericShields += 1;
    } else if (old.change.kind === 'preventDamage' && old.change.amount !== 'all') {
      expect(change.amount !== 'all' && change.amount <= old.change.amount, id).toBe(true);
    }
  }
  for (const [id, old] of oldShields) {
    if (newShields.has(id)) continue;
    // Gone: used up by the damage it prevented, or ended at cleanup (CR 514.2, 615.7).
    if (
      old.change.kind === 'preventDamage' &&
      old.change.amount !== 'all' &&
      prevented.length > 0
    ) {
      tally.usedUp += 1;
    } else if (after.turn.number !== before.turn.number || prevented.length === 0) {
      tally.expired += 1;
    }
  }

  for (const p of prevented) {
    expect(p.amount).toBeGreaterThan(0);
    tally.preventedAmount += p.amount;
    if (p.combat) tally.preventedCombat += 1;
    else tally.preventedNoncombat += 1;
    const rest = dealt.filter(
      (d) => d.source === p.source && JSON.stringify(d.to) === JSON.stringify(p.to),
    );
    if (rest.length > 0) tally.partial += 1;
    else if (p.to.kind === 'object') {
      const hit = p.to.id;
      // Fully prevented damage to a creature leaves nothing marked by that source: the object's
      // marked damage did not grow in this step unless other damage hit it.
      const others = dealt.some((d) => d.to.kind === 'object' && d.to.id === hit);
      const b = before.objects[hit]?.damage ?? 0;
      const a = after.objects[hit]?.damage ?? 0;
      if (!others) expect(a, 'marked damage after fully prevented damage').toBeLessThanOrEqual(b);
      tally.fullyPreventedWithoutResult += 1;
    }
  }

  for (const e of events as readonly GameEvent[]) {
    if (e.kind !== 'spellCast') continue;
    const name = cardNameOf(after, e.object);
    tally.byCard.set(name, (tally.byCard.get(name) ?? 0) + 1);
    if (!casual.has(step.seat) || !(PREVENTION_CARD_NAMES as readonly string[]).includes(name)) {
      continue;
    }
    if (!CASUAL_CASTS.includes(name)) {
      tally.casualOther += 1;
      continue;
    }
    tally.casualCasts += 1;
    // Cast only on the opponent's turn, in the declare blockers step, with combat in progress.
    if (
      before.turn.activeSeat === step.seat ||
      before.turn.step !== 'declareBlockers' ||
      before.combat === null
    ) {
      tally.casualMisplaced += 1;
    }
  }

  // The listed legal actions agree with the engine for a prevention spell the agent cast.
  const d = before.pending;
  if (d?.kind === 'priority' && step.action.kind === 'castSpell') {
    const obj = before.objects[step.action.object];
    const name = obj === undefined ? '?' : cardNameOf(before, obj.id);
    if ((PREVENTION_CARD_NAMES as readonly string[]).includes(name)) {
      const legal = getLegalActions(before, d.seat);
      expect(legal.some((a) => JSON.stringify(a) === JSON.stringify(step.action))).toBe(true);
      for (const a of legal) {
        if (a.kind !== 'concede') expect(applyAction(before, d.seat, a).ok).toBe(true);
      }
      tally.legalChecked += 1;
    }
  }
}

test(
  `${GAMES} prevention games run clean, replay exactly and use every new path`,
  async () => {
    const total = newTally();
    const turns: number[] = [];
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = PREVENTION_STYLE_PAIRS[g % PREVENTION_STYLE_PAIRS.length] ?? [
        'prevention',
        'prevention',
      ];
      const config = smallGameConfig(g, styles);
      // Seats of CasualAgent by game: seat 0, seat 1, both, neither (random against random).
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? new CasualAgent({ seed: 13000 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 13000 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const tally = newTally();
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action as Action });
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
        if (key === 'byCard') continue;
        (total[key] as number) += tally[key] as number;
      }
      for (const [k, n] of tally.byCard) total.byCard.set(k, (total.byCard.get(k) ?? 0) + n);
    }
    console.log(
      `100 prevention games: ${JSON.stringify({
        ...total,
        byCard: Object.fromEntries([...total.byCard].sort()),
        turnsMax: Math.max(...turns),
      })}`,
    );

    expectPath(total.shieldsMade);
    expectPath(total.allShields);
    expectPath(total.numericShields);
    expectPath(total.preventedCombat);
    expectPath(total.preventedNoncombat);
    expectPath(total.usedUp);
    expectPath(total.partial);
    expectPath(total.expired);
    expectPath(total.fullyPreventedWithoutResult);
    expectPath(total.legalChecked);
    // The casual agent does cast a Fog to survive, and never out of place or any other shield.
    expectPath(total.casualCasts);
    expect(total.casualMisplaced).toBe(0);
    expect(total.casualOther).toBe(0);
    for (const name of PREVENTION_CARD_NAMES) {
      expectPath(total.byCard.get(name) ?? 0, name);
    }
  },
  soakTimeout(300_000),
);
