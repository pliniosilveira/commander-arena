/**
 * CasualAgent and activated abilities (slice S3). The agent uses two kinds, both only when the
 * engine lists the `activate` option (so the cost is payable and the timing is right):
 *
 * - Cycling a land: while its hand holds `CYCLE_FROM_LANDS` or more lands, a land with Cycling in
 *   hand is cycled. The agent plays a land every turn first, so the rest is surplus.
 * - Typecycling (D-110, "Basic landcycling {1}", "Islandcycling {2}"): a card in hand with it is cycled
 *   when the hand holds no land and the agent controls fewer than `TYPECYCLE_UNTIL` lands: this step is
 *   reached only when no spell was worth casting, so the mana is spare, and a land is what it lacks.
 * - A pump ("{1}: this gets +1/+1 until end of turn") only when it changes combat, in the
 *   declare blockers step, after blocks are known and before damage:
 *   - an attacker blocked by one creature: the pump makes it kill the blocker it would not kill,
 *     or survive the blocker that would kill it;
 *   - a blocker blocking one attacker: the same two tests against that attacker;
 *   - an unblocked attacker at the opponent: the extra power makes the attack lethal.
 *   The test is a plain damage comparison (power against toughness minus damage), one blocker at a
 *   time; keywords such as first strike and deathtouch, tricks in the opponent's hand and several
 *   blockers are ignored, so the agent skips those fights.
 *
 * - "{1}{B}: Regenerate this creature." (D-120) when the creature would die and has no shield yet: an
 *   opponent's spell or ability on the stack names it and destroys it or deals lethal damage, or the combat it
 *   is in is lost in the declare blockers step (casual-regenerate.ts).
 *
 * - An Equipment attached to nothing is equipped (casual-attachments.ts), in a main phase, once per
 *   turn per Equipment. The engine lists the option only when a creature can be equipped and the
 *   cost is payable, and the agent considers it after casting spells, so it spends spare mana.
 *
 * Loop guard: an ability is activated at most once per object per priority window, a window being
 * a (turn, step). The engine hands priority back after each resolution, so without this a pump
 * with a mana cost would be paid for again and again. The set that remembers lives in the agent.
 *
 * - A Food or a Clue (an ability that sacrifices its own permanent for life or a card) is used when
 *   life is below 15 or the hand has fewer than 3 cards, on spare mana (casual-tokens.ts).
 *
 * - A Vehicle is crewed in the precombat main phase when spare creatures, ones the agent would not
 *   attack with, can pay the crew cost and the Vehicle would be a safe attack with more power than
 *   they have (casual-vehicles.ts); never to block.
 *
 * - "{4}, {T}: Target creature can't be blocked this turn" (casual-evasion.ts) in the precombat main
 *   phase when a creature of ours could attack and the opponent has something that could block it.
 *
 * - A loyalty ability of a planeswalker of ours (D-203, CR 606), once a turn, by a small rule (casual-loyalty.ts).
 *
 * Everything else is left unused: sacrifice outlets, life costs, pingers and pumps that target have
 * no benefit this agent can judge (the stronger agent will); the agent never concedes.
 */
import type {
  Action,
  ActivatedAbility,
  GameView,
  ObjectView,
  PriorityDecision,
  PriorityOption,
} from '@commander-arena/engine';
import { wantsUnearth } from './casual-alt-costs';
import { isEquipAbility } from './casual-attachments';
import { isUnblockableAbility, wantsUnblockable } from './casual-evasion';
import { wantsPlayExiled } from './casual-free';
import { chooseLoyaltyActivation } from './casual-loyalty';
import { modeScore } from './casual-modes';
import { landIsOnTop } from './casual-play-rules';
import { returnsItself, wantsCastPermission, wantsGraveyardReturn } from './casual-recursion';
import { isRegenerateAbility, wantsRegenerate } from './casual-regenerate';
import { wantsTokenAbility } from './casual-tokens';
import { chooseCrewActivation } from './casual-vehicles';
import { findObject, isLand, opponentLife, ownHand, powerOf, toughnessOf } from './casual-view';

