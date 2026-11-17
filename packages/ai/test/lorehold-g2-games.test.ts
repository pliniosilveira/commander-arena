// Slice soak (issue 86, group 2 of the Lorehold Spirit deck): whole games with the 'loreholdG2' deck style (SYNTHETIC cards of the engine fixtures `synthetic-lorehold-g2.ts`: the sorcery in which
// each player votes for past or present, the 3/5 with vigilance that exiles a noncreature, nonland card of its controller's graveyard at their end step for a 3/2 Spirit and casts it for free by
// sacrificing a Spirit, and a plain Spirit) between random agents, with CasualAgent and HeuristicAgent in some seats. Every game finishes with a result, no fallback, no rejected action and
// consistent state after every action; the action log replays to the same final state; and, with the rules read again here from CR 701.38a, 701.17a, 202.3, 120.3, 701.13, 611.2a, 500.1,
// 607.2a, 603.3d, 608.2b, 118.9, 614.1a and the cards' texts (not from the engine's own code), at every step:
//   - the players of a vote of a Verdict Tempest vote once each, the controller first, for past or present (CR 701.38a); as many cards are milled as there are past votes, or as many as the
//     library holds; each opponent is dealt damage equal to the total mana value of the cards milled and the controller is dealt none (CR 120.3); as many cards are exiled as there are present votes,
//     or as many as the library holds, face up; and a card exiled that way is cast or played by its controller only until the end of their next turn (CR 611.2a, 500.1);
//   - an Elephant triggers at the beginning of its controller's end step only when a noncreature, nonland card is in their graveyard (CR 603.3d); when the ability resolves it exiled that card
//     (a card of the controller's graveyard that is neither a creature nor a land), remembers it, and created a 3/2 red and white Spirit for the controller; when its target was gone it did
//     nothing at all (CR 608.2b);
//   - the ability that casts a card exiled with the Elephant is activated with a Spirit of its controller sacrificed and a card the Elephant exiled as its target (CR 607.2a, 602.2); that card
//     is cast without paying its mana cost only that turn, and never for a mana cost with this permission (CR 118.9); the spell cast that way never goes to a graveyard: it goes to the bottom of
//     its owner's library when it would leave the stack for one (CR 614.1a), and enters the battlefield when it is a permanent spell that resolves.
// The count is `soakGames()` (D-126); the path checks run from 100 games up.
import {
  applyAction,
  checkInvariants,
  type GameEvent,
  type GameState,
  getLegalActions,
  type ObjectId,
  stateHash,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import {
  type Agent,
  CasualAgent,
  HeuristicAgent,
  RandomLegalAgent,
  replayGame,
} from '../src/index';
import { cardNameOf, faceOf } from './game-names';
import { LOREHOLD_G2_STYLE_PAIRS, type StepInfo, smallGameConfig, stepGame } from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

const TEMPEST = 'SYNTHETIC Verdict Tempest';
const ELEPHANT = 'SYNTHETIC Lore Elephant';

interface Tally {
  votes: number;
  pastVotes: number;
  presentVotes: number;
  splitVotes: number;
  milledByVote: number;
  damageByVote: number;
  exiledByVote: number;
  shortLibraries: number;
  voteExiledCast: number;
  voteExiledPlayedLand: number;
  endStepTriggers: number;
  endStepExiles: number;
  endStepFizzles: number;
  spirits: number;
  activations: number;
  freeCasts: number;
  freeToLibrary: number;
  freePermanents: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  votes: 0,
  pastVotes: 0,
  presentVotes: 0,
  splitVotes: 0,
  milledByVote: 0,
  damageByVote: 0,
  exiledByVote: 0,
  shortLibraries: 0,
  voteExiledCast: 0,
  voteExiledPlayedLand: 0,
  endStepTriggers: 0,
  endStepExiles: 0,
  endStepFizzles: 0,
  spirits: 0,
  activations: 0,
  freeCasts: 0,
  freeToLibrary: 0,
  freePermanents: 0,
  byCard: new Map(),
});

