// Slice S4a soak: whole games (the `soakGames()` count, test/soak.ts) with the 'attachments' deck style (SYNTHETIC Auras, Equipment,
// an Anthem, a lord and a Banner) between random agents, with CasualAgent in some seats. Every game
// finishes with a result, no fallback, no rejected action, and consistent state after every action;
// the action log replays to the same final state; at every priority decision no Aura is attached to
// nothing or to an illegal permanent and no Equipment to a non-creature (the state-based actions have
// run, CR 704.5m, 704.5n); and every path of the slice occurs: Auras cast and attached, Equipment
// equipped and moved, Equipment left behind by a creature that died or was bounced, Auras that fell
// off, Auras that fizzled, creatures carrying static bonuses in combat.
import {
  checkInvariants,
  type GameEvent,
  type GameState,
  type ObjectId,
  stateHash,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { type Agent, CasualAgent, RandomLegalAgent, replayGame } from '../src/index';
import {
  ATTACHMENT_CARD_NAMES,
  ATTACHMENT_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

interface Tally {
  aurasAttached: number;
  equipsAttached: number;
  equipMoves: number;
  equipLeftBehind: number;
  aurasFellOff: number;
  aurasFizzled: number;
  attackersWithBonus: number;
  casualAuras: number;
  casualAurasOnOwn: number;
  casualHostileAuras: number;
  casualEquips: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  aurasAttached: 0,
  equipsAttached: 0,
  equipMoves: 0,
  equipLeftBehind: 0,
  aurasFellOff: 0,
  aurasFizzled: 0,
  attackersWithBonus: 0,
  casualAuras: 0,
  casualAurasOnOwn: 0,
  casualHostileAuras: 0,
  casualEquips: 0,
  byCard: new Map(),
});

const nameOf = (state: GameState, id: ObjectId): string => {
  const obj = state.objects[id] ?? state.lki[id]?.object;
  if (!obj || obj.card === null) return obj?.token?.characteristics.name ?? '?';
  const card = state.cards[obj.card];
  return card === undefined ? '?' : (state.definitions[card.definition]?.name ?? '?');
};

const subtypesOf = (state: GameState, id: ObjectId): readonly string[] => {
  const obj = state.objects[id] ?? state.lki[id]?.object;
  if (!obj || obj.card === null) return [];
  const card = state.cards[obj.card];
  return card === undefined ? [] : (state.definitions[card.definition]?.faces[0]?.subtypes ?? []);
};

const typesOf = (state: GameState, id: ObjectId): readonly string[] => {
  const obj = state.objects[id];
  if (!obj || obj.card === null) return [];
  const card = state.cards[obj.card];
  return card === undefined ? [] : (state.definitions[card.definition]?.faces[0]?.types ?? []);
};

/** Notes what one applied action did, for the paths this slice added. */
function note(tally: Tally, casual: ReadonlySet<number>, step: StepInfo): void {
  const { before, after, events } = step;
  for (const e of events as readonly GameEvent[]) {
    if (e.kind === 'attached') {
      const aura = subtypesOf(after, e.object).includes('Aura');
      const name = nameOf(after, e.object);
      tally.byCard.set(name, (tally.byCard.get(name) ?? 0) + 1);
      if (aura) {
        tally.aurasAttached += 1;
        const host = after.objects[e.to];
        const owner = after.objects[e.object]?.controller;
        if (owner !== undefined && casual.has(owner)) {
          tally.casualAuras += 1;
          if (host?.controller === owner) tally.casualAurasOnOwn += 1;
          if (name === 'SYNTHETIC Curse Aura') tally.casualHostileAuras += 1;
        }
      } else {
        tally.equipsAttached += 1;
        const owner = after.objects[e.object]?.controller;
        if (owner !== undefined && casual.has(owner)) tally.casualEquips += 1;
      }
    }
    if (e.kind === 'unattached' && e.reason === 'replaced') tally.equipMoves += 1;
    if (e.kind === 'unattached' && e.reason === 'left') tally.equipLeftBehind += 1;
    if (
      e.kind === 'zoneChanged' &&
      e.fromZone === 'battlefield' &&
      e.toZone === 'graveyard' &&
      subtypesOf(before, e.from).includes('Aura') &&
      before.objects[e.from]?.attachedTo !== null
    ) {
      // An Aura went to the graveyard while it was attached: its creature was gone or illegal.
      const host = before.objects[e.from]?.attachedTo ?? null;
      if (host !== null && after.objects[host] === undefined) tally.aurasFellOff += 1;
    }
    if (e.kind === 'fizzled' && subtypesOf(before, e.object).includes('Aura')) {
      tally.aurasFizzled += 1;
    }
    if (e.kind === 'attackersDeclared') {
      for (const a of e.attackers) {
        const o = after.objects[a.object];
        if (
          o !== undefined &&
          after.battlefield.some((id) => after.objects[id]?.attachedTo === o.id)
        ) {
          tally.attackersWithBonus += 1;
        }
      }
    }
  }
}

/** At a priority decision the state-based actions have run: attachments are legal (CR 704.5m-n). */
function checkAttachments(state: GameState): string[] {
  if (state.pending?.kind !== 'priority') return [];
  const problems: string[] = [];
  for (const id of state.battlefield) {
    const obj = state.objects[id];
    if (obj === undefined) continue;
    const subtypes = subtypesOf(state, id);
    const host = obj.attachedTo === null ? undefined : state.objects[obj.attachedTo];
    if (subtypes.includes('Aura') && host?.zone !== 'battlefield') {
      problems.push(`${nameOf(state, id)} is an Aura attached to ${obj.attachedTo ?? 'nothing'}`);
    }
    if (obj.attachedTo !== null && (host === undefined || host.zone !== 'battlefield')) {
      problems.push(`${nameOf(state, id)} is attached to something that is gone`);
    }
    if (subtypes.includes('Equipment') && host !== undefined && host.card !== null) {
      if (!typesOf(state, host.id).includes('creature')) {
        problems.push(
          `${nameOf(state, id)} equips ${nameOf(state, host.id)}, which is no creature`,
        );
      }
    }
  }
  return problems;
}

test(
  `${GAMES} attachment games run clean, replay exactly and use every new path`,
  async () => {
    const total = newTally();
    const turns: number[] = [];
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = ATTACHMENT_STYLE_PAIRS[g % ATTACHMENT_STYLE_PAIRS.length] ?? [
        'attachments',
        'attachments',
      ];
      const config = smallGameConfig(g, styles);
      // Seats of CasualAgent by game: seat 0, seat 1, both, neither (random against random).
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? new CasualAgent({ seed: 7000 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 7000 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const tally = newTally();
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        note(tally, casual, step);
        const problems = [...checkInvariants(step.after), ...checkAttachments(step.after)];
        if (problems.length > 0) throw new Error(`game ${g}: ${problems.join('; ')}`);
      });
      const tag = `game ${g}`;
      expect(run.capped, tag).toBe(false);
      expect(run.state.result, tag).not.toBeNull();
      for (const agent of agents) expect(agent.fallbacks, tag).toHaveLength(0);
      // The log replays to the same game.
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
    console.log(`100 attachment games: ${JSON.stringify(summary)}`);

    expectPath(total.aurasAttached);
    expectPath(total.equipsAttached);
    expectPath(total.equipMoves); // re-equips
    expectPath(total.equipLeftBehind); // CR 704.5n
    expectPath(total.aurasFellOff); // CR 704.5m
    expectPath(total.aurasFizzled);
    expectPath(total.attackersWithBonus);
    expectPath(total.casualAuras);
    expectPath(total.casualEquips);
    // The casual agent puts beneficial Auras on its own creatures; Curse Aura is the exception.
    expect(total.casualAurasOnOwn + total.casualHostileAuras).toBe(total.casualAuras);
    // Every card of the style that attaches was attached somewhere.
    for (const name of ATTACHMENT_CARD_NAMES) {
      if (name === 'SYNTHETIC Anthem' || name === 'SYNTHETIC Standard Bearer') continue;
      if (name === 'SYNTHETIC Plague Banner') continue;
      expectPath(total.byCard.get(name) ?? 0, name);
    }
  },
  soakTimeout(240_000),
);
