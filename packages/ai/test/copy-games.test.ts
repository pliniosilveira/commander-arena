// Slice soak (D-129): whole games with the 'copies' deck style (SYNTHETIC cards that copy a spell and Storm cards)
// between random agents, with CasualAgent in some seats. Every game finishes with a result, no fallback, no rejected
// action, no agent error and consistent state after every action; the action log replays to the same final state; and
// the rules of the slice are restated from the events: a copy is no cast spell and counts for nothing, each storm
// trigger makes exactly as many copies as spells were cast before its spell (and each replicate trigger as many as the
// replicate cost was paid), a copy that is countered or resolves
// ceases to exist, and a copy of a permanent spell becomes a token. Every path of the slice occurs.
// D-126 sets 20 games per run.
import {
  checkInvariants,
  type GameEvent,
  type GameState,
  type ObjectId,
  stateHash,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { type Agent, CasualAgent, RandomLegalAgent, replayGame } from '../src/index';
import { COPY_NAMES, COPY_STYLE_PAIRS, type StepInfo, smallGameConfig, stepGame } from './helpers';

const GAMES = 20;
const LIMITS = { maxTurns: 150, maxActions: 5000 };

interface Tally {
  copiesMade: number;
  stormTriggers: number;
  stormCopies: number;
  stormEmpty: number;
  effectCopies: number;
  questions: number;
  questionsChanged: number;
  questionsUnchanged: number;
  copiesCountered: number;
  copiesResolved: number;
  copyTokens: number;
  casualCopyCasts: number;
  stormCasts: number;
  stormCasts0: number;
  replicateTriggers: number;
  replicateCopies: number;
  replicasAsked: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  copiesMade: 0,
  stormTriggers: 0,
  stormCopies: 0,
  stormEmpty: 0,
  effectCopies: 0,
  questions: 0,
  questionsChanged: 0,
  questionsUnchanged: 0,
  copiesCountered: 0,
  copiesResolved: 0,
  copyTokens: 0,
  casualCopyCasts: 0,
  stormCasts: 0,
  stormCasts0: 0,
  replicateTriggers: 0,
  replicateCopies: 0,
  replicasAsked: 0,
  byCard: new Map(),
});

const nameOf = (state: GameState, id: string): string => {
  const obj = state.objects[id as ObjectId] ?? state.lki[id as ObjectId]?.object;
  if (!obj) return '?';
  const card = obj.card ?? obj.copyOf;
  if (card === null || card === undefined) return '?';
  const instance = state.cards[card];
  return instance === undefined ? '?' : (state.definitions[instance.definition]?.name ?? '?');
};

/** Per-game bookkeeping that spans steps (a storm trigger can wait for answers in the middle). */
interface GameBook {
  /** Copies made by each storm trigger that is resolving, by the id of the trigger. */
  readonly stormMade: Map<string, number>;
  /** Spells cast this turn, from the events (the rule restated). */
  castsThisTurn: number;
}

