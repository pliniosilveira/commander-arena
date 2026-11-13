// Slice soak (D-303): whole games of the 'piles' deck style, with the SYNTHETIC pile spells ("Reveal the top five cards of your library. An opponent separates those cards into
// two piles. Put one pile into your hand and the other into your graveyard." and its two variants: the controller separates and an opponent chooses; the chosen pile goes to the
// graveyard), between every kind of agent. The games are played with a decision context that hands out a determinized sample like the runner does (`runGame`, A31). Every game finishes
// with a result, no fallback, no rejected action and consistent state after every action; the action log replays to the same final state; and the rules of the slice are restated from
// the events, the views and the states, apart from the engine: the cards of the piles are the top cards of the library of the player who receives them, revealed in an event that
// names them; they are still in that library while both questions are open (CR 700.3c); the two piles partition them (CR 700.3a, 700.3d); the player asked to separate is an
// opponent of the receiver (or the receiver, for the other wording); the cards of the chosen pile go to the place the card says and the others to the other place (and nowhere else);
// and the casual, greedy and heuristic agents take the pile worth more for their own hand. The count is `soakGames()` (D-126); the path checks run from 100 games up.
import {
  type Action,
  applyAction,
  checkInvariants,
  createGame,
  createRng,
  determinize,
  type GameEvent,
  type GameState,
  getView,
  type SeatId,
  stateHash,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { pileCardWorth } from '../src/casual-piles';
import {
  type Agent,
  CasualAgent,
  type DecideContext,
  GreedyAgent,
  HeuristicAgent,
  RandomLegalAgent,
  replayGame,
} from '../src/index';
import { PILES_NAMES, PILES_STYLE_PAIRS, smallGameConfig } from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const MAX_TURNS = 150;
const MAX_ACTIONS = 5000;

type Kind = 'random' | 'casual' | 'greedy' | 'heuristic';
const KINDS: readonly Kind[] = ['random', 'casual', 'greedy', 'heuristic'];

function make(kind: Kind, seed: number): Agent & { fallbacks: readonly unknown[] } {
  return kind === 'casual'
    ? new CasualAgent({ seed })
    : kind === 'greedy'
      ? new GreedyAgent({ seed })
      : kind === 'heuristic'
        ? new HeuristicAgent({ seed })
        : new RandomLegalAgent({ seed });
}

interface Tally {
  separations: number;
  separationsByAgent: number;
  emptyPile: number;
  piles: number;
  pilesByAgent: number;
  toHand: number;
  toGraveyard: number;
  ownerSeparates: number;
  oneCardLibrary: number;
}

const newTally = (): Tally => ({
  separations: 0,
  separationsByAgent: 0,
  emptyPile: 0,
  piles: 0,
  pilesByAgent: 0,
  toHand: 0,
  toGraveyard: 0,
  ownerSeparates: 0,
  oneCardLibrary: 0,
});

const add = (total: Tally, t: Tally): void => {
  for (const key of Object.keys(t) as (keyof Tally)[]) total[key] += t[key];
};

interface Step {
  readonly before: GameState;
  readonly after: GameState;
  readonly seat: SeatId;
  readonly action: Action;
  readonly events: readonly GameEvent[];
}

/** Every card id of `ids` is a card of the library of `seat` in `state`, and they are its top cards in the order given. */
function expectTopOfLibrary(state: GameState, seat: SeatId, ids: readonly string[], tag: string) {
  const library = state.seats[seat]?.library ?? [];
  expect(library.slice(0, ids.length), `${tag}: the cards are the top of the library`).toEqual(ids);
}

function checkPiles(t: Tally, kinds: readonly [Kind, Kind], step: Step): void {
  const { before, after, events } = step;
  const asked = before.pending;

  // The question of the cards of pile 1.
  if (asked?.kind === 'chooseCards' && asked.purpose === 'separate') {
    t.separations += 1;
    const receiver = before.resolution?.controller ?? -1;
    expect(asked.zone).toBe('library');
    expect(asked.min).toBe(0);
    expect(asked.max).toBe(asked.legal.length);
    expect(asked.legal.length).toBeGreaterThanOrEqual(2);
    expect(asked.reveal).toBe(true);
    expectTopOfLibrary(before, receiver, asked.legal, 'the cards to separate');
    // "An opponent separates" or "separate them": the player asked is an opponent of the receiver or the receiver.
    if (asked.seat === receiver) t.ownerSeparates += 1;
    else expect(before.seats.length).toBe(2);
    expect(step.action.kind).toBe('chooseCards');
    if (step.action.kind === 'chooseCards') {
      expect(new Set(step.action.objects).size).toBe(step.action.objects.length);
      for (const id of step.action.objects) expect(asked.legal).toContain(id);
      if (kinds[asked.seat] !== 'random') t.separationsByAgent += 1;
      if (step.action.objects.length === 0 || step.action.objects.length === asked.legal.length) {
        t.emptyPile += 1;
      }
    }
  }

  // The question of the pile.
  if (asked?.kind === 'chooseOption' && asked.purpose === 'pile') {
    t.piles += 1;
    const piles = asked.piles;
    expect(piles).toBeDefined();
    if (piles === undefined) return;
    const cards = [...piles.first, ...piles.second];
    expect(new Set(cards).size, 'a card is in both piles').toBe(cards.length);
    expect(asked.options).toEqual(['pile1', 'pile2']);
    // CR 700.3c: nothing moved while the piles were made.
    for (const id of cards) expect(before.objects[id]?.zone).toBe('library');
    const library = before.seats[piles.receiver]?.library ?? [];
    expect(new Set(library.slice(0, cards.length))).toEqual(new Set(cards));
    expect(step.action.kind).toBe('chooseOption');
    if (step.action.kind !== 'chooseOption') return;
    const pick = step.action.option === 'pile1' ? piles.first : piles.second;
    const rest = step.action.option === 'pile1' ? piles.second : piles.first;
    // The cards of the chosen pile went to `chosenTo` and the rest to `otherTo`, of the receiver, and each card moved exactly once.
    const moved = events.filter(
      (e): e is Extract<GameEvent, { kind: 'zoneChanged' }> =>
        e.kind === 'zoneChanged' && e.fromZone === 'library',
    );
    expect(moved).toHaveLength(cards.length);
    for (const e of moved) {
      const was = pick.includes(e.from) ? 'chosen' : rest.includes(e.from) ? 'other' : 'none';
      expect(was, 'a card that is in neither pile moved').not.toBe('none');
      expect(e.toZone).toBe(was === 'chosen' ? piles.chosenTo : piles.otherTo);
      if (e.toZone === 'hand') t.toHand += 1;
      else t.toGraveyard += 1;
    }
    expect(events.some((e) => e.kind === 'pileChosen' && e.seat === asked.seat)).toBe(true);
    // The agents that are not random take the pile worth more for their own hand (or give the worse one to the player they choose for).
    const kind = kinds[asked.seat];
    if (kind !== 'random') {
      t.pilesByAgent += 1;
      const view = getView(before, asked.seat);
      const worth = (ids: readonly string[]): number =>
        ids.reduce((sum, id) => {
          const o = view.pendingCards?.find((c) => c.id === id);
          return sum + (o === undefined ? 0 : pileCardWorth(o));
        }, 0);
      const handPile = piles.chosenTo === 'hand' ? pick : rest;
      const handWorth = worth(handPile);
      const otherWorth = worth(handPile === pick ? rest : pick);
      if (piles.receiver === asked.seat) expect(handWorth).toBeGreaterThanOrEqual(otherWorth);
      else expect(handWorth).toBeLessThanOrEqual(otherWorth);
    }
  }

  // The reveal: public, names the top cards of the library, and is followed by the question or (with fewer than two cards) the pile question.
  for (const e of events) {
    if (e.kind === 'cardsRevealed' && e.from === 'library') {
      const piles = after.pending;
      if (
        (piles?.kind === 'chooseCards' && piles.purpose === 'separate') ||
        (piles?.kind === 'chooseOption' && piles.purpose === 'pile')
      ) {
        const ids =
          piles.kind === 'chooseCards'
            ? piles.legal
            : [...(piles.piles?.first ?? []), ...(piles.piles?.second ?? [])];
        expect(e.names).toHaveLength(ids.length);
        expect(e.cards).toHaveLength(ids.length);
        expectTopOfLibrary(after, e.seat, ids, 'the revealed cards');
        if (ids.length === 1) t.oneCardLibrary += 1;
      }
    }
  }
}

/** Plays a game with a decision context that hands out a determinized sample, like the runner (`runGame`). */
async function play(
  config: ReturnType<typeof smallGameConfig>,
  agents: readonly [Agent, Agent],
  onStep: (step: Step) => void,
): Promise<{ state: GameState; capped: boolean; log: { seat: SeatId; action: Action }[] }> {
  let state = createGame(config).state;
  const log: { seat: SeatId; action: Action }[] = [];
  let decisions = 0;
  while (state.result === null) {
    if (state.turn.number > MAX_TURNS || log.length >= MAX_ACTIONS) {
      return { state, capped: true, log };
    }
    const pending = state.pending;
    if (pending === null) throw new Error('a running game has no pending decision');
    const view = getView(state, pending.seat);
    if (view.pending === null) throw new Error('the deciding seat does not see its decision');
    const agent = agents[pending.seat];
    if (agent === undefined) throw new Error(`no agent for seat ${pending.seat}`);
    decisions += 1;
    const real = state;
    const ctx: DecideContext = {
      budgetMs: 1000,
      now: () => decisions,
      sample: (seed) => determinize(real, pending.seat, createRng(seed)),
    };
    const action = await agent.decide(view, view.pending, ctx);
    const r = applyAction(state, pending.seat, action);
    if (!r.ok) {
      throw new Error(
        `rejected ${JSON.stringify(action)}: ${r.error} (asked ${JSON.stringify(view.pending)})`,
      );
    }
    onStep({ before: state, after: r.state, seat: pending.seat, action, events: r.events });
    log.push({ seat: pending.seat, action });
    state = r.state;
  }
  return { state, capped: false, log };
}

test(
  `${GAMES} piles deck-style games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = PILES_STYLE_PAIRS[g % PILES_STYLE_PAIRS.length] ?? ['piles', 'piles'];
      const config = smallGameConfig(g, styles);
      const kinds: readonly [Kind, Kind] = [
        KINDS[g % 4] ?? 'random',
        KINDS[(g >> 2) % 4] ?? 'random',
      ];
      const agents = [make(kinds[0], 71000 + 2 * g), make(kinds[1], 71001 + 2 * g)] as const;
      const t = newTally();
      const run = await play(config, agents, (step) => {
        checkPiles(t, kinds, step);
        const problems = checkInvariants(step.after);
        if (problems.length > 0) throw new Error(`game ${g}: ${problems.join('; ')}`);
      });
      const tag = `game ${g} (${kinds.join(' v ')}, ${styles.join(' v ')})`;
      expect(run.capped, tag).toBe(false);
      expect(run.state.result, tag).not.toBeNull();
      for (const agent of agents) expect(agent.fallbacks, tag).toHaveLength(0);
      expect(stateHash(replayGame(config, run.log)), tag).toBe(stateHash(run.state));
      add(total, t);
    }
    console.log(`${GAMES} piles games: ${JSON.stringify(total)} (${PILES_NAMES.join(', ')})`);
    expectPath(total.separations, 'the question which cards form pile 1');
    expectPath(total.separationsByAgent, 'an agent that is not random separating');
    expectPath(total.piles, 'the question which pile goes where');
    expectPath(total.pilesByAgent, 'an agent that is not random choosing a pile');
    expectPath(total.toHand, 'a card of a pile going to the hand');
    expectPath(total.toGraveyard, 'a card of a pile going to the graveyard');
    expectPath(total.ownerSeparates, 'the controller separating for an opponent to choose');
  },
  soakTimeout(600_000),
);