/** What the events of one resolution (the steps that answer its questions, and the step that resolves it) did, for the checks made as it resolves. */
interface Window {
  events: GameEvent[];
  readonly kind: 'vote' | 'endStep';
  readonly seat: number;
  readonly source: ObjectId;
  /** The library of the controller as the resolution began (the step that answered its first question, or the step that resolved it). */
  startLibrary: number | null;
  /** The graveyard of the controller as the trigger went on the stack: what it could target. */
  readonly graveyard: ObjectId[];
  /** The target of the end step ability, as it was chosen. */
  target: ObjectId | null;
}

interface Permission {
  readonly seat: number;
  /** `turnsTaken` of the seat as the card was exiled: the permission lasts through the end of the turn when it is one more. */
  readonly taken: number;
}

interface Memory {
  windows: Map<ObjectId, Window>;
  /** The cards a Verdict Tempest exiled, which their controller may cast or play until the end of their next turn. */
  voteExiled: Map<ObjectId, Permission>;
  /** The cards an Elephant exiled, by the Elephant: they are the targets of its ability. */
  linked: Map<ObjectId, ObjectId>;
  /** The cards cast for free: the turn number the permission was given in. */
  freeTurn: Map<ObjectId, number>;
  /** The spells cast for free: they never go to a graveyard. */
  freeSpells: Set<ObjectId>;
  /** The permanents sacrificed in the last steps: what they were, for the cost of the ability that casts a card. */
  sacrifices: { index: number; permanent: ObjectId; controller: number; spirit: boolean }[];
}

const typesOf = (state: GameState, id: ObjectId) => faceOf(state, id)?.types ?? [];

/** CR 202.3: the mana value of a card as its face prints it ({X} is 0 outside the stack). */
const manaValueOf = (state: GameState, id: ObjectId): number =>
  (faceOf(state, id)?.manaCost ?? []).reduce((n, symbol) => {
    const generic = Number(symbol);
    return n + (Number.isInteger(generic) ? generic : symbol === 'X' ? 0 : 1);
  }, 0);

/** The turn of `seat` that `permission` lasts through has ended (CR 500.1: the turn after the one the card was exiled in). */
const expired = (state: GameState, permission: Permission): boolean => {
  const taken = state.seats[permission.seat]?.turnsTaken ?? 0;
  return (
    taken >= permission.taken + 2 ||
    (taken === permission.taken + 1 && state.turn.activeSeat !== permission.seat)
  );
};

const answeredSource = (step: StepInfo): ObjectId | undefined => {
  const pending = step.before.pending as { source?: ObjectId } | null;
  return pending?.source;
};

