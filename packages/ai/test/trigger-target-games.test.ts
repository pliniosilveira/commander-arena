// Slice soak: whole games (the `soakGames()` count, test/soak.ts) with the 'triggerTargets' deck style (SYNTHETIC creatures, a watcher,
// a totem and a Saga whose triggered abilities choose targets as they go on the stack, CR 603.3d)
// between random agents, with CasualAgent in some seats. Every game finishes with a result, no
// fallback, no rejected action, no agent error and consistent state after every action; the action
// log replays to the same final state (the hash covers the waiting-trigger context); and every new
// path occurs: targets asked of a trigger's controller (never with a cancel), targets chosen by the
// engine when forced, abilities removed for want of a target, triggers countered by Ward or
// fizzling, several targeted triggers ordered, dies triggers and Saga chapters with targets, "you
// may" with a target. CasualAgent never aims a harmful trigger at its own side when an opposing
// target is legal, nor a helpful one at the opponent when its own is.
import {
  checkInvariants,
  type GameEvent,
  type GameState,
  getLegalActions,
  legalActionsForDecision,
  type ObjectId,
  stateHash,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { type Agent, CasualAgent, RandomLegalAgent, replayGame } from '../src/index';
import {
  type StepInfo,
  smallGameConfig,
  stepGame,
  TRIGGER_TARGET_CARD_NAMES,
  TRIGGER_TARGET_STYLE_PAIRS,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

/** Abilities whose targets belong on the other side's permanents, and the ones that help our own. */
const HARMFUL = ['SYNTHETIC Reaper Imp', 'SYNTHETIC Last Gasp Imp', 'SYNTHETIC Ember Watcher'];
const HELPFUL = ['SYNTHETIC Mentor Imp', 'SYNTHETIC Growth Totem'];

interface Tally {
  asked: number;
  askedNoCancel: number;
  autoChosen: number;
  emptyUpTo: number;
  removed: number;
  removedChapter: number;
  fizzled: number;
  counteredByWard: number;
  wardOnTrigger: number;
  orderedTargeted: number;
  askedDies: number;
  askedChapter: number;
  askedOptional: number;
  askedTwoSlots: number;
  casualAsked: number;
  casualHarmful: number;
  casualHelpful: number;
  casualWrongSide: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  asked: 0,
  askedNoCancel: 0,
  autoChosen: 0,
  emptyUpTo: 0,
  removed: 0,
  removedChapter: 0,
  fizzled: 0,
  counteredByWard: 0,
  wardOnTrigger: 0,
  orderedTargeted: 0,
  askedDies: 0,
  askedChapter: 0,
  askedOptional: 0,
  askedTwoSlots: 0,
  casualAsked: 0,
  casualHarmful: 0,
  casualHelpful: 0,
  casualWrongSide: 0,
  byCard: new Map(),
});

const objectOf = (state: GameState, id: ObjectId) => state.objects[id] ?? state.lki[id]?.object;

const nameOf = (state: GameState, id: ObjectId): string => {
  const obj = objectOf(state, id);
  if (!obj) return '?';
  if (obj.card === null) return obj.token?.characteristics.name ?? '?';
  const card = state.cards[obj.card];
  return card === undefined ? '?' : (state.definitions[card.definition]?.name ?? '?');
};

const isTargetedTrigger = (state: GameState, id: ObjectId): boolean => {
  const ability = state.objects[id]?.stack?.ability;
  return ability?.kind === 'triggered' && (ability.targets?.length ?? 0) > 0;
};

/** Notes what one applied action did, for the paths this slice added. */
function note(tally: Tally, casual: ReadonlySet<number>, step: StepInfo): void {
  const { before, after, events, seat } = step;
  const d = before.pending;

  // The questions: a targets decision whose source is a triggered ability.
  if (d?.kind === 'targets' && d.forTrigger === true) {
    tally.asked += 1;
    const stack = before.objects[d.source]?.stack;
    const ability = stack?.ability;
    if (ability?.kind !== 'triggered')
      throw new Error('a trigger decision whose source is not one');
    const sourceName = nameOf(before, stack?.source ?? d.source);
    tally.byCard.set(sourceName, (tally.byCard.get(sourceName) ?? 0) + 1);
    // CR 603.3d: putting the ability on the stack is not optional, so cancel is never offered.
    const kinds = legalActionsForDecision(d).map((a) => a.kind);
    if (
      !kinds.includes('cancel') &&
      getLegalActions(before, seat).every((a) => a.kind !== 'cancel')
    ) {
      tally.askedNoCancel += 1;
    }
    if (ability.trigger.kind === 'dies') tally.askedDies += 1;
    if (ability.trigger.kind === 'chapter') tally.askedChapter += 1;
    if (ability.optional === true) tally.askedOptional += 1;
    if (d.specs.length === 2) tally.askedTwoSlots += 1;
    if (casual.has(seat) && step.action.kind === 'chooseTargets') {
      tally.casualAsked += 1;
      const chosen = step.action.targets;
      const side = (t: (typeof chosen)[number]): 'mine' | 'theirs' | 'unknown' => {
        if (t.kind === 'player') return t.seat === seat ? 'mine' : 'theirs';
        const o = before.objects[t.id];
        return o === undefined ? 'unknown' : o.controller === seat ? 'mine' : 'theirs';
      };
      const legalSides = new Set(d.specs.flatMap((s) => s.legal.map(side)));
      const chosenSides = chosen.map(side);
      if (HARMFUL.includes(sourceName)) {
        tally.casualHarmful += 1;
        if (legalSides.has('theirs') && chosenSides.some((s) => s !== 'theirs')) {
          tally.casualWrongSide += 1;
        }
      }
      if (HELPFUL.includes(sourceName)) {
        tally.casualHelpful += 1;
        if (legalSides.has('mine') && chosenSides.some((s) => s !== 'mine')) {
          tally.casualWrongSide += 1;
        }
      }
    }
  }

  // Several targeted triggers of one seat ordered (CR 603.3b).
  if (d?.kind === 'orderTriggers') {
    const waiting = before.pendingTriggers.filter(
      (t) => t.controller === seat && (t.ability.targets?.length ?? 0) > 0,
    );
    if (waiting.length >= 2) tally.orderedTargeted += 1;
  }

  for (const e of events as readonly GameEvent[]) {
    if (e.kind === 'abilityTriggered' && isTargetedTrigger(after, e.stackObject)) {
      const obj = after.objects[e.stackObject];
      const asking = after.pending?.kind === 'targets' && after.pending.source === e.stackObject;
      if (!asking) {
        if ((obj?.stack?.chosenTargets.length ?? 0) > 0) tally.autoChosen += 1;
        else tally.emptyUpTo += 1;
      }
    }
    // Ward triggered by the target of a trigger (the ward ability's subject is that trigger).
    if (e.kind === 'abilityTriggered') {
      const obj = after.objects[e.stackObject];
      const ability = obj?.stack?.ability;
      const subject = obj?.stack?.triggerSubject;
      if (
        ability?.kind === 'triggered' &&
        ability.trigger.kind === 'becomesTarget' &&
        subject !== undefined &&
        isTargetedTrigger(after, subject)
      ) {
        tally.wardOnTrigger += 1;
      }
    }
    if (e.kind === 'abilityRemoved') {
      tally.removed += 1;
      if (e.chapter !== undefined) tally.removedChapter += 1;
    }
    if (e.kind === 'fizzled' && e.reason === undefined && isTargetedTrigger(before, e.object)) {
      tally.fizzled += 1;
    }
    if (e.kind === 'countered' && isTargetedTrigger(before, e.object)) tally.counteredByWard += 1;
  }
}

test(
  `${GAMES} targeted-trigger games run clean, replay exactly and use every new path`,
  async () => {
    const total = newTally();
    const turns: number[] = [];
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = TRIGGER_TARGET_STYLE_PAIRS[g % TRIGGER_TARGET_STYLE_PAIRS.length] ?? [
        'triggerTargets',
        'triggerTargets',
      ];
      const config = smallGameConfig(g, styles);
      // Seats of CasualAgent by game: seat 0, seat 1, both, neither (random against random).
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? new CasualAgent({ seed: 10500 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 10500 + 2 * g + seat });
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
      expect(run.state.triggering, tag).toBeNull();
      // The log replays to the same game (the hash covers the stack data and the waiting context).
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
      cards: TRIGGER_TARGET_CARD_NAMES.length,
    };
    console.log(`100 targeted-trigger games: ${JSON.stringify(summary)}`);

    expectPath(total.asked);
    expect(total.askedNoCancel).toBe(total.asked);
    expectPath(total.autoChosen);
    expectPath(total.removed);
    expectPath(total.removedChapter);
    expectPath(total.fizzled);
    expectPath(total.wardOnTrigger);
    expectPath(total.orderedTargeted);
    expectPath(total.askedDies);
    expectPath(total.askedChapter);
    expectPath(total.askedOptional);
    expectPath(total.askedTwoSlots);
    expectPath(total.casualAsked);
    expectPath(total.casualHarmful);
    expectPath(total.casualHelpful);
    expect(total.casualWrongSide).toBe(0);
  },
  soakTimeout(240_000),
);
