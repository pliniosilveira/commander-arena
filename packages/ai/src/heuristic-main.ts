/**
 * Priority decisions of the HeuristicAgent (M7c, PRIOR_ART 7.2 heuristics 5, 6 and 8, D-163): today's
 * choice. With a sample the agent's main phase goes through the turn planner (`heuristic-plan.ts`), for which
 * this choice is the first step of TODAY'S LINE, the line every other line must beat; the sets below live in
 * `heuristic-sets.ts`, shared with the planner's lines.
 *
 * MAIN PHASE (its own turn, a main phase, empty stack):
 *  1. A land (`heuristic-lands.ts`): the one that lets the best spell be cast, or that adds a colour; it is
 *     held until after combat when nothing needs it first.
 *  2. The SET of spells that uses the most mana (ties: the most value), chosen among the plays that are
 *     worth making at sorcery timing: permanents and sorceries, and removal instants with a target worth
 *     it (`bestRemovalTarget`). The set must be payable by the estimate of `heuristic-mana.ts`; one play of
 *     it is cast now (the others at the next priority decision, which makes the plan again). Order: cost
 *     reducers and land-drop grants first; removal before creatures when its target is worth at least as
 *     much as the best creature of the set; Storm last. The commander is a play like any other (valued
 *     as a creature plus `main.commanderBonus`) with one rule for the commander tax (CR 903.8): with a tax of
 *     `main.highTax` or more (two casts or more) it is cast only when the best set without it uses less than
 *     `main.spareShare` of the mana and the agent is not clearly losing (`evaluate` at least `main.losing`). Each play of the set is then cast on the
 *     sample (`heuristic-delta.ts`) and dropped when the board it leaves scores clearly worse than
 *     passing, so a board wipe that costs the agent more than the opponent is held.
 *  3. Everything else that an instant-speed card could do waits for a window (below); the mana it needs
 *     stays untapped because the set above does not count it.
 *  4. What is left is the casual rules without the plays above (flashback, escape, special actions,
 *     activations such as a regeneration or a pump ability), then pass.
 *
 * WINDOWS (any other priority decision) for instant-speed plays (the end-step set is vetted on the sample like a main-phase set):
 *  - after blockers are declared (declare-blockers step, empty stack): each instant-speed candidate is
 *    cast on the sample and the combat is played out; it is cast when it beats passing by `main.trickMargin`
 *    (reason `trick`, or `removal-attacker` for a removal spell). A pump that changes nothing is held;
 *  - the opponent's end step (empty stack): the set of instant-speed plays that uses the most mana
 *    (card draw, flash creatures, removal with a target), reason `end-step`;
 *  - in response to an opponent's spell (their object on top of the stack): a counterspell for a spell of
 *    mana value `main.counterMinValue` or more, reason `counter`; with a sample it is held (pass, reason `hold`)
 *    when playing the turn on without it scores better by `main.counterLookMargin` (`heuristic-response-look.ts`).
 *
 * The numbers named `main.*` are fields of `AgentWeights` (`weights.ts`), read from `Think.weights`.
 */
import type { Action, GameView, ObjectId, PriorityDecision } from '@commander-arena/engine';
import { flashesForCommander, isAura } from './casual-attachments';
import { turnUpCandidates } from './casual-face-down';
import { isHelpfulSpell } from './casual-helpful';
import { isPreventionSpell, preventionKey } from './casual-prevention';
import {
  choosePriorityAction,
  isGraveyardBlitz,
  type Play,
  spellPlays,
  spendOf,
  withFace,
} from './casual-priority';
import { manaValueOf } from './casual-view';
import type { Think } from './heuristic-budget';
import type { LookRecord } from './heuristic-combat-look';
import { type Answer, scoreCast, vetPlays } from './heuristic-delta';
import { planLand } from './heuristic-lands';
import { ownUnits } from './heuristic-mana';
import type { SimAgents } from './heuristic-plan-sim';
import { protectionPlay, protectionReserve } from './heuristic-protect';
import { lookAtCounter } from './heuristic-response-look';
import {
  bestSet,
  castAction,
  isCounter,
  isInstantSpeed,
  mainPlays,
  order,
  withCommanderRule,
} from './heuristic-sets';
import { bestRemovalTarget, isRemovalSpell } from './heuristic-targets';
import type { Reason } from './reasons';

export interface PriorityChoice {
  readonly action: Action;
  readonly reason: Reason;
  /** The mana symbols the payment of this cast keeps open for a protection spell (`heuristic-protect.ts`). */
  readonly reserve?: readonly string[];
  /** What the look-ahead of the choice did (`heuristic-response-look.ts`), when it ran. */
  readonly look?: LookRecord;
}