function checkVote(t: Tally, memory: Memory, step: StepInfo, window: Window): void {
  const { before, after } = step;
  const seat = window.seat;
  const other = seat === 0 ? 1 : 0;
  const voted = window.events.filter(
    (e): e is Extract<GameEvent, { kind: 'optionChosen' }> =>
      e.kind === 'optionChosen' && e.purpose === 'vote',
  );
  // CR 701.38a: each player votes once, starting with the controller and proceeding in turn order.
  expect(
    voted.map((v) => v.seat),
    'every player votes once, the controller first',
  ).toEqual([seat, other]);
  for (const v of voted) expect(['past', 'present']).toContain(v.option);
  const past = voted.filter((v) => v.option === 'past').length;
  const present = voted.length - past;
  const library = window.startLibrary ?? 0;
  const milled = window.events
    .filter(
      (e): e is Extract<GameEvent, { kind: 'milled' }> => e.kind === 'milled' && e.seat === seat,
    )
    .flatMap((e) => [...e.objects]);
  // CR 701.17a: a card for each past vote, or as many as there are.
  expect(
    milled.length,
    'a card is milled for each past vote, or as many as the library holds',
  ).toBe(Math.min(past, library));
  const value = milled.reduce((n, id) => n + manaValueOf(after, id), 0);
  const damage = window.events.filter(
    (e): e is Extract<GameEvent, { kind: 'damageDealt' }> =>
      e.kind === 'damageDealt' && e.source === window.source,
  );
  // CR 120.3, 202.3: each opponent is dealt the total mana value of the cards milled, the controller nothing.
  if (value > 0) {
    expect(
      damage.map((d) => (d.to.kind === 'player' ? d.to.seat : -1)),
      'the opponent is dealt the damage',
    ).toEqual([other]);
    expect(damage[0]?.amount, 'the total mana value of the cards milled').toBe(value);
    expect(damage[0]?.combat, 'noncombat damage').toBe(false);
  } else {
    expect(damage, 'no damage for no value').toHaveLength(0);
  }
  // CR 701.13: the top card of the library for each present vote, or as many as there are, face up.
  const exiled = window.events.filter(
    (e): e is Extract<GameEvent, { kind: 'zoneChanged' }> =>
      e.kind === 'zoneChanged' &&
      e.fromZone === 'library' &&
      e.toZone === 'exile' &&
      before.objects[e.from]?.owner === seat,
  );
  const left = library - milled.length;
  expect(exiled.length, 'a card is exiled for each present vote, or as many as are left').toBe(
    Math.min(present, left),
  );
  t.votes += 1;
  t.pastVotes += past;
  t.presentVotes += present;
  if (past === 1 && present === 1) t.splitVotes += 1;
  t.milledByVote += milled.length;
  t.damageByVote += value;
  t.exiledByVote += exiled.length;
  if (past > library || present > left) t.shortLibraries += 1;
  // CR 611.2a, 500.1: the cards exiled may be cast or played until the end of the controller's next turn.
  const taken = after.seats[seat]?.turnsTaken ?? 0;
  for (const e of exiled) memory.voteExiled.set(e.to, { seat, taken });
}

function checkEndStep(t: Tally, memory: Memory, step: StepInfo, window: Window, fizzled: boolean) {
  const { before, after } = step;
  const elephant = window.source;
  const exiled = window.events.filter(
    (e): e is Extract<GameEvent, { kind: 'zoneChanged' }> =>
      e.kind === 'zoneChanged' && e.fromZone === 'graveyard' && e.toZone === 'exile',
  );
  const spirits = window.events.filter(
    (e): e is Extract<GameEvent, { kind: 'tokenCreated' }> =>
      e.kind === 'tokenCreated' && e.name === 'Spirit',
  );
  if (fizzled || window.target === null) {
    // CR 608.2b: an ability with no legal target does nothing at all: no exile and no Spirit.
    expect(exiled, 'a fizzled Elephant exiles nothing').toHaveLength(0);
    expect(spirits, 'a fizzled Elephant creates no Spirit').toHaveLength(0);
    t.endStepFizzles += 1;
    return;
  }
  const target = window.target;
  const stillThere = before.objects[target]?.zone === 'graveyard';
  if (!stillThere) {
    expect(exiled, 'the target was gone: nothing is exiled').toHaveLength(0);
    expect(spirits).toHaveLength(0);
    t.endStepFizzles += 1;
    return;
  }
  expect(exiled, 'the target is exiled').toHaveLength(1);
  const [moved] = exiled;
  if (moved === undefined) return;
  // "noncreature, nonland card from your graveyard".
  expect(moved.from, 'the card that was targeted').toBe(target);
  expect(typesOf(before, target)).not.toContain('creature');
  expect(typesOf(before, target)).not.toContain('land');
  expect(before.objects[target]?.owner, "a card of the controller's graveyard").toBe(window.seat);
  // CR 607.2a: the Elephant remembers what it exiled.
  expect(after.objects[elephant]?.linkedExile ?? [], 'exiled with the Elephant').toContain(
    moved.to,
  );
  memory.linked.set(moved.to, elephant);
  expect(spirits, 'one Spirit token').toHaveLength(1);
  for (const s of spirits) {
    const token = after.objects[s.object]?.token;
    expect(token?.characteristics.power).toBe(3);
    expect(token?.characteristics.toughness).toBe(2);
    expect([...(token?.characteristics.colors ?? [])].sort()).toEqual(['R', 'W']);
    expect(token?.characteristics.subtypes).toContain('Spirit');
    expect(s.seat, "the token is the controller's").toBe(window.seat);
    t.spirits += 1;
  }
  t.endStepExiles += 1;
}

