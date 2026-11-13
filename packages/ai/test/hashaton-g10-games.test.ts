// Slice soak (D-1190 to D-1193, provisional): whole games with the 'hashatonDiscardX' deck style (SYNTHETIC cards of the engine fixtures `synthetic-hashaton-g10.ts`: "As an
// additional cost to cast this spell, discard X cards" with "Return X target creature cards from your graveyard to your hand", with flashback, with "X damage" and {X} in the
// mana cost, with "Draw X cards", and a creature that triggers on a discard, with bodies and removal to fill the graveyard) between random agents, with CasualAgent in some
// seats. Every game finishes with a result, no fallback, no rejected action and consistent state after every action; the action log replays to the same final state; and, with the
// rules read again here from the cards' texts (not from the engine's own cost and choice code), at every step:
//   - the X question of a spell of the slice offers the values 0 up to its maximum, never a maximum above the other cards in the caster's hand (CR 118.3) or, for the recursion,
//     above the cards in the caster's graveyard that could be returned (CR 601.2b: X is announced before the targets), and the maximum is accepted and one more is refused;
//   - the targets that follow have exactly X slots filled for the recursion (CR 601.2c);
//   - a spell cast with an X has discarded exactly X cards of the caster's hand, in the step it was cast, never the spell itself (CR 601.2h, 701.9);
//   - when the recursion resolves, every target still in the graveyard went to the hand and nothing else did (CR 608.2b);
//   - "Draw X cards" draws X.
// The count is `soakGames()` (D-126); the path checks run from 100 games up.
import {
  applyAction,
  checkInvariants,
  type GameState,
  getLegalActions,
  stateHash,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { type Agent, CasualAgent, RandomLegalAgent, replayGame } from '../src/index';
import { stackNameOf, tokenOrCopyNameOf } from './game-names';
import {
  HASHATON_G10_NAMES,
  HASHATON_G10_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

const RECURSION = new Set(['SYNTHETIC Dream Recall', 'SYNTHETIC Dream Replay']);
const DISCARD_X = new Set([
  'SYNTHETIC Dream Recall',
  'SYNTHETIC Dream Replay',
  'SYNTHETIC Dream Burn',
  'SYNTHETIC Dream Rummage',
]);

interface Tally {
  asked: number;
  limitedByHand: number;
  limitedByGraveyard: number;
  castsWithX: number;
  castsAtZero: number;
  flashbacks: number;
  returned: number;
  drawn: number;
  mourned: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  asked: 0,
  limitedByHand: 0,
  limitedByGraveyard: 0,
  castsWithX: 0,
  castsAtZero: 0,
  flashbacks: 0,
  returned: 0,
  drawn: 0,
  mourned: 0,
  byCard: new Map(),
});

/** The creature cards in the graveyard of `seat`, read from the card definitions' types. */
function creatureCardsInGraveyard(state: GameState, seat: number): number {
  let n = 0;
  for (const id of state.seats[seat]?.graveyard ?? []) {
    const obj = state.objects[id];
    if (obj?.card == null) continue;
    const face = state.definitions[state.cards[obj.card]?.definition ?? -1]?.faces[obj.face];
    if (face?.types.includes('creature') === true) n += 1;
  }
  return n;
}

function checkRules(t: Tally, step: StepInfo): void {
  const { before, after, events, action } = step;
  const pending = after.pending;
  // The X question of a spell of the slice.
  if (pending?.kind === 'chooseX' && pending.purpose === 'spell') {
    const name = stackNameOf(after, pending.source);
    if (DISCARD_X.has(name)) {
      t.asked += 1;
      const seat = pending.seat;
      const handBesides = (after.seats[seat]?.hand ?? []).filter((id) => id !== pending.source);
      expect(pending.min, name).toBe(0);
      expect(pending.perX.discard, name).toBe(1);
      expect(pending.max, `${name}: no more X than cards in hand`).toBeLessThanOrEqual(
        handBesides.length,
      );
      if (pending.max === handBesides.length) t.limitedByHand += 1;
      if (RECURSION.has(name)) {
        const returnable = creatureCardsInGraveyard(after, seat);
        expect(pending.max, `${name}: no more X than creature cards to return`).toBeLessThanOrEqual(
          returnable,
        );
        if (pending.max === returnable) t.limitedByGraveyard += 1;
      }
      const values = getLegalActions(after, seat).flatMap((a) =>
        a.kind === 'chooseX' ? [a.value] : [],
      );
      expect(values, name).toEqual(Array.from({ length: pending.max + 1 }, (_, i) => i));
      expect(applyAction(after, seat, { kind: 'chooseX', value: pending.max + 1 }).ok, name).toBe(
        false,
      );
    }
  }
  // The targets after the announcement: exactly X of them for the recursion.
  if (action.kind === 'chooseX' && pending?.kind === 'targets') {
    const name = stackNameOf(after, pending.source);
    if (RECURSION.has(name)) {
      const [slot] = pending.specs;
      expect(slot?.min, name).toBe(action.value);
      expect(slot?.max, name).toBe(action.value);
      expect(slot?.legal.length ?? 0, name).toBeGreaterThanOrEqual(action.value);
    }
  }
  for (const e of events) {
    if (e.kind === 'spellCast') {
      const name = tokenOrCopyNameOf(after, e.object);
      t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
      if (e.alternative === 'flashback' && RECURSION.has(name)) t.flashbacks += 1;
      if (DISCARD_X.has(name)) {
        const x = e.x ?? 0;
        const discards = events.filter((d) => d.kind === 'discarded' && d.seat === e.seat);
        expect(discards.length, `${name} cast with X = ${x} discards X cards`).toBe(x);
        for (const d of discards) {
          if (d.kind !== 'discarded') continue;
          expect(before.objects[d.object]?.zone, `${name}: discarded from the hand`).toBe('hand');
          expect(d.object, `${name}: not the spell itself`).not.toBe(e.object);
        }
        if (x > 0) t.castsWithX += 1;
        else t.castsAtZero += 1;
        if (RECURSION.has(name)) {
          const targets = after.objects[e.object]?.stack?.chosenTargets ?? [];
          expect(targets.length, `${name}: X targets`).toBe(x);
        }
      }
    }
    if (e.kind === 'resolved') {
      const name = tokenOrCopyNameOf(before, e.object);
      const x = before.objects[e.object]?.stack?.x;
      if (RECURSION.has(name) && x !== undefined) {
        const chosen = before.objects[e.object]?.stack?.chosenTargets ?? [];
        const still = chosen.filter(
          (c) => c.kind === 'object' && before.objects[c.id]?.zone === 'graveyard',
        );
        const moved = events.filter(
          (m) => m.kind === 'zoneChanged' && m.fromZone === 'graveyard' && m.toZone === 'hand',
        );
        expect(moved.length, `${name}: the targets still in the graveyard return`).toBe(
          still.length,
        );
        t.returned += moved.length;
      }
      if (name === 'SYNTHETIC Dream Rummage' && x !== undefined) {
        const drawn = events.filter((d) => d.kind === 'cardDrawn').length;
        expect(drawn, `${name}: draws X`).toBe(x);
        t.drawn += drawn;
      }
    }
    if (
      e.kind === 'resolved' &&
      tokenOrCopyNameOf(before, e.object) === 'SYNTHETIC Dream Mourner'
    ) {
      t.mourned += 1;
    }
  }
}

test(
  `${GAMES} hashatonDiscardX games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = HASHATON_G10_STYLE_PAIRS[g % HASHATON_G10_STYLE_PAIRS.length] ?? [
        'hashatonDiscardX',
        'hashatonDiscardX',
      ];
      const config = smallGameConfig(g, styles);
      // Seats of CasualAgent by game: seat 0, seat 1, both, neither (random against random).
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? new CasualAgent({ seed: 101000 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 101000 + 2 * g + seat });
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
      for (const key of [
        'asked',
        'limitedByHand',
        'limitedByGraveyard',
        'castsWithX',
        'castsAtZero',
        'flashbacks',
        'returned',
        'drawn',
        'mourned',
      ] as const) {
        total[key] += t[key];
      }
      for (const [name, n] of t.byCard) total.byCard.set(name, (total.byCard.get(name) ?? 0) + n);
    }
    console.log(
      `${GAMES} hashatonDiscardX games: ${JSON.stringify({ ...total, byCard: Object.fromEntries([...total.byCard].sort()) })}`,
    );
    expectPath(total.asked);
    expectPath(total.castsWithX);
    expectPath(total.returned);
    expectPath(total.limitedByHand);
    // Every card of the slice was cast at least once somewhere in the games.
    for (const name of HASHATON_G10_NAMES) expectPath(total.byCard.get(name) ?? 0, name);
  },
  soakTimeout(240_000),
);