/** Lands in hand from which a land with Cycling is cycled. */
export const CYCLE_FROM_LANDS = 4;

/** The agent stops typecycling for lands once it controls this many (more lands add little). */
export const TYPECYCLE_UNTIL = 8;

/** A mode must be worth at least this much for the agent to activate a modal ability for it (casual-modes.ts). */
const WORTH_ACTIVATING = 3;

/** What a pump ability adds to the creature it belongs to. */
interface Pump {
  readonly power: number;
  readonly toughness: number;
}

type ActivateOption = Extract<PriorityOption, { kind: 'activate' }>;

/** The pump an ability is, or null: "this gets +N/+M until end of turn" for mana and {T} only. */
export function pumpOf(ability: ActivatedAbility): Pump | null {
  const e = ability.effect;
  if (e.kind !== 'modifyPt' || e.objects.kind !== 'this' || e.duration !== 'untilEndOfTurn') {
    return null;
  }
  if ((ability.targets?.length ?? 0) > 0) return null;
  // A sacrifice, a discard or counters are real costs the agent cannot weigh.
  if (!ability.cost.every((c) => c.kind === 'mana' || c.kind === 'tap')) return null;
  // A pump that counts or reads X (D-115) is not one the agent can weigh: its size is not on the card.
  if (typeof e.power !== 'number' || typeof e.toughness !== 'number') return null;
  return { power: e.power, toughness: e.toughness };
}

const remaining = (o: ObjectView): number => toughnessOf(o) - o.damage;

/** Whether `pump` changes who dies in a fight between `me` and `foe` (plain damage, CR 120.3). */
function flipsFight(me: ObjectView, foe: ObjectView, pump: Pump): boolean {
  const kills = powerOf(me) >= remaining(foe);
  const killsAfter = powerOf(me) + pump.power >= remaining(foe);
  const dies = powerOf(foe) >= remaining(me);
  const diesAfter = powerOf(foe) >= remaining(me) + pump.toughness;
  return (!kills && killsAfter) || (dies && !diesAfter);
}

/** Whether pumping `me` now changes the combat it is in (see the file comment). */
export function pumpChangesCombat(view: GameView, me: ObjectView, pump: Pump): boolean {
  const combat = view.combat;
  if (combat === null || view.step !== 'declareBlockers') return false;
  const byId = (id: string): ObjectView | undefined => view.battlefield.find((o) => o.id === id);
  const attacking = combat.attackers.find((a) => a.object === me.id);
  if (attacking !== undefined) {
    if (attacking.blocked) {
      const [only, ...more] = attacking.blockedBy;
      const foe = only === undefined || more.length > 0 ? undefined : byId(only);
      return foe !== undefined && flipsFight(me, foe, pump);
    }
    if (attacking.target.kind !== 'player') return false;
    const unblocked = combat.attackers
      .filter((a) => !a.blocked && a.target.kind === 'player')
      .reduce((sum, a) => sum + powerOf(byId(a.object) ?? me), 0);
    const life = opponentLife(view);
    return life > unblocked && life <= unblocked + pump.power;
  }
  const blocked = combat.attackers.find((a) => a.blockedBy.includes(me.id));
  if (blocked === undefined || blocked.blockedBy.length !== 1) return false;
  const foe = byId(blocked.object);
  return foe !== undefined && flipsFight(me, foe, pump);
}

/**
 * "{cost}: Regenerate this creature." for a creature of ours that would otherwise die (casual-regenerate.ts), or
 * null. It is the first thing the agent considers with priority, before a land or a spell: a creature
 * about to die is saved with the mana that is there, not with what a spell leaves.
 */
