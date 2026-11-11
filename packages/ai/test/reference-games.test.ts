// Slice soak: whole games (the `soakGames()` count, test/soak.ts) with the 'references' deck style (SYNTHETIC cards of D-092: life equal
// to a target's power or mana value, a token created and a library searched by "its controller", a
// graveyard exiled by owner as a spell and as an enters trigger, "counter target spell unless its
// controller pays", a bounce land) between random agents, with CasualAgent in some seats. Every game
// finishes with a result, no fallback, no rejected action and consistent state after every action;
// the action log replays to the same final state; and every new path occurs and is checked against
// the state around it: amounts read from last-known information (CR 608.2h), the other seat asked
// whether to search and choosing the card, with the cards hidden from the caster (CR 701.23a, 401.2)
// and the land entering tapped under the searcher's control (CR 110.2a), tokens created under the
// target's controller (CR 111.2), a graveyard exiled by owner (CR 108.3), the counter-unless
// question asked of the spell's controller, and the choice of a land to return (CR 608.2d).
import {
  checkInvariants,
  type GameEvent,
  type GameState,
  getView,
  manaValue,
  type ObjectId,
  stateHash,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { type Agent, CasualAgent, RandomLegalAgent, replayGame } from '../src/index';
import { cardNameOf } from './game-names';
import {
  REFERENCE_CARD_NAMES,
  REFERENCE_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

interface Tally {
  gainPower: number;
  weigh: number;
  reanimate: number;
  costly: number;
  beast: number;
  seekShuffle: number;
  searchAsked: number;
  searchAskedOfOther: number;
  searchAccepted: number;
  searchDeclined: number;
  searchChosenByOther: number;
  searchFound: number;
  wipe: number;
  watcher: number;
  counterAsked: number;
  counterPaid: number;
  counterDeclined: number;
  counterWithoutAsking: number;
  bounceChosen: number;
  bounceAutomatic: number;
  bounceByChoice: number;
  casualSearchYes: number;
  casualViolations: number;
  hiddenChecks: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  gainPower: 0,
  weigh: 0,
  reanimate: 0,
  costly: 0,
  beast: 0,
  seekShuffle: 0,
  searchAsked: 0,
  searchAskedOfOther: 0,
  searchAccepted: 0,
  searchDeclined: 0,
  searchChosenByOther: 0,
  searchFound: 0,
  wipe: 0,
  watcher: 0,
  counterAsked: 0,
  counterPaid: 0,
  counterDeclined: 0,
  counterWithoutAsking: 0,
  bounceChosen: 0,
  bounceAutomatic: 0,
  bounceByChoice: 0,
  casualSearchYes: 0,
  casualViolations: 0,
  hiddenChecks: 0,
  byCard: new Map(),
});

/** The mana value of a card or spell object, from its definition (CR 202.3). */
function mv(state: GameState, id: ObjectId): number {
  const obj = state.objects[id] ?? state.lki[id]?.object;
  if (obj?.card == null) return 0;
  const card = state.cards[obj.card];
  const cost = card === undefined ? null : state.definitions[card.definition]?.faces[0]?.manaCost;
  return cost == null ? 0 : manaValue(cost);
}

const life = (s: GameState, seat: number) => s.seats[seat]?.life ?? 0;

/** The power a creature has on the battlefield of `state`, read the way the view reports it. */
function powerNow(state: GameState, id: ObjectId): number {
  return getView(state, 0).battlefield.find((o) => o.id === id)?.power ?? 0;
}

/** Checks what a resolved spell or ability did against the state before it, for the new cards. */
function checkResolved(tally: Tally, step: StepInfo, id: ObjectId): void {
  const { before, after, events } = step;
  const obj = before.objects[id];
  if (obj?.stack == null) return;
  const source = obj.stack.source;
  const name =
    obj.stack.kind === 'ability' && source !== null
      ? cardNameOf(before, source)
      : cardNameOf(before, id);
  if (!(REFERENCE_CARD_NAMES as readonly string[]).includes(name)) return;
  tally.byCard.set(name, (tally.byCard.get(name) ?? 0) + 1);
  const target = obj.stack.chosenTargets[0];
  const targetObj = target?.kind === 'object' ? before.objects[target.id] : undefined;

  if (name === 'SYNTHETIC Exile Gain Power' && targetObj?.zone === 'battlefield' && target) {
    const power = powerNow(before, targetObj.id);
    const seat = targetObj.controller;
    expect(life(after, seat) - life(before, seat), name).toBe(Math.max(power, 0));
    tally.gainPower += 1;
  }
  if (name === 'SYNTHETIC Weigh Creature' && targetObj?.zone === 'battlefield') {
    const power = powerNow(before, targetObj.id);
    const seat = targetObj.controller;
    expect(life(after, seat) - life(before, seat), name).toBe(
      mv(before, targetObj.id) - Math.max(power, 0),
    );
    tally.weigh += 1;
  }
  if (name === 'SYNTHETIC Reanimate Pay Life' && targetObj?.zone === 'graveyard') {
    expect(life(after, obj.controller) - life(before, obj.controller), name).toBe(
      -mv(before, targetObj.id),
    );
    tally.reanimate += 1;
  }
  if (name === 'SYNTHETIC Costly Counter' && targetObj?.zone === 'stack') {
    expect(life(after, targetObj.controller) - life(before, targetObj.controller), name).toBe(
      -mv(before, targetObj.id),
    );
    tally.costly += 1;
  }
  if (name === 'SYNTHETIC Wild Transform' && targetObj?.zone === 'battlefield') {
    // The token comes under the control of the target's controller, which is read after the target
    // died (CR 111.2, 608.2h): that seat has one more Beast than before.
    const seat = targetObj.controller;
    const tokens = (s: GameState) =>
      s.battlefield.filter((x) => {
        const o = s.objects[x];
        return o?.token != null && o.controller === seat && o.owner === seat;
      }).length;
    const diedAndMade = tokens(after) - tokens(before);
    // A token target dies too (and vanishes), so count only when the target was not a token.
    if (targetObj.token === null) expect(diedAndMade, name).toBe(1);
    tally.beast += 1;
  }
  if (name === 'SYNTHETIC Seek And Shuffle' && targetObj?.zone === 'battlefield') {
    const shuffled = events.filter((e) => e.kind === 'libraryShuffled');
    expect(shuffled, name).toEqual([{ kind: 'libraryShuffled', seat: targetObj.owner }]);
    tally.seekShuffle += 1;
  }
  if (
    (name === 'SYNTHETIC Graveyard Wipe' || name === 'SYNTHETIC Graveyard Watcher') &&
    target?.kind === 'player'
  ) {
    // Everything that was in the target player's graveyard is in exile now (the spell itself was on
    // the stack, so it is not among them); nothing of the other player's moved.
    const cardsOf = (ids: readonly ObjectId[], s: GameState) =>
      ids.map((x) => s.objects[x]?.card ?? '').sort();
    const was = before.seats[target.seat]?.graveyard ?? [];
    const exiledNow = after.exile.filter(
      (x) => was.length > 0 && after.objects[x]?.owner === target.seat,
    );
    const wasCards = cardsOf(was, before);
    const exiledCards = new Set(cardsOf(exiledNow, after));
    for (const c of wasCards) expect(exiledCards.has(c), `${name}: ${c}`).toBe(true);
    const other = target.seat === 0 ? 1 : 0;
    expect(after.seats[other]?.graveyard.length ?? 0, name).toBeGreaterThanOrEqual(
      before.seats[other]?.graveyard.length ?? 0,
    );
    if (name === 'SYNTHETIC Graveyard Wipe') tally.wipe += 1;
    else tally.watcher += 1;
  }
}

/** Notes what one applied action did, for the paths this slice added, and checks it. */
function note(tally: Tally, casual: ReadonlySet<number>, step: StepInfo): void {
  const { before, after, events, seat, action } = step;
  const d = before.pending;
  const other = seat === 0 ? 1 : 0;

  for (const e of events as readonly GameEvent[]) {
    if (e.kind === 'resolved') checkResolved(tally, step, e.object);
  }

  // "May search": asked of the player who would search, whoever's spell it is.
  if (d?.kind === 'confirmOptional' && d.purpose === 'search') {
    tally.searchAsked += 1;
    const spell = before.objects[d.source];
    expect(d.seat).toBe(seat);
    if (spell !== undefined && spell.controller !== d.seat) tally.searchAskedOfOther += 1;
    const view = getView(before, other);
    if (view.pending !== null || view.pendingCards !== undefined) {
      throw new Error("the other seat's view shows the decision");
    }
    tally.hiddenChecks += 1;
    if (action.kind === 'acceptOptional') tally.searchAccepted += 1;
    else tally.searchDeclined += 1;
    if (casual.has(seat)) {
      if (action.kind === 'acceptOptional') tally.casualSearchYes += 1;
      else tally.casualViolations += 1;
    }
  }

  if (d?.kind === 'chooseCards' && d.purpose === 'search' && action.kind === 'chooseCards') {
    const spell = before.objects[d.source];
    if (spell !== undefined && spell.controller !== d.seat) {
      tally.searchChosenByOther += 1;
      // The caster sees that the other seat is searching, never the cards they look at (CR 401.2).
      const view = getView(before, other);
      const text = JSON.stringify(view);
      if (view.pending !== null || view.pendingCards !== undefined) {
        throw new Error("the other seat's view shows the cards");
      }
      for (const id of d.legal) {
        if (text.includes(`"${id}"`)) throw new Error(`the other seat's view shows ${id}`);
      }
      expect(view.waitingOn).toEqual({
        seat: d.seat,
        purpose: 'search',
        sourceName: cardNameOf(before, d.source),
      });
      tally.hiddenChecks += 1;
    }
    // Whoever searched, the card found is on the battlefield tapped under the searcher's control.
    for (const id of action.objects) {
      const card = before.objects[id]?.card;
      const now = after.battlefield
        .map((x) => after.objects[x])
        .find((o) => o?.card === card && card != null);
      expect(now?.controller, 'found land controller').toBe(d.seat);
      expect(now?.tapped, 'found land is tapped').toBe(true);
      tally.searchFound += 1;
    }
  }

  // "Counter target spell unless its controller pays": the controller of the target is asked.
  if (d?.kind === 'confirmOptional' && d.purpose === 'counterUnlessPays') {
    tally.counterAsked += 1;
    const subject = d.subject === undefined ? undefined : before.objects[d.subject];
    expect(subject?.controller, 'payer').toBe(d.seat);
    expect(seat).toBe(d.seat);
    if (action.kind === 'acceptOptional') tally.counterPaid += 1;
    else {
      tally.counterDeclined += 1;
      expect(events.some((e) => e.kind === 'countered' && e.object === d.subject)).toBe(true);
    }
    if (casual.has(seat) && d.subject !== undefined) {
      const lifeCost = (d.cost ?? []).reduce(
        (n, c) => n + (c.kind === 'payLife' && typeof c.amount === 'number' ? c.amount : 0),
        0,
      );
      const manaCost = manaValue(
        (d.cost ?? []).flatMap((c) => (c.kind === 'mana' ? c.symbols : [])),
      );
      const worth = mv(before, d.subject);
      const dangerous = lifeCost > 0 && life(before, seat) <= 10;
      const expected = !dangerous && worth >= manaCost + Math.ceil(lifeCost / 2);
      if ((action.kind === 'acceptOptional') !== expected) tally.casualViolations += 1;
    }
  }
  if (d?.kind === 'payMana' && d.purpose === 'counterUnlessPays' && action.kind === 'payAuto') {
    const subject = d.subject === undefined ? undefined : after.objects[d.subject];
    expect(subject?.zone, 'paid: the spell stays').toBe('stack');
  }
  // A counter that resolved and countered a spell without asking: its controller could not pay.
  for (const e of events as readonly GameEvent[]) {
    if (e.kind !== 'resolved') continue;
    const name = cardNameOf(before, e.object);
    if (name !== 'SYNTHETIC Soft Counter' && name !== 'SYNTHETIC Toll Counter') continue;
    const targetId = before.objects[e.object]?.stack?.chosenTargets[0];
    if (
      targetId?.kind === 'object' &&
      events.some((x) => x.kind === 'countered' && x.object === targetId.id)
    ) {
      tally.counterWithoutAsking += 1;
    }
  }

  // "Return a land you control": automatic or chosen by the controller.
  for (const e of events as readonly GameEvent[]) {
    if (e.kind === 'permanentsChosen' && e.purpose === 'effect') {
      tally.bounceChosen += 1;
      if (e.automatic) tally.bounceAutomatic += 1;
      else tally.bounceByChoice += 1;
      for (const id of e.objects) {
        const card = before.objects[id]?.card;
        const inHand = (after.seats[before.objects[id]?.owner ?? 0]?.hand ?? []).some(
          (h) => after.objects[h]?.card === card,
        );
        expect(inHand, 'the land is back in its owner’s hand').toBe(true);
      }
    }
  }
  if (d?.kind === 'choosePermanent' && d.purpose === 'effect' && casual.has(seat)) {
    const tapped = d.legal.filter((id) => before.objects[id]?.tapped === true);
    if (action.kind === 'choosePermanents' && tapped.length > 0) {
      const first = action.objects[0];
      if (first === undefined || !tapped.includes(first)) tally.casualViolations += 1;
    }
  }
}

test(
  `${GAMES} reference games run clean, replay exactly and use every new path`,
  async () => {
    const total = newTally();
    const turns: number[] = [];
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = REFERENCE_STYLE_PAIRS[g % REFERENCE_STYLE_PAIRS.length] ?? [
        'references',
        'references',
      ];
      const config = smallGameConfig(g, styles);
      // Seats of CasualAgent by game: seat 0, seat 1, both, neither (random against random).
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? new CasualAgent({ seed: 12500 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 12500 + 2 * g + seat });
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
        if (key === 'byCard') {
          for (const [name, n] of tally.byCard)
            total.byCard.set(name, (total.byCard.get(name) ?? 0) + n);
        } else total[key] += tally[key];
      }
    }
    const { byCard, ...counts } = total;
    console.log(
      `100 reference games: ${JSON.stringify({ ...counts, turnsMax: Math.max(...turns), byCard: Object.fromEntries(byCard) })}`,
    );

    expectPath(total.gainPower);
    expectPath(total.reanimate);
    expectPath(total.beast);
    expectPath(total.wipe);
    expectPath(total.watcher);
    expectPath(total.searchAsked);
    expectPath(total.searchAskedOfOther);
    expectPath(total.searchChosenByOther);
    expectPath(total.searchFound);
    expectPath(total.counterAsked);
    expectPath(total.counterPaid);
    expectPath(total.counterDeclined);
    expectPath(total.bounceChosen);
    expectPath(total.bounceAutomatic);
    expectPath(total.bounceByChoice);
    expectPath(total.casualSearchYes);
    expect(total.casualViolations).toBe(0);
    expectPath(total.hiddenChecks);
  },
  soakTimeout(300_000),
);
