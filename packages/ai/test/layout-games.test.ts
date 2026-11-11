// Slice soak: whole games (the `soakGames()` count, test/soak.ts) with the 'layouts' deck style (SYNTHETIC split cards, Adventure
// creatures, modal double-faced cards with a land back face, transforming creatures; CR 709, 715,
// 712, 701.27) between random agents, with CasualAgent in some seats. Every game finishes with a
// result, no fallback, no rejected action and consistent state after every action; the action log
// replays to the same final state (the hash covers the faces, the Adventure flag and the
// transformation stamps); and every new path occurs: both halves of a split card cast, an
// Adventure cast and then its creature cast from exile, an Adventure countered or fizzled and put in
// the graveyard, a back-face land played (with the pay-2-life question), a back-face spell cast,
// permanents transformed, the view showing the faces of a transformed permanent, and the casual
// agent casting an Adventure, the creature from exile, and a double-faced land.
import {
  checkInvariants,
  type GameEvent,
  type GameState,
  getView,
  type ObjectId,
  stateHash,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { type Agent, CasualAgent, RandomLegalAgent, replayGame } from '../src/index';
import { cardNameOf } from './game-names';
import {
  LAYOUT_CARD_NAMES,
  LAYOUT_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

interface Tally {
  splitFirst: number;
  splitSecond: number;
  adventureCasts: number;
  adventuresResolved: number;
  creaturesFromExile: number;
  adventuresCountered: number;
  adventuresFizzled: number;
  backFaceLands: number;
  shockQuestions: number;
  backFaceSpells: number;
  transforms: number;
  viewFaces: number;
  casualAdventures: number;
  casualFromExile: number;
  casualLands: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  splitFirst: 0,
  splitSecond: 0,
  adventureCasts: 0,
  adventuresResolved: 0,
  creaturesFromExile: 0,
  adventuresCountered: 0,
  adventuresFizzled: 0,
  backFaceLands: 0,
  shockQuestions: 0,
  backFaceSpells: 0,
  transforms: 0,
  viewFaces: 0,
  casualAdventures: 0,
  casualFromExile: 0,
  casualLands: 0,
  byCard: new Map(),
});

const layoutOf = (state: GameState, id: ObjectId): string | null => {
  const obj = state.objects[id] ?? state.lki[id]?.object;
  if (!obj || obj.card === null) return null;
  const card = state.cards[obj.card];
  return card === undefined ? null : (state.definitions[card.definition]?.layout ?? null);
};

/** Notes what one applied action did, for the paths this slice added. */
function note(tally: Tally, casual: ReadonlySet<number>, step: StepInfo): void {
  const { before, after, events } = step;
  const d = after.pending;
  if (d?.kind === 'confirmOptional' && d.face === 1) tally.shockQuestions += 1;
  for (const e of events as readonly GameEvent[]) {
    if (e.kind === 'spellCast') {
      const layout = layoutOf(after, e.object);
      const name = cardNameOf(after, e.object);
      if ((LAYOUT_CARD_NAMES as readonly string[]).includes(name)) {
        tally.byCard.set(name, (tally.byCard.get(name) ?? 0) + 1);
      }
      if (layout === 'split') {
        if (e.face === 1) tally.splitSecond += 1;
        else tally.splitFirst += 1;
      }
      if (layout === 'adventure' && e.face === 1) {
        tally.adventureCasts += 1;
        if (casual.has(e.seat)) tally.casualAdventures += 1;
      }
      if (layout === 'adventure' && e.fromZone === 'exile') {
        tally.creaturesFromExile += 1;
        if (casual.has(e.seat)) tally.casualFromExile += 1;
      }
      if (layout === 'modal_dfc' && e.face === 1) tally.backFaceSpells += 1;
    }
    if (e.kind === 'landPlayed' && e.face === 1) {
      tally.backFaceLands += 1;
      if (casual.has(e.seat)) tally.casualLands += 1;
    }
    if (e.kind === 'zoneChanged' && e.fromZone === 'stack') {
      const was = before.objects[e.from];
      if (layoutOf(before, e.from) !== 'adventure' || was?.face !== 1) continue;
      const reason = (kind: GameEvent['kind']) =>
        events.some((x) => x.kind === kind && 'object' in x && x.object === e.from);
      if (e.toZone === 'exile' && after.objects[e.to]?.onAdventure === true) {
        tally.adventuresResolved += 1;
      } else if (e.toZone === 'graveyard') {
        if (reason('countered')) tally.adventuresCountered += 1;
        else if (reason('fizzled')) tally.adventuresFizzled += 1;
      }
    }
  }
  // A permanent that is the same object but has another face up transformed (CR 701.27a).
  for (const id of after.battlefield) {
    const was = before.objects[id];
    const now = after.objects[id];
    if (was?.zone === 'battlefield' && now !== undefined && was.face !== now.face) {
      tally.transforms += 1;
    }
  }
  // The view shows both faces of a card, and which is up, to its viewer.
  const seen = getView(after, 0).battlefield.some(
    (o) => o.face === 1 && o.faces?.length === 2 && o.layout === 'transform',
  );
  if (seen) tally.viewFaces += 1;
}

test(
  `${GAMES} layout games run clean, replay exactly and use every new path`,
  async () => {
    const total = newTally();
    const turns: number[] = [];
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = LAYOUT_STYLE_PAIRS[g % LAYOUT_STYLE_PAIRS.length] ?? ['layouts', 'layouts'];
      const config = smallGameConfig(g, styles);
      // Seats of CasualAgent by game: seat 0, seat 1, both, neither (random against random).
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? new CasualAgent({ seed: 9000 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 9000 + 2 * g + seat });
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
    console.log(`100 layout games: ${JSON.stringify(summary)}`);

    expectPath(total.splitFirst);
    expectPath(total.splitSecond);
    expectPath(total.adventureCasts);
    expectPath(total.adventuresResolved);
    expectPath(total.creaturesFromExile);
    expectPath(total.adventuresCountered);
    expectPath(total.backFaceLands);
    expectPath(total.shockQuestions);
    expectPath(total.backFaceSpells);
    expectPath(total.transforms);
    expectPath(total.viewFaces);
    expectPath(total.casualAdventures);
    expectPath(total.casualFromExile);
    expectPath(total.casualLands);
  },
  soakTimeout(240_000),
);