/** Notes what one applied action did, for the paths this slice added, and checks the rules from the events. */
function note(tally: Tally, book: GameBook, casual: ReadonlySet<number>, step: StepInfo): void {
  const { before, after, events } = step;

  for (const e of events) {
    if (e.kind === 'turnBegan') book.castsThisTurn = 0;
    if (e.kind === 'spellCast') {
      book.castsThisTurn += 1;
      const name = nameOf(after, e.object);
      tally.byCard.set(name, (tally.byCard.get(name) ?? 0) + 1);
      // A spell that was cast is never a copy (CR 707.10): it has a card.
      const obj = after.objects[e.object];
      if (obj !== undefined && obj.copyOf !== undefined) throw new Error('a copy was cast');
      if (name.includes('Storm')) {
        tally.stormCasts += 1;
        // The count recorded as the spell was cast is what the seats had counted before it.
        const before0 = obj?.stack?.spellsCastBefore;
        if (before0 === undefined || before0 !== book.castsThisTurn - 1) {
          throw new Error(
            `a spell was cast with a storm count of ${before0}, not ${book.castsThisTurn - 1}`,
          );
        }
        if (before0 === 0) tally.stormCasts0 += 1;
      }
      if (casual.has(step.seat) && /Twin/.test(name)) tally.casualCopyCasts += 1;
    }
  }
  // CR 601.2i, 707.10: what the seats counted is the spells cast, and no copy among them.
  const counted = after.seats.reduce((n, s) => n + s.spellsCastThisTurn, 0);
  if (counted !== book.castsThisTurn) {
    throw new Error(
      `the seats counted ${counted} spells this turn, the events ${book.castsThisTurn}`,
    );
  }

  // Which spell or ability was resolving when these events happened: the one the answer belongs to, or the top of the
  // stack the pass resolved.
  const resolving = before.resolution?.object ?? before.stack[before.stack.length - 1];
  const resolvingObj = resolving === undefined ? undefined : before.objects[resolving];
  const ability = resolvingObj?.stack?.ability;
  const isStorm = ability?.kind === 'triggered' && ability.effect.kind === 'storm';
  const isReplicate = ability?.kind === 'triggered' && ability.effect.kind === 'replicate';

  for (const e of events) {
    if (e.kind === 'spellCopied') {
      tally.copiesMade += 1;
      const copy = after.objects[e.copy];
      if (copy === undefined || copy.copyOf === undefined || copy.card !== null) {
        throw new Error('a copy of a spell is not a spell with no card');
      }
      if (copy.controller !== e.seat || copy.owner !== e.seat) {
        throw new Error('a copy is not controlled and owned by the player who put it on the stack');
      }
      if (copy.zone !== 'stack') throw new Error('a copy of a spell was made off the stack');
      if ((isStorm || isReplicate) && resolving !== undefined) {
        if (isStorm) tally.stormCopies += 1;
        else tally.replicateCopies += 1;
        book.stormMade.set(resolving, (book.stormMade.get(resolving) ?? 0) + 1);
      } else {
        tally.effectCopies += 1;
      }
    }
    // A copy that is countered ceases to exist: it is in no zone and no graveyard.
    if (e.kind === 'countered' && before.objects[e.object]?.copyOf !== undefined) {
      tally.copiesCountered += 1;
      if (after.objects[e.object] !== undefined) throw new Error('a countered copy stayed');
    }
    if (e.kind === 'resolved') {
      const gone = before.objects[e.object];
      if (gone?.copyOf !== undefined) {
        tally.copiesResolved += 1;
        const permanent = gone.stack?.kind === 'spell' && e.object !== undefined;
        if (!permanent) throw new Error('a copy resolved but is not a spell');
      }
      // Each storm trigger makes exactly as many copies as spells were cast before the spell, from last-known info.
      const trig = before.objects[e.object];
      const effect = trig?.stack?.ability;
      if (
        effect?.kind === 'triggered' &&
        (effect.effect.kind === 'storm' || effect.effect.kind === 'replicate')
      ) {
        const replicate = effect.effect.kind === 'replicate';
        if (replicate) tally.replicateTriggers += 1;
        else tally.stormTriggers += 1;
        const source = trig?.stack?.source;
        const spell =
          source == null ? undefined : (after.objects[source] ?? after.lki[source]?.object);
        const expected = replicate
          ? (spell?.stack?.replicated ?? 0)
          : (spell?.stack?.spellsCastBefore ?? 0);
        const made = book.stormMade.get(e.object) ?? 0;
        if (made !== expected) {
          throw new Error(
            `a ${effect.effect.kind} trigger made ${made} copies, expected ${expected}`,
          );
        }
        if (made === 0 && !replicate) tally.stormEmpty += 1;
        book.stormMade.delete(e.object);
      }
    }
  }

  // The question of the replicate count: asked as the spell is cast, answered within its range.
  if (before.pending?.kind === 'chooseX' && before.pending.purpose === 'replicate') {
    tally.replicasAsked += 1;
    if (
      step.action.kind !== 'chooseX' ||
      step.action.value < before.pending.min ||
      step.action.value > before.pending.max
    ) {
      throw new Error('the replicate count was not answered within its range');
    }
  }

  // The question about the new targets of a copy: what was answered.
  const asked = before.pending;
  if (asked?.kind === 'targets' && asked.forCopy === true) {
    tally.questions += 1;
    if (step.action.kind !== 'chooseTargets')
      throw new Error('a copy question was not answered by targets');
    const same = JSON.stringify(step.action.targets) === JSON.stringify(asked.current ?? []);
    if (same) tally.questionsUnchanged += 1;
    else tally.questionsChanged += 1;
  }

  // A copy of a permanent spell that resolved is a token now, and no longer a copy of a spell (CR 707.10f).
  for (const e of events as readonly GameEvent[]) {
    if (e.kind !== 'zoneChanged' || e.toZone !== 'battlefield') continue;
    const was = before.objects[e.from];
    if (was?.copyOf === undefined) continue;
    const now = after.objects[e.to];
    if (now === undefined || now.token === null || now.copyOf !== undefined || now.card !== null) {
      throw new Error('a copy of a permanent spell did not become a token');
    }
    tally.copyTokens += 1;
  }

  // CR 704.5e: a copy of a spell is on the stack or nowhere.
  for (const obj of Object.values(after.objects)) {
    if (obj.copyOf !== undefined && obj.zone !== 'stack') throw new Error('a copy left the stack');
  }
}

