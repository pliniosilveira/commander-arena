// Slice soak: whole games (the `soakGames()` count, test/soak.ts) with the 'library' deck style (SYNTHETIC scry, surveil, reordering,
// Brainstorm-like and put-on-top cards, D-091) between random agents, with CasualAgent in some
// seats. Every game finishes with a result, no fallback, no rejected action and consistent state
// after every action; the action log replays to the same final state; and every new path occurs:
// scry, surveil and reordering asked of the player who looks, a put on top asked of the hand's owner,
// the answers arranging the library exactly as given, the surveiled cards in the graveyard, the
// scried and surveiled events carrying counts, the event of a scry of an empty library. During every
// arrangement the other seat's view shows no card looked at. CasualAgent keeps a land on top when it
// is short of lands and one is on offer.
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
  LIBRARY_CARD_NAMES,
  LIBRARY_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

interface Tally {
  scry: number;
  surveil: number;
  reorder: number;
  bottom: number;
  putOnTop: number;
  scried: number;
  surveiled: number;
  emptyScry: number;
  emptySurveil: number;
  toGraveyard: number;
  toBottom: number;
  keptOnTop: number;
  casualShortOfLands: number;
  casualLandKept: number;
  casualViolations: number;
  hiddenChecks: number;
}

const newTally = (): Tally => ({
  scry: 0,
  surveil: 0,
  reorder: 0,
  bottom: 0,
  putOnTop: 0,
  scried: 0,
  surveiled: 0,
  emptyScry: 0,
  emptySurveil: 0,
  toGraveyard: 0,
  toBottom: 0,
  keptOnTop: 0,
  casualShortOfLands: 0,
  casualLandKept: 0,
  casualViolations: 0,
  hiddenChecks: 0,
});

const isLandCard = (state: GameState, id: ObjectId): boolean => {
  const obj = state.objects[id];
  if (obj?.card == null) return false;
  const card = state.cards[obj.card];
  const def = card === undefined ? undefined : state.definitions[card.definition];
  return def?.faces[0]?.types.includes('land') === true;
};