export function chooseRegenerateActivation(
  view: GameView,
  d: PriorityDecision,
  used: Set<string>,
): Extract<Action, { kind: 'activate' }> | null {
  const options = d.options.filter((o): o is ActivateOption => o.kind === 'activate');
  for (const o of options) {
    if (used.has(windowKey(view, o))) continue;
    const obj = findObject(view, o.object);
    const ability = obj?.activated?.find((a) => a.abilityIndex === o.abilityIndex)?.ability;
    if (
      obj !== undefined &&
      obj.controller === view.viewer &&
      obj.zone === 'battlefield' &&
      ability !== undefined &&
      isRegenerateAbility(ability) &&
      wantsRegenerate(view, obj)
    ) {
      used.add(windowKey(view, o));
      return { kind: 'activate', object: o.object, abilityIndex: o.abilityIndex };
    }
  }
  return null;
}

/**
 * The activation to make now, or null. `used` remembers the abilities already activated in this
 * priority window (see the file comment); the chosen one is added to it.
 */
export function chooseActivation(
  view: GameView,
  d: PriorityDecision,
  used: Set<string>,
): Extract<Action, { kind: 'activate' }> | null {
  const options = d.options.filter((o): o is ActivateOption => o.kind === 'activate');
  const fresh = options.filter((o) => !used.has(windowKey(view, o)));
  const act = (o: ActivateOption) => {
    used.add(windowKey(view, o));
    return { kind: 'activate' as const, object: o.object, abilityIndex: o.abilityIndex };
  };

  // Cycling a surplus land.
  // A planeswalker of ours (D-203, CR 606): once a turn, by the small rule of casual-loyalty.ts.
  const loyalty = chooseLoyaltyActivation(view, d);
  if (loyalty !== null) return loyalty;

  const hand = ownHand(view);
  if (hand.filter(isLand).length >= CYCLE_FROM_LANDS) {
    const cycling = fresh.find((o) => {
      const obj = hand.find((h) => h.id === o.object);
      return obj !== undefined && isLand(obj) && obj.keywords.includes('cycling');
    });
    if (cycling !== undefined) return act(cycling);
  }

  // Typecycling for a land when the hand has none: the card is surplus, the mana is spare (CR 702.29e). Not
  // when it knows its next draw is a land (CR 401.5, D-125).
  if (
    hand.filter(isLand).length === 0 &&
    !landIsOnTop(view) &&
    view.battlefield.filter((o) => o.controller === view.viewer && isLand(o)).length <
      TYPECYCLE_UNTIL
  ) {
    const typecycling = fresh.find((o) => {
      const obj = hand.find((h) => h.id === o.object);
      return obj?.keywords.includes('typecycling') === true;
    });
    if (typecycling !== undefined) return act(typecycling);
  }

  // A modal ability (D-114) with a mode worth choosing, paid for in mana and {T} only.
  const modal = fresh.find((o) => {
    const ability = findObject(view, o.object)?.activated?.find(
      (a) => a.abilityIndex === o.abilityIndex,
    )?.ability;
    return (
      ability?.modes !== undefined &&
      ability.cost.every((c) => c.kind === 'mana' || c.kind === 'tap') &&
      ability.modes.some((m) => modeScore(view, m.text) >= WORTH_ACTIVATING)
    );
  });
  if (modal !== undefined) return act(modal);

  // Unearth (CR 702.84a, D-124) and Encore (CR 702.141a, D-185): a creature card of ours in the graveyard that would attack safely this turn. Both
  // are a one-turn attacker that goes away at the end step (an Encore token is made for each opponent and must attack), so they are used alike.
  const unearth = fresh.find((o) => {
    const obj = findObject(view, o.object);
    return (
      obj !== undefined &&
      obj.zone === 'graveyard' &&
      (obj.keywords.includes('unearth') || obj.keywords.includes('encore')) &&
      wantsUnearth(view, obj)
    );
  });
  if (unearth !== undefined) return act(unearth);

  // D-135: a card of ours in the graveyard that returns itself, and a permission to cast a creature card from it
  // (casual-recursion.ts).
  const recursion = fresh.find((o) => {
    const obj = findObject(view, o.object);
    const ability = obj?.activated?.find((a) => a.abilityIndex === o.abilityIndex)?.ability;
    if (obj === undefined || ability === undefined) return false;
    if (returnsItself(ability)) return obj.owner === view.viewer && wantsGraveyardReturn(view, obj);
    return (
      obj.controller === view.viewer &&
      obj.zone === 'battlefield' &&
      wantsCastPermission(view, ability)
    );
  });
  if (recursion !== undefined) return act(recursion);

  // Hideaway (CR 702.75a, D-145): "You may play the exiled card" when a card of ours waits in exile (casual-free.ts).
  const hideaway = fresh.find((o) => {
    const obj = findObject(view, o.object);
    const ability = obj?.activated?.find((a) => a.abilityIndex === o.abilityIndex)?.ability;
    return obj !== undefined && ability !== undefined && wantsPlayExiled(view, obj, ability);
  });
  if (hideaway !== undefined) return act(hideaway);

  // An unattached Equipment of ours, equipped once a turn in a main phase.
  const equip = fresh.find((o) => {
    const obj = findObject(view, o.object);
    const ability = obj?.activated?.find((a) => a.abilityIndex === o.abilityIndex)?.ability;
    return (
      obj !== undefined &&
      obj.controller === view.viewer &&
      obj.zone === 'battlefield' &&
      obj.attachedTo === undefined &&
      ability !== undefined &&
      isEquipAbility(ability) &&
      (view.phase === 'precombatMain' || view.phase === 'postcombatMain') &&
      !used.has(equipKey(view, o))
    );
  });
  if (equip !== undefined) {
    used.add(equipKey(view, equip));
    return act(equip);
  }

  // A Vehicle of ours that spare creatures can crew so that it attacks (casual-vehicles.ts).
  const crew = chooseCrewActivation(view, fresh);
  if (crew !== undefined) return act(crew);

  // "{cost}: Regenerate this creature." when it would otherwise die (casual-regenerate.ts).
  const regenerate = chooseRegenerateActivation(view, d, used);
  if (regenerate !== null) return regenerate;

  // A pump that changes the combat this creature is in.
  const pump = fresh.find((o) => {
    const obj = findObject(view, o.object);
    const ability = obj?.activated?.find((a) => a.abilityIndex === o.abilityIndex)?.ability;
    const effect = ability === undefined ? null : pumpOf(ability);
    return (
      obj !== undefined &&
      obj.controller === view.viewer &&
      effect !== null &&
      pumpChangesCombat(view, obj, effect)
    );
  });
  if (pump !== undefined) return act(pump);

  // "{cost}: Target creature can't be blocked this turn", before attacking with something the
  // opponent could block (casual-evasion.ts), once per turn.
  const evasion = fresh.find((o) => {
    const obj = findObject(view, o.object);
    const ability = obj?.activated?.find((a) => a.abilityIndex === o.abilityIndex)?.ability;
    return (
      obj !== undefined &&
      obj.controller === view.viewer &&
      obj.zone === 'battlefield' &&
      ability !== undefined &&
      isUnblockableAbility(ability) &&
      wantsUnblockable(view)
    );
  });
  if (evasion !== undefined) return act(evasion);

  // Food and Clue shapes: eat when life is low, crack with an empty-ish hand, on spare mana only
  // (casual-tokens.ts).
  const token = fresh.find((o) => {
    const obj = findObject(view, o.object);
    const ability = obj?.activated?.find((a) => a.abilityIndex === o.abilityIndex)?.ability;
    return obj !== undefined && ability !== undefined && wantsTokenAbility(view, obj, ability);
  });
  return token === undefined ? null : act(token);
}

/** An Equipment is equipped at most once per turn, whatever the step. */
const equipKey = (view: GameView, o: ActivateOption): string => `equip:${view.turn}:${o.object}`;

const windowKey = (view: GameView, o: ActivateOption): string =>
  `${view.turn}:${view.step}:${o.object}:${o.abilityIndex}`;