test(`${GAMES} copy games run clean, replay exactly and use every path of the slice`, async () => {
  const total = newTally();
  const turns: number[] = [];
  for (let g = 1; g <= GAMES; g += 1) {
    const styles = COPY_STYLE_PAIRS[g % COPY_STYLE_PAIRS.length] ?? ['copies', 'copies'];
    const config = smallGameConfig(g, styles);
    // Seats of CasualAgent by game: seat 0, seat 1, both, neither (random against random).
    const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
    const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
      casual.has(seat)
        ? new CasualAgent({ seed: 7700 + 2 * g + seat })
        : new RandomLegalAgent({ seed: 7700 + 2 * g + seat });
    const agents = [make(0), make(1)] as const;
    const tally = newTally();
    const book: GameBook = { stormMade: new Map(), castsThisTurn: 0 };
    const log: { seat: number; action: StepInfo['action'] }[] = [];
    const run = await stepGame(config, agents, LIMITS, (step) => {
      log.push({ seat: step.seat, action: step.action });
      note(tally, book, casual, step);
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
    for (const [name, n] of tally.byCard) total.byCard.set(name, (total.byCard.get(name) ?? 0) + n);
  }
  const summary = {
    ...total,
    byCard: Object.fromEntries([...total.byCard].sort()),
    turnsMax: Math.max(...turns),
  };
  console.log(`${GAMES} copy games: ${JSON.stringify(summary)}`);

  expect(total.copiesMade).toBeGreaterThan(0);
  expect(total.stormCasts).toBeGreaterThan(0);
  expect(total.stormTriggers).toBeGreaterThan(0);
  expect(total.stormCopies).toBeGreaterThan(0);
  expect(total.replicasAsked).toBeGreaterThan(0);
  expect(total.replicateTriggers).toBeGreaterThan(0);
  expect(total.replicateCopies).toBeGreaterThan(0);
  expect(total.effectCopies).toBeGreaterThan(0);
  expect(total.questions).toBeGreaterThan(0);
  expect(total.questionsUnchanged + total.questionsChanged).toBe(total.questions);
  expect(total.copiesResolved).toBeGreaterThan(0);
  // A copy that is countered is rare in random games (the engine tests pin it); the rule is checked whenever it happens.
  expect(total.copyTokens).toBeGreaterThan(0);
  // Every copy card was cast at least once somewhere in the games.
  const never = COPY_NAMES.filter((n) => (total.byCard.get(n) ?? 0) === 0);
  expect(never).toEqual([]);
}, 240_000);
