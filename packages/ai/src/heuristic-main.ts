/**
 * Priority decisions of the HeuristicAgent (M7c, PRIOR_ART 7.2 heuristics 5, 6 and 8, D-163).
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
 *    mana value `main.counterMinValue` or more, reason `counter`.
 *
 * The numbers named `main.*` are fields of `AgentWeights` (`weights.ts`), read from `Think.weights`.
 */
import type {
  Action,
  GameView,
  ObjectId,
  ObjectView,
  PriorityDecision,
} from '@commander-arena/engine';
import { flashesForCommander, isAura } from './casual-attachments';
import { hasStorm } from './casual-copies';
import { discountsHand } from './casual-costs';
import { turnUpCandidates } from './casual-face-down';
import { isHelpfulSpell } from './casual-helpful';
import { grantsLandDrops } from './casual-play-rules';
import { isPreventionSpell, preventionKey } from './casual-prevention';
import {
  choosePriorityAction,
  isGraveyardBlitz,
  type Play,
  spellPlays,
  spendOf,
  withFace,
  withType,
} from './casual-priority';
import { hasKeyword, manaValueOf, withoutReminder } from './casual-view';
import { creatureValue, evaluate } from './evaluate';
import type { Think } from './heuristic-budget';
import { type Answer, scoreCast, vetPlays } from './heuristic-delta';
import { planLand } from './heuristic-lands';
import { canPayAll, costSymbols, ownUnits } from './heuristic-mana';
import { protectionPlay, protectionReserve } from './heuristic-protect';
import { bestRemovalTarget, isRemovalSpell } from './heuristic-targets';
import type { Reason } from './reasons';
import type { AgentWeights } from './weights';

export interface PriorityChoice {
  readonly action: Action;
  readonly reason: Reason;
  /** The mana symbols the payment of this cast keeps open for a protection spell (`heuristic-protect.ts`). */
  readonly reserve?: readonly string[];
}

/** The most plays a set is chosen among (2^n subsets; a bound of the search, not a weight). */
const MAX_PLAYS = 9;

const TARGETS_SPELL = /target (activated or triggered ability|(\w+ )?spell)/i;

const isInstantSpeed = (o: ObjectView): boolean =>
  o.types.includes('instant') || hasKeyword(o, 'flash');
const isCounter = (o: ObjectView): boolean =>
  isInstantSpeed(o) && TARGETS_SPELL.test(withoutReminder(o.oracleText));

const castAction = (p: Play): Action => ({
  kind: 'castSpell',
  object: p.obj.id,
  ...(p.free === true ? { alternative: 'free' as const } : {}),
  ...(p.alt === undefined ? {} : { alternative: p.alt }),
  ...(p.lifeForMana === true ? { alternative: 'lifeForMana' as const } : {}),
  ...withFace(p.face),
  ...withType(p),
});

const sym = (p: Play): readonly string[] => (p.free === true ? [] : costSymbols(p.obj, spendOf(p)));

/** What a play is worth, for choosing between sets that spend the same mana. */
function worthOf(view: GameView, p: Play, weights: AgentWeights): number {
  const o = p.obj;
  const w = weights.main;
  if (o.types.includes('creature')) {
    return (
      creatureValue({ ...o, power: o.power ?? 0, toughness: o.toughness ?? 0 }, weights) +
      (o.isCommander ? w.commanderBonus : 0)
    );
  }
  if (isRemovalSpell(o)) return w.removalShare * (bestRemovalTarget(view, o, weights)?.value ?? 0);
  return w.spellBase + w.spellPerMana * manaValueOf(o);
}