function checkRules(t: Tally, step: StepInfo, memory: Memory): void {
  const { before, after, events } = step;
  const turnNumber = before.turn.number;
  // Which resolution the events of this step belong to: the ability or spell whose question is answered, and the one that resolves.
  const resolved = events.flatMap((e) => (e.kind === 'resolved' ? [e.object] : []));
  const owners = new Set<ObjectId>([
    ...resolved,
    ...(answeredSource(step) === undefined ? [] : [answeredSource(step) as ObjectId]),
  ]);
  for (const owner of owners) {
    const window = memory.windows.get(owner);
    if (window === undefined) continue;
    if (window.startLibrary === null) {
      window.startLibrary = before.seats[window.seat]?.library.length ?? 0;
    }
    window.events.push(...events);
  }
  for (const e of events) {
    if (e.kind === 'sacrificed') {
      const gone = before.objects[e.permanent] ?? before.lki[e.permanent]?.object;
      const subtypes =
        gone?.token?.characteristics.subtypes ?? faceOf(before, e.permanent)?.subtypes;
      memory.sacrifices.push({
        index: step.index,
        permanent: e.permanent,
        controller: e.controller,
        spirit: subtypes?.includes('Spirit') ?? false,
      });
    }
  }
  for (const e of events) {
    if (e.kind === 'spellCast') {
      const name = cardNameOf(after, e.object);
      t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
      if (name === TEMPEST) {
        memory.windows.set(e.object, {
          events: [],
          kind: 'vote',
          seat: e.seat,
          source: e.object,
          startLibrary: null,
          graveyard: [],
          target: null,
        });
      }
      if (e.alternative === 'free' && e.fromZone === 'exile') {
        // The card cast without paying its mana cost with the Elephant's permission: one the Elephant exiled, given the permission this turn.
        const from = events.find(
          (z) => z.kind === 'zoneChanged' && z.toZone === 'stack' && z.to === e.object,
        );
        const card = from?.kind === 'zoneChanged' ? from.from : undefined;
        if (card !== undefined && memory.linked.has(card)) {
          expect(memory.freeTurn.get(card), 'cast the turn the permission was given').toBe(
            turnNumber,
          );
          memory.freeSpells.add(e.object);
          t.freeCasts += 1;
        }
      }
    }
    if (e.kind === 'abilityTriggered') {
      const name = cardNameOf(after, e.source);
      t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
      if (name === ELEPHANT && e.abilityIndex === 1) {
        // The beginning of the controller's end step, with a card to target in their graveyard (CR 603.3d: with none the ability is not put on the stack).
        expect(after.turn.step, 'at the beginning of the end step').toBe('end');
        expect(after.turn.activeSeat, 'of its controller').toBe(e.seat);
        const graveyard = (after.seats[e.seat]?.graveyard ?? []).filter(
          (id) => !typesOf(after, id).includes('creature') && !typesOf(after, id).includes('land'),
        );
        expect(graveyard.length, 'a noncreature, nonland card to target').toBeGreaterThan(0);
        const stackObject = after.objects[e.stackObject];
        const [chosen] = stackObject?.stack?.chosenTargets ?? [];
        memory.windows.set(e.stackObject, {
          events: [],
          kind: 'endStep',
          seat: e.seat,
          source: e.source,
          startLibrary: null,
          graveyard,
          target: chosen?.kind === 'object' ? chosen.id : null,
        });
        t.endStepTriggers += 1;
      }
    }
    if (e.kind === 'abilityActivated' && cardNameOf(after, e.source) === ELEPHANT) {
      if (e.abilityIndex === 2 && e.stackObject !== null) {
        t.activations += 1;
        const ability = after.objects[e.stackObject];
        const [chosen] = ability?.stack?.chosenTargets ?? [];
        expect(chosen?.kind, 'one target, a card').toBe('object');
        const linked = before.objects[e.source]?.linkedExile ?? [];
        expect(linked, 'a card exiled with this Elephant').toContain(
          chosen?.kind === 'object' ? chosen.id : -1,
        );
        // CR 602.2: a Spirit of the controller was sacrificed as the cost (in this step or the steps that answered its questions), and the Elephant tapped.
        const paid = memory.sacrifices.filter(
          (s) => s.index <= step.index && s.index >= step.index - 3,
        );
        const last = paid[paid.length - 1];
        expect(last, 'a permanent is sacrificed as the cost').not.toBeUndefined();
        expect(last?.controller, 'a Spirit of its controller').toBe(e.seat);
        expect(last?.spirit, 'a Spirit').toBe(true);
        expect(last?.permanent, 'not the Elephant, which is no Spirit').not.toBe(e.source);
        expect(after.objects[e.source]?.tapped, 'tapped as a cost').toBe(true);
        if (chosen?.kind === 'object') memory.freeTurn.set(chosen.id, turnNumber);
      }
    }
  }
  // The permission lasts this turn only (CR 611.2a): once the turn has changed, the card cannot be cast without paying its mana cost, and never for a mana cost.
  for (const [card, turn] of memory.freeTurn) {
    if (after.objects[card]?.zone !== 'exile') {
      memory.freeTurn.delete(card);
      continue;
    }
    for (const seat of [0, 1]) {
      const casts = getLegalActions(after, seat).filter(
        (a) => a.kind === 'castSpell' && a.object === card,
      );
      for (const a of casts) {
        expect(
          a.kind === 'castSpell' ? a.alternative : undefined,
          'cast only without paying its mana cost',
        ).toBe('free');
        expect(after.turn.number, 'only the turn the permission was given in').toBe(turn);
      }
    }
  }
  for (const card of memory.linked.keys()) {
    if (after.objects[card]?.zone !== 'exile') {
      memory.linked.delete(card);
      continue;
    }
    if (!memory.freeTurn.has(card)) {
      for (const seat of [0, 1]) {
        const casts = getLegalActions(after, seat).filter(
          (a) => a.kind === 'castSpell' && a.object === card,
        );
        expect(casts, 'a card exiled with the Elephant is not cast without the permission').toEqual(
          [],
        );
      }
    }
  }
  // A card a Verdict Tempest exiled is cast or played only until the end of its controller's next turn.
  for (const e of events) {
    if (
      e.kind === 'zoneChanged' &&
      e.fromZone === 'exile' &&
      (e.toZone === 'stack' || e.toZone === 'battlefield')
    ) {
      const permission = memory.voteExiled.get(e.from);
      if (permission !== undefined) {
        expect(expired(before, permission), 'cast or played after the permission ended').toBe(
          false,
        );
        if (e.toZone === 'stack') t.voteExiledCast += 1;
        else t.voteExiledPlayedLand += 1;
      }
    }
  }
  for (const [card, permission] of memory.voteExiled) {
    if (after.objects[card]?.zone !== 'exile') {
      memory.voteExiled.delete(card);
      continue;
    }
    if (expired(after, permission)) {
      for (const seat of [0, 1]) {
        const plays = getLegalActions(after, seat).filter(
          (a) => (a.kind === 'castSpell' || a.kind === 'playLand') && a.object === card,
        );
        expect(plays, 'no cast or play after the end of the next turn').toEqual([]);
      }
    }
  }
  // The spells cast for free never go to a graveyard (CR 614.1a): to the bottom of their owner's library, or onto the battlefield when they are permanent spells that resolve.
  for (const e of events) {
    if (e.kind === 'zoneChanged' && e.fromZone === 'stack' && memory.freeSpells.has(e.from)) {
      expect(e.toZone, 'a spell cast for free is never put into a graveyard').not.toBe('graveyard');
      if (e.toZone === 'library') {
        const owner = after.objects[e.to]?.owner ?? 0;
        const library = after.seats[owner]?.library ?? [];
        expect(library[library.length - 1], "on the bottom of its owner's library").toBe(e.to);
        t.freeToLibrary += 1;
      }
      if (e.toZone === 'battlefield') t.freePermanents += 1;
      memory.freeSpells.delete(e.from);
    }
  }
  // The windows that resolve (or are removed without resolving).
  for (const id of resolved) {
    const window = memory.windows.get(id);
    if (window === undefined) continue;
    if (window.kind === 'vote') checkVote(t, memory, step, window);
    else {
      // The target as it was chosen, read from the ability as it resolves.
      const [chosen] = before.objects[id]?.stack?.chosenTargets ?? [];
      window.target = chosen?.kind === 'object' ? chosen.id : null;
      checkEndStep(t, memory, step, window, false);
    }
    memory.windows.delete(id);
  }
  for (const e of events) {
    if (e.kind === 'fizzled' || e.kind === 'countered') {
      const window = memory.windows.get(e.object);
      if (window?.kind === 'endStep' && e.kind === 'fizzled') {
        window.events.push(...events);
        // CR 608.2b: every target was illegal.
        const [chosen] = before.objects[e.object]?.stack?.chosenTargets ?? [];
        window.target = chosen?.kind === 'object' ? chosen.id : null;
        checkEndStep(t, memory, step, window, true);
      }
      memory.windows.delete(e.object);
    }
  }
  void applyAction;
}

