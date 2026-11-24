/**
 * Damage prevention shields (CR 615), kept in `GameState.continuousEffects` as `preventDamage`
 * changes until end of turn (CR 514.2) and read in one place: `dealDamage`, which every damage event
 * goes through (combat damage, damage from a spell or ability, the rider of a mana ability).
 *
 * - CR 615.1: a shield "watches for a damage event that would happen". It exists before the damage
 *   (CR 615.4) and is checked as damage would be dealt, not when the shield is made, so what
 *   "creatures you control" covers is read at that moment (CR 611.2c).
 * - CR 615.6: damage that is prevented is never dealt. `damagePrevented` is reported instead, and
 *   what damage does (life loss, marked damage, lifelink, deathtouch, commander damage) does not.
 * - CR 615.7: a shield for a number is reduced by the damage it prevents and is gone at 0; one that
 *   prevents nothing (another scope, another source) is not used up.
 * - CR 615.11: "prevent the next N damage to each creature you control" makes one shield per
 *   permanent, when it resolves.
 * - CR 616.1: when several shields apply, the affected player or controller chooses the order. This
 *   file holds the building blocks (which shields exist, which apply to an event); the choosing, the
 *   default order (the shields that prevent all damage first, which cost nothing to use, then the
 *   numeric ones, oldest first) and the settling of one event are in `damage-order.ts` (D-191).
 */
import type { Effect, ObjectFilter, PreventScope } from '../ast/types';
import { TOKEN_PRESETS } from '../cards/tokens';
import type { ObjectId, SeatId } from '../ids';
import type { DamageRecipient } from '../state/combat-types';
import { allocateTimestamp, objectsInZone } from '../state/ops';
import type { ChosenTarget, ContinuousEffect, GameState } from '../state/types';
import { endOf } from './control-effects';
import { derive } from './derive';
import {
  isPlayerSelector,
  matchesFilter,
  resolveObjects,
  resolvePlayers,
  type SelectContext,
} from './select';
import { objectOrLki } from './source-info';
import { staticConditionHolds } from './static-conditions';
import { done, type StepOutcome } from './step-outcome';

type PreventNode = Extract<Effect, { kind: 'preventDamage' }>;
export type Shield = ContinuousEffect & {
  change: Extract<ContinuousEffect['change'], { kind: 'preventDamage' }>;
};

export const isShield = (e: ContinuousEffect): e is Shield => e.change.kind === 'preventDamage';

/**
 * "Prevent ... damage that would be dealt ... this turn" resolves (CR 615.7, 615.11): records the
 * shield or shields. Nothing is made when the recipient is gone (a target that is no longer legal,
 * CR 608.2b, or a `by` source that cannot be found), because a shield with no recipient left would
 * protect everything.
 */
