/**
 * CasualAgent choices outside combat and priority: mulligans, which cards to put back or discard,
 * and targets.
 */
import type {
  Action,
  ChosenTarget,
  DiscardDecision,
  GameView,
  MulliganBottomDecision,
  MulliganDecision,
  ObjectId,
  TargetsDecision,
} from '@commander-arena/engine';
import { attachmentContext, chooseAuraHost, chooseEquipTarget } from './casual-attachments';
import { isBiteSpell, strongestOwnCreature } from './casual-bite';
import { chooseSpellToCopy } from './casual-copies';
import { chooseCreatureToHelp, helpfulSpellBeingCast } from './casual-helpful';
import { hasMadness } from './casual-later';
import { chooseTriggerTargets, triggeredAbilityOf } from './casual-triggers';
import { findObject, isCreature, isLand, manaValueOf, powerOf } from './casual-view';

/** A hand with 2 to 5 lands is kept (CR 103.5); anything else is mulliganed while that is allowed. */
export const KEEP_MIN_LANDS = 2;
export const KEEP_MAX_LANDS = 5;
/** Above this many lands in hand, surplus lands are the first cards to put back or discard. */
export const LAND_TARGET = 4;

export function chooseMulligan(view: GameView, d: MulliganDecision, minKeepSize: number): Action {
  const lands = d.hand.filter((id) => {
    const o = findObject(view, id);
    return o !== undefined && isLand(o);
  }).length;
  const keepable = lands >= KEEP_MIN_LANDS && lands <= KEEP_MAX_LANDS;
  // Taking one more mulligan keeps one card fewer (CR 103.5, London mulligan).
  const keptAfterMulligan = d.hand.length - d.bottomCount - 1;
  if (!keepable && d.canMulligan && keptAfterMulligan >= minKeepSize) {
    return { kind: 'takeMulligan' };
  }
  return { kind: 'keepHand' };
}

/**
 * The `count` cards to put on the bottom or discard: surplus lands first while holding more than
 * `LAND_TARGET` lands, otherwise the highest mana value card. Listed in hand order like the
 * engine's own options.
 */
export function chooseCardsToLose(
  view: GameView,
  d: MulliganBottomDecision | DiscardDecision,
): Action {
  const cards = d.hand.map((id, index) => {
    const o = findObject(view, id);
    return {
      id,
      index,
      land: o !== undefined && isLand(o),
      mv: o === undefined ? 0 : manaValueOf(o),
      // D-128 (CR 702.35a): a card with madness is exiled when discarded and may be cast cheaply: losing it is a gain.
      madness: d.kind === 'discard' && o !== undefined && hasMadness(o),
    };
  });
  const chosen: typeof cards = [];
  let pool = cards;
  for (let i = 0; i < d.count; i += 1) {
    const landsLeft = pool.filter((c) => c.land).length;
    const nonlands = pool.filter((c) => !c.land);
    let pick: (typeof cards)[number] | undefined;
    const madness = nonlands.find((c) => c.madness);
    if (landsLeft <= LAND_TARGET && madness !== undefined) {
      pick = madness;
    } else if (landsLeft > LAND_TARGET || nonlands.length === 0) {
      pick = pool.find((c) => c.land);
    } else {
      pick = nonlands.reduce((a, b) => (b.mv > a.mv ? b : a));
    }
    if (pick === undefined) break;
    chosen.push(pick);
    const picked = pick;
    pool = pool.filter((c) => c !== picked);
  }
  const objects: ObjectId[] = chosen.sort((a, b) => a.index - b.index).map((c) => c.id);
  return { kind: 'chooseCards', objects };
}

/**
 * How much the agent likes a target. This favours the opponent's things, which suits the hostile
 * spells the fixtures contain (burn, removal, bounce, discard, counterspells). It is a placeholder
 * for the real heuristic AI, which will weigh targets by what the spell does.
 */
function targetScore(view: GameView, t: ChosenTarget): number {
  if (t.kind === 'player') return t.seat === view.viewer ? 0 : 3;
  const o = findObject(view, t.id);
  if (o === undefined || o.controller === view.viewer) return 0;
  return isCreature(o) ? 4 + powerOf(o) / 100 : 2;
}

/**
 * "Each of up to two other targets" (`differentFrom`, CR 115.3, D-151): a target the slot this one differs from has is taken out of it. An answer
 * that breaks the rule is refused by the engine, so the agent leaves the repeated target out (the slot is "up to" when it has a minimum of 0).
 */
function withOtherTargets(d: TargetsDecision, action: Action): Action {
  if (action.kind !== 'chooseTargets' || !d.specs.some((s) => s.differentFrom !== undefined)) {
    return action;
  }
  const same = (a: ChosenTarget, b: ChosenTarget): boolean =>
    a.kind === b.kind &&
    (a.kind === 'object' ? a.id === (b as typeof a).id : a.seat === (b as typeof a).seat);
  const targets = action.targets.filter((t) => {
    const from = d.specs.find((s) => s.specId === t.specId)?.differentFrom;
    return from === undefined || !action.targets.some((o) => o.specId === from && same(o, t));
  });
  return { ...action, targets };
}

/** Fills every slot with the best-scored legal targets: opponent first, any legal one otherwise. */
export function chooseTargets(view: GameView, d: TargetsDecision): Action {
  return withOtherTargets(d, chooseTargetsOf(view, d));
}

function chooseTargetsOf(view: GameView, d: TargetsDecision): Action {
  // A triggered ability being put on the stack (CR 603.3d): what its own text does decides.
  const trigger = triggeredAbilityOf(view, d);
  if (trigger !== undefined) {
    return { kind: 'chooseTargets', targets: chooseTriggerTargets(view, d, trigger) };
  }
  // A spell that copies a spell (D-129) aims at one of the agent's own.
  const copying = chooseSpellToCopy(view, d);
  if (copying !== null) return copying;
  // An Aura goes on a creature of the side it is meant for, an Equipment on the best creature: the
  // opponent-first scoring below would put every Aura on the opponent's best creature.
  const attachment = attachmentContext(view, d);
  if (attachment?.kind === 'aura') {
    return { kind: 'chooseTargets', targets: chooseAuraHost(view, d, attachment.aura) };
  }
  if (attachment?.kind === 'equip') {
    return { kind: 'chooseTargets', targets: chooseEquipTarget(view, d) };
  }
  // A pump or a keyword gain goes on the agent's own best creature, not the opponent's.
  if (helpfulSpellBeingCast(view, d) !== undefined) {
    return { kind: 'chooseTargets', targets: chooseCreatureToHelp(view, d) };
  }
  const targets: ChosenTarget[] = [];
  const bite = isBiteSpell(view, d);
  for (const spec of d.specs) {
    // D-131: the creature that deals the damage is the agent's strongest one.
    const dealer = bite ? strongestOwnCreature(view, spec.legal) : null;
    if (dealer !== null) {
      targets.push(dealer);
      continue;
    }
    // Stable sort: equal scores keep the engine's order, so "first legal" is the fallback.
    const ranked = spec.legal
      .map((t, index) => ({ t, index, score: targetScore(view, t) }))
      .sort((a, b) => b.score - a.score || a.index - b.index);
    const hostile = ranked.filter((r) => r.score > 0).length;
    const count = Math.min(spec.max, spec.legal.length, Math.max(spec.min, hostile));
    for (const r of ranked.slice(0, count)) targets.push(r.t);
  }
  return { kind: 'chooseTargets', targets };
}