test(
  `${GAMES} loreholdG2 games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = LOREHOLD_G2_STYLE_PAIRS[g % LOREHOLD_G2_STYLE_PAIRS.length] ?? [
        'loreholdG2',
        'loreholdG2',
      ];
      const config = smallGameConfig(g, styles);
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? g % 8 < 4
            ? new CasualAgent({ seed: 273000 + 2 * g + seat })
            : new HeuristicAgent({ seed: 273000 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 273000 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const t = newTally();
      const memory: Memory = {
        windows: new Map(),
        voteExiled: new Map(),
        linked: new Map(),
        freeTurn: new Map(),
        freeSpells: new Set(),
        sacrifices: [],
      };
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        checkRules(t, step, memory);
        const problems = checkInvariants(step.after);
        if (problems.length > 0) throw new Error(`game ${g}: ${problems.join('; ')}`);
        if (step.index % 97 === 0) {
          const listed = getLegalActions(step.before, step.seat);
          expect(
            listed.some((a) => JSON.stringify(a) === JSON.stringify(step.action)) ||
              applyAction(step.before, step.seat, step.action).ok,
          ).toBe(true);
        }
      });
      const tag = `game ${g}`;
      expect(run.capped, tag).toBe(false);
      expect(run.state.result, tag).not.toBeNull();
      for (const agent of agents) expect(agent.fallbacks, tag).toHaveLength(0);
      expect(stateHash(replayGame(config, log)), tag).toBe(stateHash(run.state));
      for (const key of Object.keys(t) as (keyof Tally)[]) {
        if (key === 'byCard') continue;
        total[key] += t[key];
      }
      for (const [name, n] of t.byCard) total.byCard.set(name, (total.byCard.get(name) ?? 0) + n);
    }
    console.log(
      `${GAMES} loreholdG2 games: ${JSON.stringify({ ...total, byCard: Object.fromEntries([...total.byCard].sort()) })}`,
    );
    expectPath(total.votes, 'a Verdict Tempest that resolves with its vote');
    expectPath(total.pastVotes, 'a vote for past');
    expectPath(total.presentVotes, 'a vote for present');
    expectPath(total.milledByVote, 'a card milled by the votes');
    expectPath(total.damageByVote, 'damage dealt for the cards milled');
    expectPath(total.exiledByVote, 'a card exiled for a present vote');
    expectPath(total.endStepTriggers, 'an Elephant that triggers at the end step');
    expectPath(total.endStepExiles, 'an Elephant that exiles a card and creates a Spirit');
    expectPath(total.spirits, 'a Spirit token');
    expectPath(total.activations, 'an Elephant that casts a card exiled with it');
    expectPath(total.freeCasts, 'a card cast without paying its mana cost');
    expectPath(total.freeToLibrary, 'a spell cast for free that goes to the bottom of the library');
  },
  soakTimeout(600_000),
);