/** The casual rules for what is left: the options without the lands and the hand casts. */
function casualRemainder(
  view: GameView,
  d: PriorityDecision,
  think: Think,
  activations: Set<string>,
  /** Mana is held open for a protection spell: the companion's {3} (CR 702.139a) must not take it. */
  holdsMana = false,
): Action {
  const options = d.options.filter(
    (o) =>
      o.kind !== 'playLand' &&
      !(holdsMana && o.kind === 'bringCompanion') &&
      !(
        o.kind === 'castSpell' &&
        o.alternative !== 'flashback' &&
        o.alternative !== 'escape' &&
        o.alternative !== 'retrace' &&
        o.alternative !== 'jumpStart' &&
        o.alternative !== 'harmonize' &&
        // CR 702.152a: a card blitzed from the graveyard is the casual rules' to cast (`casual-priority.ts`); the hand casts are the heuristic's own.
        !isGraveyardBlitz(view, o)
      ),
  );
  return choosePriorityAction(view, { ...d, options }, think.draw, activations);
}

function mainPhase(
  view: GameView,
  d: PriorityDecision,
  think: Think,
  activations: Set<string>,
  answer: Answer,
): PriorityChoice {
  const weights = think.weights;
  const land = planLand(view, d, weights);
  if (land !== null && !land.hold) {
    return {
      action: { kind: 'playLand', object: land.play.obj.id, ...withFace(land.play.face) },
      reason: land.reason,
    };
  }
  const units = ownUnits(view);
  const castable = spellPlays(view, d, activations);
  const plays = withCommanderRule(view, mainPlays(view, castable, weights), units, weights);
  let set = bestSet(view, plays, units, weights);
  // Mana for a protection spell stays open when that costs no mana the set would spend (the hold is kept only then).
  let hold: readonly string[] | null = null;
  const reserve = protectionReserve(view, castable, weights);
  if (reserve !== null) {
    const held = bestSet(view, plays, units, weights, reserve);
    const spent = (xs: readonly Play[]): number => xs.reduce((sum, p) => sum + spendOf(p), 0);
    if (held.length > 0 && spent(held) >= spent(set)) {
      set = held;
      hold = reserve;
    }
  }
  if (set.length === 0) {
    // The estimate may not know a source of mana; the engine lists only plays it can pay, so the dearest goes.
    const dearest = [...plays].sort(
      (a, b) => spendOf(b) - spendOf(a) || (a.obj.id < b.obj.id ? -1 : 1),
    )[0];
    set = dearest === undefined ? [] : [dearest];
  }
  // Each play is cast on the sample first: one that leaves the board clearly worse than passing (a wipe
  // that costs the agent more than the opponent) is dropped, the next one of the set is tried.
  const first = vetPlays(view, order(view, set, weights), think, answer, castAction)[0];
  if (first !== undefined) {
    if (isPreventionSpell(first.obj)) activations.add(preventionKey(view));
    const reason: Reason = first.obj.isCommander
      ? 'commander'
      : isRemovalSpell(first.obj)
        ? 'removal'
        : 'curve';
    return { action: castAction(first), reason, ...(hold === null ? {} : { reserve: hold }) };
  }
  const rest = casualRemainder(view, d, think, activations, reserve !== null);
  if (rest.kind === 'pass') {
    return { action: rest, reason: land?.hold === true ? 'hold' : 'no-play' };
  }
  return { action: rest, reason: rest.kind === 'bringCompanion' ? 'companion' : 'delegated' };
}

/**
 * After blockers (D-313, CR 701.40b, 116.2b): a face-down creature of ours that is in the combat and would be better face up is turned up when playing the combat out
 * with it turned up scores better than without, by the same margin a trick must beat. The agent reads its own card through `ifFaceUp` (the view of an opponent's has
 * nothing of it); the sample it plays on is determinized for it, so the cards that are not its own are drawn again.
 */
function faceUpWindow(
  view: GameView,
  d: PriorityDecision,
  think: Think,
  answer: Answer,
): PriorityChoice | null {
  if (view.step !== 'declareBlockers' || view.combat === null || view.stack.length > 0) {
    return null;
  }
  const inCombat = new Set<ObjectId>(
    view.combat.attackers.flatMap((a) => [a.object, ...a.blockedBy]),
  );
  const candidates = turnUpCandidates(view, d)
    .filter((c) => c.gain > 0 && inCombat.has(c.object.id))
    .slice(0, 2);
  if (candidates.length === 0) return null;
  const me = view.viewer;
  const sample = think.sample();
  if (sample === undefined || sample.pending?.kind !== 'priority') return null;
  const search = think.budget.search();
  const base = scoreCast(sample, me, null, answer, think);
  if (base === null) return null;
  let best: { object: ObjectId; score: number } | undefined;
  for (const [i, c] of candidates.entries()) {
    if (search.expired(i + 1) !== null) break;
    const score = scoreCast(sample, me, { kind: 'turnFaceUp', object: c.object.id }, answer, think);
    if (
      score !== null &&
      score > base + think.weights.main.trickMargin &&
      (best === undefined || score > best.score)
    ) {
      best = { object: c.object.id, score };
    }
  }
  return best === undefined
    ? null
    : { action: { kind: 'turnFaceUp', object: best.object }, reason: 'face-up' };
}

