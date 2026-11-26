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
import { activatedAbilityOf, chooseTriggerTargets, triggeredAbilityOf } from './casual-triggers';
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
  if (t.kind === 'player') {
    if (t.seat === view.viewer) return 0;
    // Issue 481: with several opponents the one with the least life ranks first (a lethal spell
    // included). The bonus stays below 1, so a player still ranks between a creature and a permanent,
    // and with one opponent the answer is unchanged.
    const life = view.seats.find((s) => s.id === t.seat)?.life ?? 0;
    return 3 + 0.9 / (1 + Math.max(life, 0));
  }
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

/**
 * "Target player shuffles up to three target cards from their graveyard into their library" (`ownedBy`, CR 115.1): the cards of that slot are cards of the graveyard of the
 * player chosen for the slot it names. An answer that breaks the rule is refused by the engine, so the agent keeps only the cards of the chosen player's graveyard.
 */
function withOwnedTargets(d: TargetsDecision, action: Action): Action {
  if (action.kind !== 'chooseTargets' || !d.specs.some((s) => s.ownedBy !== undefined)) {
    return action;
  }
  const targets = action.targets.filter((t) => {
    const spec = d.specs.find((s) => s.specId === t.specId);
    if (spec?.ownedBy === undefined) return true;
    const owner = action.targets.find((o) => o.specId === spec.ownedBy);
    const legal = spec.legal.find(
      (l) => l.kind === t.kind && l.kind === 'object' && l.id === (t as typeof l).id,
    );
    return owner?.kind === 'player' && legal?.kind === 'object' && legal.group === owner.seat;
  });
  return { ...action, targets };
}

/** Fills every slot with the best-scored legal targets: opponent first, any legal one otherwise. */
export function chooseTargets(view: GameView, d: TargetsDecision): Action {
  const action = withOwnedTargets(d, withOtherTargets(d, chooseTargetsOf(view, d)));
  return cancelWhenTooFewOthers(d, action);
}

/**
 * "Another target" slots (`differentFrom`, CR 115.3) with a minimum of 1 and fewer different legal targets than slots: no answer is legal, so the agent cancels the cast
 * instead of sending one the engine refuses. A triggered ability, a copy or a change of targets has no cancel and is left as it is.
 */
function cancelWhenTooFewOthers(d: TargetsDecision, action: Action): Action {
  if (action.kind !== 'chooseTargets' || d.forTrigger === true) return action;
  if (d.forCopy === true || d.forChange === true) return action;
  const short = d.specs.some(
    (s) =>
      s.differentFrom !== undefined &&
      action.targets.filter((t) => t.specId === s.specId).length < s.min,
  );
  return short ? { kind: 'cancel' } : action;
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
  // An activated ability (a loyalty ability, "{T}: untap target land") is read from its own text: a counter or a keyword gain helps, so it goes on the agent's own side.
  const activated = activatedAbilityOf(view, d);
  if (activated !== undefined) {
    return { kind: 'chooseTargets', targets: chooseTriggerTargets(view, d, activated) };
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
    // The player whose graveyard another slot takes cards from (`ownedBy`) is the agent: it shuffles its own cards back.
    const own = spec.legal.find((t) => t.kind === 'player' && t.seat === view.viewer);
    if (own !== undefined && d.specs.some((s) => s.ownedBy === spec.specId)) {
      targets.push(own);
      continue;
    }
    // CR 115.3: a slot that must differ from earlier ones takes none of their targets (the engine refuses a repeat), so the next best target fills it.
    const taken = [spec.differentFrom, ...(spec.differentFromAll ?? [])];
    // CR 115.1, 109.4 (`sameControllerAs`): the slot takes only targets of the controller of the target already chosen for the slot it names; that slot takes only a target whose
    // controller has another legal target for the slot that depends on it (the engine refuses any other answer).
    const groupOf = (t: ChosenTarget): number | undefined =>
      t.kind === 'object' ? t.group : undefined;
    const dependent = d.specs.find((s) => s.sameControllerAs === spec.specId);
    const mateSpec = d.specs.find((s) => s.specId === spec.sameControllerAs);
    const mate = targets.find((o) => o.specId === spec.sameControllerAs);
    const mateGroup =
      mate?.kind === 'object'
        ? groupOf(mateSpec?.legal.find((l) => l.kind === 'object' && l.id === mate.id) ?? mate)
        : undefined;
    const candidates =
      spec.sameControllerAs !== undefined
        ? spec.legal.filter((l) => mateGroup !== undefined && groupOf(l) === mateGroup)
        : dependent === undefined
          ? spec.legal
          : spec.legal.filter((l) =>
              dependent.legal.some(
                (o) =>
                  groupOf(o) === groupOf(l) &&
                  groupOf(o) !== undefined &&
                  !(o.kind === 'object' && l.kind === 'object' && o.id === l.id),
              ),
            );
    const legal =
      spec.differentFrom === undefined
        ? candidates
        : candidates.filter(
            (l) =>
              !targets.some(
                (o) =>
                  o.specId !== undefined &&
                  taken.includes(o.specId) &&
                  o.kind === l.kind &&
                  (o.kind === 'object'
                    ? o.id === (l as typeof o).id
                    : o.seat === (l as typeof o).seat),
              ),
          );
    // Stable sort: equal scores keep the engine's order, so "first legal" is the fallback.
    const ranked = legal
      .map((t, index) => ({ t, index, score: targetScore(view, t) }))
      .sort((a, b) => b.score - a.score || a.index - b.index);
    const hostile = ranked.filter((r) => r.score > 0).length;
    const count = Math.min(spec.max, legal.length, Math.max(spec.min, hostile));
    if (spec.onePerGroup === true) {
      // D-149, Hylda group 3: "for each opponent" and "with different controllers": at most one target of each controller, the best-scored one first.
      const seen = new Set<number>();
      let taken = 0;
      for (const r of ranked) {
        if (taken >= count) break;
        const group = r.t.kind === 'object' ? r.t.group : undefined;
        if (group !== undefined && seen.has(group)) continue;
        if (group !== undefined) seen.add(group);
        targets.push(r.t);
        taken += 1;
      }
      continue;
    }
    for (const r of ranked.slice(0, count)) targets.push(r.t);
  }
  return { kind: 'chooseTargets', targets };
}