export function runPreventDamage(
  state: GameState,
  node: PreventNode,
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
): StepOutcome {
  // CR 611.2b (D-207): "for as long as this Saga remains on the battlefield": over before it begins when the permanent is not there.
  const until =
    node.duration === 'forAsLongAsThisRemains' ? endOf(state, node.duration, ctx) : 'endOfTurn';
  if (until === null) return done(state);
  const add = (from: GameState, made: readonly NewShield[]): GameState =>
    addShields(from, made, until);
  let sources: readonly ObjectId[] | undefined;
  if (node.by !== undefined) {
    sources = resolveObjects(state, node.by, ctx, targets);
    if (sources.length === 0) return done(state);
  }
  const base = {
    scope: node.scope,
    amount: node.amount,
    ...(sources === undefined ? {} : { sources }),
    // CR 611.2c (D-145): "by non-Spider creatures" is read as the damage would be dealt, with the controller as "you".
    ...(node.byFilter === undefined
      ? {}
      : { sourceFilter: { filter: node.byFilter, controller: ctx.controller } }),
    // CR 615.5 (Inkshield): "For each 1 damage prevented this way, create a token": the controller of the effect makes it.
    ...(node.perPrevented === undefined
      ? {}
      : {
          perPrevented: {
            definition:
              node.perPrevented.token.kind === 'preset'
                ? TOKEN_PRESETS[node.perPrevented.token.preset]
                : node.perPrevented.token.definition,
            controller: ctx.controller,
          },
        }),
  } as const;
  const to = node.to;

  // One shield for everything that is damaged: Fog, or "dealt by" a source.
  if (to.kind === 'any') {
    return done(
      add(state, [
        { objects: [], change: { kind: 'preventDamage', ...base, recipients: { kind: 'any' } } },
      ]),
    );
  }
  // CR 611.2c: "all damage to creatures you control" is read as damage would be dealt.
  if (to.kind === 'each' && node.amount === 'all') {
    const recipients = { kind: 'each', filter: to.filter, controller: ctx.controller } as const;
    return done(
      add(state, [{ objects: [], change: { kind: 'preventDamage', ...base, recipients } }]),
    );
  }

  // `target` may be a player or a permanent (an "any target" slot): both are looked up, as dealDamage does.
  const kind: string = to.kind;
  const playerOnly = isPlayerSelector(to);
  const seats: SeatId[] =
    playerOnly || kind === 'target'
      ? resolvePlayers(state, to as Parameters<typeof resolvePlayers>[1], ctx, targets)
      : [];
  const objects = playerOnly
    ? []
    : resolveObjects(state, to as Parameters<typeof resolveObjects>[1], ctx, targets).filter(
        (id) => state.objects[id]?.zone === 'battlefield',
      );
  const change = { kind: 'preventDamage', ...base } as const;
  if (seats.length === 0 && objects.length === 0) return done(state);
  // "All" is one shield for the whole set; a number is one shield for each recipient (CR 615.11).
  if (node.amount === 'all') {
    return done(add(state, [{ objects, ...(seats.length > 0 ? { players: seats } : {}), change }]));
  }
  return done(
    add(state, [
      ...objects.map((id) => ({ objects: [id], change })),
      ...seats.map((seat) => ({ objects: [], players: [seat], change })),
    ]),
  );
}

interface NewShield {
  readonly objects: readonly ObjectId[];
  readonly players?: readonly SeatId[];
  readonly change: Shield['change'];
}

/** Adds the shields, each with its own timestamp (CR 613.7b) and until end of turn. */
function addShields(
  state: GameState,
  made: readonly NewShield[],
  until: ContinuousEffect['until'] = 'endOfTurn',
): GameState {
  let next = state;
  const created: ContinuousEffect[] = [];
  for (const s of made) {
    const [timestamp, stamped] = allocateTimestamp(next);
    next = stamped;
    created.push({
      id: `ce${timestamp}`,
      timestamp,
      objects: s.objects,
      ...(s.players === undefined ? {} : { players: s.players }),
      until,
      change: s.change,
    });
  }
  return { ...next, continuousEffects: [...next.continuousEffects, ...created] };
}

/** The `index` of the prevention effect that shield counters make (CR 122.1c): it is no ability of the permanent, so it has no place in its abilities. */
export const SHIELD_COUNTER_INDEX = -1;

/** A static `preventDamageToThis` of the permanent that would be dealt the damage (D-149): the permanent and the index of the ability in its derived abilities. */
export interface StaticPrevention {
  readonly object: ObjectId;
  readonly index: number;
  readonly scope: PreventScope;
  /** The counter this prevention removes from the permanent for each damage event it prevents (issue 159). */
  readonly removeCounter?: string;
}

/**
 * The static abilities of the permanent that would be dealt damage that prevent it (D-149): `preventDamageToThis`, read from the
 * abilities the permanent has now (so "loses all abilities" turns it off, CR 613.1f). Only a permanent on the battlefield is read.
 */