/** Notes what one applied action did, for the paths this slice added, and checks it. */
function note(tally: Tally, casual: ReadonlySet<number>, step: StepInfo): void {
  const { before, after, events, seat, action } = step;
  const d = before.pending;
  const library = (s: GameState) => s.seats[seat]?.library ?? [];

  if (d?.kind === 'arrangeCards' && action.kind === 'arrangeCards') {
    tally[d.purpose] += 1;
    // The other seat's view shows no card looked at, and only says that a decision is pending.
    const other = seat === 0 ? 1 : 0;
    const text = JSON.stringify(getView(before, other));
    for (const id of d.cards) {
      if (text.includes(`"${id}"`)) throw new Error(`the other seat's view shows ${id}`);
    }
    const otherView = getView(before, other);
    if (otherView.pending !== null || otherView.pendingCards !== undefined) {
      throw new Error("the other seat's view shows the decision");
    }
    if (otherView.waitingOn?.purpose !== d.purpose) throw new Error('waitingOn is wrong');
    tally.hiddenChecks += 1;

    // The library is arranged exactly as answered.
    const lookedAt = d.cards.length;
    const rest = library(before).slice(lookedAt);
    const now = library(after);
    if (d.purpose === 'scry') {
      expect(now).toEqual([...action.top, ...rest, ...action.other]);
      tally.toBottom += action.other.length;
    } else if (d.purpose === 'bottom') {
      // D-324 (CR 401.4): the cards the look did not take go below the rest of the library in the order given; the library holds the rest first.
      expect(action.top).toEqual([]);
      expect(now).toEqual([...rest, ...action.other]);
      expect(events.find((x) => x.kind === 'cardsBottomed')).toEqual({
        kind: 'cardsBottomed',
        seat,
        count: action.other.length,
        ordered: true,
      });
      tally.toBottom += action.other.length;
    } else {
      // Surveil moved the others to the graveyard (new objects); a reorder has none.
      expect(now).toEqual([...action.top, ...rest]);
    }
    tally.keptOnTop += action.top.length;
    if (d.purpose === 'surveil') {
      const grave = after.seats[seat]?.graveyard ?? [];
      const names = action.other.map((id) => cardNameOf(before, id));
      const inGraveyard = grave.map((id) => cardNameOf(after, id));
      for (const name of names) {
        if (!inGraveyard.includes(name))
          throw new Error(`${name} was surveiled but is not in the graveyard`);
      }
      tally.toGraveyard += action.other.length;
    }
    // Counts in the event.
    const events2 = events as readonly GameEvent[];
    const e = events2.find((x) => x.kind === (d.purpose === 'scry' ? 'scried' : 'surveiled'));
    if (d.purpose === 'scry') {
      expect(e).toEqual({
        kind: 'scried',
        seat,
        top: action.top.length,
        bottom: action.other.length,
      });
    } else if (d.purpose === 'surveil') {
      expect(e).toEqual({
        kind: 'surveiled',
        seat,
        top: action.top.length,
        toGraveyard: action.other.length,
      });
    } else {
      expect(e).toBeUndefined();
    }

    // CasualAgent short of lands keeps a land on top when one is on offer.
    if (casual.has(seat) && d.purpose !== 'reorder' && d.purpose !== 'bottom') {
      const lands = before.battlefield.filter(
        (id) => before.objects[id]?.controller === seat && isLandCard(before, id),
      ).length;
      const handLands = (before.seats[seat]?.hand ?? []).filter((id) => isLandCard(before, id));
      const landOnOffer = d.cards.some((id) => isLandCard(before, id));
      if (lands < 4 && handLands.length === 0 && landOnOffer) {
        tally.casualShortOfLands += 1;
        if (action.top.some((id) => isLandCard(before, id))) tally.casualLandKept += 1;
        else tally.casualViolations += 1;
      }
    }
  }

  if (d?.kind === 'chooseCards' && d.purpose === 'putOnTop' && action.kind === 'chooseCards') {
    tally.putOnTop += 1;
    expect(action.objects).toHaveLength(d.min);
    // The first card chosen is on top of the library now (unless a commander went elsewhere).
    const first = action.objects[0];
    if (first !== undefined && after.pending?.kind !== 'commanderZone') {
      const topNow = library(after)[0];
      if (topNow !== undefined) expect(cardNameOf(after, topNow)).toBe(cardNameOf(before, first));
    }
    const other = seat === 0 ? 1 : 0;
    const text = JSON.stringify(getView(before, other));
    for (const id of d.legal) {
      if (text.includes(`"${id}"`)) throw new Error(`the other seat's view shows ${id}`);
    }
    tally.hiddenChecks += 1;
  }

  for (const e of events as readonly GameEvent[]) {
    if (e.kind === 'scried') {
      tally.scried += 1;
      if (e.top === 0 && e.bottom === 0) tally.emptyScry += 1;
    }
    if (e.kind === 'surveiled') {
      tally.surveiled += 1;
      if (e.top === 0 && e.toGraveyard === 0) tally.emptySurveil += 1;
    }
  }
}

test(
  `${GAMES} library-arranging games run clean, replay exactly and use every new path`,
  async () => {
    const total = newTally();
    const turns: number[] = [];
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = LIBRARY_STYLE_PAIRS[g % LIBRARY_STYLE_PAIRS.length] ?? ['library', 'library'];
      const config = smallGameConfig(g, styles);
      // Seats of CasualAgent by game: seat 0, seat 1, both, neither (random against random).
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? new CasualAgent({ seed: 11500 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 11500 + 2 * g + seat });
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
      for (const key of Object.keys(tally) as (keyof Tally)[]) total[key] += tally[key];
    }
    const summary = { ...total, turnsMax: Math.max(...turns), cards: LIBRARY_CARD_NAMES.length };
    console.log(`100 library-arranging games: ${JSON.stringify(summary)}`);

    expectPath(total.scry);
    expectPath(total.surveil);
    expectPath(total.reorder);
    expectPath(total.putOnTop);
    expectPath(total.scried);
    expectPath(total.surveiled);
    expectPath(total.toGraveyard);
    expectPath(total.toBottom);
    expect(total.hiddenChecks).toBe(
      total.scry + total.surveil + total.reorder + total.bottom + total.putOnTop,
    );
    expectPath(total.bottom);
    expectPath(total.casualShortOfLands);
    expect(total.casualViolations).toBe(0);
  },
  soakTimeout(300_000),
);