/** The set of `plays` that uses the most mana and is payable with `units`, most valuable among equals. */
function bestSet(
  view: GameView,
  plays: readonly Play[],
  units: ReturnType<typeof ownUnits>,
  weights: AgentWeights,
  /** Mana symbols that must stay payable besides the set (a protection spell held open). */
  hold: readonly string[] | null = null,
): Play[] {
  const pool = [...plays]
    .sort(
      (a, b) =>
        worthOf(view, b, weights) - worthOf(view, a, weights) || (a.obj.id < b.obj.id ? -1 : 1),
    )
    .slice(0, MAX_PLAYS);
  let best: { set: Play[]; spend: number; value: number } = { set: [], spend: 0, value: 0 };
  for (let mask = 1; mask < 1 << pool.length; mask += 1) {
    const set = pool.filter((_, i) => (mask & (1 << i)) !== 0);
    const spend = set.reduce((sum, p) => sum + spendOf(p), 0);
    const value = set.reduce((sum, p) => sum + worthOf(view, p, weights), 0);
    if (spend < best.spend || (spend === best.spend && value <= best.value)) continue;
    if (canPayAll(hold === null ? set.map(sym) : [...set.map(sym), hold], units)) {
      best = { set, spend, value };
    }
  }
  return best.set;
}

/** The commander's tax: what it costs now beyond its printed cost (CR 903.8). */
const taxOf = (p: Play): number => (p.obj.isCommander ? spendOf(p) - manaValueOf(p.obj) : 0);

/** Drops a commander at a high tax unless the rule in the module comment lets it be cast. */
function withCommanderRule(
  view: GameView,
  plays: Play[],
  units: ReturnType<typeof ownUnits>,
  weights: AgentWeights,
): Play[] {
  const w = weights.main;
  const taxed = plays.filter((p) => taxOf(p) >= w.highTax);
  if (taxed.length === 0) return plays;
  const others = plays.filter((p) => !taxed.includes(p));
  const spare = bestSet(view, others, units, weights).reduce((sum, p) => sum + spendOf(p), 0);
  const losing = evaluate(view, view.viewer, weights).score < w.losing;
  return spare < w.spareShare * units.length && !losing ? plays : others;
}

/** Order the plays of the set: reducers, removal at a big target, the rest, removal at a small one, Storm. */
function order(view: GameView, set: readonly Play[], weights: AgentWeights): Play[] {
  const worth = (p: Play): number => worthOf(view, p, weights);
  const bestCreature = Math.max(
    0,
    ...set.filter((p) => p.obj.types.includes('creature')).map(worth),
  );
  const rank = (p: Play): number => {
    if (discountsHand(view, p.obj) || grantsLandDrops(view, p.obj)) return 0;
    if (hasStorm(p.obj)) return 4;
    if (isRemovalSpell(p.obj)) return worth(p) / weights.main.removalShare >= bestCreature ? 1 : 3;
    return 2;
  };
  return [...set].sort(
    (a, b) => rank(a) - rank(b) || worth(b) - worth(a) || (a.obj.id < b.obj.id ? -1 : 1),
  );
}

/** The plays that are made at sorcery timing: permanents, sorceries, and removal with a target worth it. */
function mainPlays(view: GameView, plays: readonly Play[], weights: AgentWeights): Play[] {
  return plays.filter((p) =>
    isInstantSpeed(p.obj)
      ? isRemovalSpell(p.obj) && bestRemovalTarget(view, p.obj, weights) !== null
      : true,
  );
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
  const base = scoreCast(sample, me, null, answer, think);
  if (base === null) return null;
  let best: { object: ObjectId; score: number } | undefined;
  for (const [i, c] of candidates.entries()) {
    if (think.budget.expired(i + 1)) break;
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
      return { action: castAction(counter), reason: 'counter' };
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
    const base = scoreCast(sample, me, null, answer, think);
    if (base === null) return null;
    let best: { play: Play; score: number } | undefined;
    for (const [i, play] of candidates.entries()) {
      if (think.budget.expired(i + 1)) break;
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
): PriorityChoice {
  const me = view.viewer;
  const mainWindow =
    view.activeSeat === me &&
    (view.step === 'precombatMain' || view.step === 'postcombatMain') &&
    view.stack.length === 0;
  if (mainWindow) return mainPhase(view, d, think, activations, answer);
  const faceUp = faceUpWindow(view, d, think, answer);
  if (faceUp !== null) return faceUp;
  const play = windowPlay(view, d, think, activations, answer);
  if (play !== null) return play;
  const rest = casualRemainder(view, d, think, activations);
  return { action: rest, reason: rest.kind === 'pass' ? 'no-play' : 'delegated' };
}