/** The window plays: after blocks, the opponent's end step, in response to a spell. */
function windowPlay(
  view: GameView,
  d: PriorityDecision,
  think: Think,
  activations: Set<string>,
  answer: Answer,
  agents: SimAgents | undefined,
): PriorityChoice | null {
  const me = view.viewer;
  const weights = think.weights;
  const plays = spellPlays(view, d, activations);
  if (plays.length === 0) return null;
  const top = view.stack[view.stack.length - 1];
  // D-408: an Aura that has flash only if it targets a commander is held up for the opponent's spell or ability that would destroy or damage the agent's
  // commander (`spellPlays` lists it only then, `commanderAuraWorthCasting`): indestructible saves it.
  if (top !== undefined && top.controller !== me) {
    const ward = plays.find((p) => isAura(p.obj) && flashesForCommander(p.obj));
    if (ward !== undefined) return { action: castAction(ward), reason: 'protect-commander' };
  }
  // In response to an opponent's spell or ability that names a permanent of the agent's: a protection spell.
  const shield = protectionPlay(view, plays, think, answer, castAction);
  if (shield !== null) return { action: castAction(shield), reason: 'protect-threatened' };
  // In response to an opponent's spell: a counterspell for a spell worth it.
  if (top !== undefined && top.controller !== me && !top.abilitySource) {
    const counter = plays
      .filter((p) => isCounter(p.obj))
      .sort((a, b) => spendOf(a) - spendOf(b))[0];
    if (counter !== undefined && manaValueOf(top) >= weights.main.counterMinValue) {
      // With a sample: the counterspell is held when playing the turn on without it scores better (a bigger spell may follow).
      const action = castAction(counter);
      const looked = lookAtCounter(view, action, think, agents, answer);
      const look =
        looked === null ? {} : { look: { playOuts: looked.playOuts, changed: looked.index === 1 } };
      return looked?.index === 1
        ? { action: { kind: 'pass' }, reason: 'hold', ...look }
        : { action, reason: 'counter', ...look };
    }
    return null;
  }
  if (view.stack.length > 0) return null;
  // After blockers: a trick (or removal) that changes the combat for the better.
  if (view.step === 'declareBlockers' && view.combat !== null) {
    const candidates = plays
      .filter(
        (p) =>
          isInstantSpeed(p.obj) &&
          !isCounter(p.obj) &&
          (isHelpfulSpell(p.obj) ||
            (isRemovalSpell(p.obj) && bestRemovalTarget(view, p.obj, weights) !== null)),
      )
      .sort((a, b) => spendOf(b) - spendOf(a) || (a.obj.id < b.obj.id ? -1 : 1))
      .slice(0, 3);
    if (candidates.length === 0) return null;
    const sample = think.sample();
    if (sample === undefined || sample.pending?.kind !== 'priority') return null;
    const search = think.budget.search();
    const base = scoreCast(sample, me, null, answer, think);
    if (base === null) return null;
    let best: { play: Play; score: number } | undefined;
    for (const [i, play] of candidates.entries()) {
      if (search.expired(i + 1) !== null) break;
      const score = scoreCast(sample, me, castAction(play), answer, think);
      if (
        score !== null &&
        score > base + weights.main.trickMargin &&
        (best === undefined || score > best.score)
      ) {
        best = { play, score };
      }
    }
    if (best === undefined) return null;
    return {
      action: castAction(best.play),
      reason: isRemovalSpell(best.play.obj) ? 'removal-attacker' : 'trick',
    };
  }
  // The opponent's end step: draw, flash creatures and removal with the mana left.
  if (view.step === 'end' && view.activeSeat !== me) {
    const fit = plays.filter((p) => !isCounter(p.obj) && !isHelpfulSpell(p.obj));
    const ok = fit.filter(
      (p) => !isRemovalSpell(p.obj) || bestRemovalTarget(view, p.obj, weights) !== null,
    );
    const set = bestSet(view, ok, ownUnits(view), weights);
    // Each play is cast on the sample first, as in the main phase: one that leaves the board clearly worse is dropped.
    const first = vetPlays(view, order(view, set, weights), think, answer, castAction)[0];
    if (first !== undefined) return { action: castAction(first), reason: 'end-step' };
  }
  return null;
}

/** The priority decision: see the module comment. */
export function choosePriorityHeuristic(
  view: GameView,
  d: PriorityDecision,
  think: Think,
  activations: Set<string>,
  answer: Answer,
  /** The inner agents of the look-ahead; without them (a play-out, a test) nothing is looked ahead. */
  agents?: SimAgents,
): PriorityChoice {
  const me = view.viewer;
  const mainWindow =
    view.activeSeat === me &&
    (view.step === 'precombatMain' || view.step === 'postcombatMain') &&
    view.stack.length === 0;
  if (mainWindow) return mainPhase(view, d, think, activations, answer);
  const faceUp = faceUpWindow(view, d, think, answer);
  if (faceUp !== null) return faceUp;
  const play = windowPlay(view, d, think, activations, answer, agents);
  if (play !== null) return play;
  const rest = casualRemainder(view, d, think, activations);
  return { action: rest, reason: rest.kind === 'pass' ? 'no-play' : 'delegated' };
}