export function staticPreventions(
  state: GameState,
  to: DamageRecipient,
  combat: boolean,
): readonly StaticPrevention[] {
  if (to.kind !== 'object') return [];
  const obj = state.objects[to.id];
  if (obj === undefined || obj.zone !== 'battlefield') return [];
  const found: StaticPrevention[] = [];
  derive(state, obj).abilities.forEach((a, index) => {
    if (
      a.kind === 'static' &&
      a.static.kind === 'preventDamageToThis' &&
      a.static.subject.kind === 'this' &&
      (a.static.scope === 'all' || (a.static.scope === 'combat') === combat) &&
      (a.condition === undefined || staticConditionHolds(state, a.condition, obj))
    ) {
      found.push({
        object: obj.id,
        index,
        scope: a.static.scope,
        ...(a.static.removeCounter === undefined ? {} : { removeCounter: a.static.removeCounter }),
      });
    }
  });
  // CR 615.1, 303.4, 301.5 (Multiclass Baldric): "prevent all damage that would be dealt to equipped creature" is a prevention effect of the Equipment (or Aura) attached
  // to the permanent, read from the attaching permanent's abilities and its condition ("as long as you have a full party", for the Equipment's controller). The effect is
  // the attaching permanent's, not an ability of the creature, so the creature losing its abilities does not end it.
  for (const id of objectsInZone(state, 'battlefield')) {
    const attacher = state.objects[id];
    if (attacher === undefined || attacher.attachedTo !== obj.id) continue;
    derive(state, attacher).abilities.forEach((a, index) => {
      if (
        a.kind === 'static' &&
        a.static.kind === 'preventDamageToThis' &&
        a.static.subject.kind === 'attached' &&
        (a.static.scope === 'all' || (a.static.scope === 'combat') === combat) &&
        (a.condition === undefined || staticConditionHolds(state, a.condition, attacher))
      ) {
        found.push({ object: attacher.id, index, scope: a.static.scope });
      }
    });
  }
  // CR 122.1c (Shield counters): one or more shield counters make one prevention effect, "If damage would be dealt to this permanent, prevent that damage and
  // remove a shield counter from it". It is a prevention effect of the permanent, not an ability (so losing all abilities does not turn it off), and it is listed
  // last so the default order spends the counter only when nothing else prevents the damage.
  if ((obj.counters.shield ?? 0) >= 1) {
    found.push({
      object: obj.id,
      index: SHIELD_COUNTER_INDEX,
      scope: 'all',
      removeCounter: 'shield',
    });
  }
  return found;
}

/**
 * Whether the source of a damage event matches `filter` (a shield's `sourceFilter`, the `sources` of a `damageBonus`). CR 609.7a (D-145): the source as it is,
 * or as it last was when it has left (CR 113.7a). CR 609.7, 109.1 (Hylda group 3): a source is any object, a spell on the stack as well as a permanent
 * ("black and/or red sources"), so a filter that names no zone is read in the zone the source is in; the types the filter names still keep a spell that is not
 * of them out. `controller` is the player "you" stands for in the filter.
 */
export function damageSourceMatches(
  state: GameState,
  source: ObjectId,
  filter: ObjectFilter,
  controller: SeatId,
): boolean {
  const obj = objectOrLki(state, source);
  if (obj === null) return false;
  const read = filter.zone !== undefined ? filter : { ...filter, zone: obj.zone };
  return matchesFilter(state, obj, read, { controller, source: null });
}

/** Whether the shield applies to this damage event (scope, source and recipient). */
export function shieldApplies(
  state: GameState,
  shield: Shield,
  source: ObjectId,
  to: DamageRecipient,
  combat: boolean,
): boolean {
  const c = shield.change;
  if (c.scope !== 'all' && (c.scope === 'combat') !== combat) return false;
  if (c.sources !== undefined && !c.sources.includes(source)) return false;
  if (
    c.sourceFilter !== undefined &&
    !damageSourceMatches(state, source, c.sourceFilter.filter, c.sourceFilter.controller)
  ) {
    return false;
  }
  if (c.recipients?.kind === 'any') return true;
  if (c.recipients?.kind === 'each') {
    const obj = to.kind === 'object' ? state.objects[to.id] : undefined;
    return (
      obj !== undefined &&
      matchesFilter(state, obj, c.recipients.filter, {
        controller: c.recipients.controller,
        source: null,
      })
    );
  }
  return to.kind === 'object'
    ? shield.objects.includes(to.id)
    : (shield.players?.includes(to.seat) ?? false);
}
