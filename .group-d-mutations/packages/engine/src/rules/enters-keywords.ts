/**
 * Devour (CR 702.82a) and Riot (CR 702.136a), D-185: two static abilities that a permanent applies as it enters the battlefield
 * (CR 614.12), each with a choice its controller makes before the permanent is there. The zone-change pipeline (`rules/zones.ts`) and the
 * creation of a token (`rules/enter-token.ts`) both read them here, so they cannot disagree.
 *
 * - Devour N: "As this object enters, you may sacrifice any number of creatures. This permanent enters with N +1/+1 counters on it for
 *   each creature sacrificed this way." The controller chooses the creatures among those they control, none being a legal answer
 *   (`devourDecision`); the permanent is not on the battlefield yet, so it is never one of them.
 * - Riot: "You may have this permanent enter with an additional +1/+1 counter on it. If you don't, it gains haste." Each instance works
 *   separately (CR 702.136b), so the controller is asked once for each (`riotDecision`). An instance is a printed keyword or one that a
 *   permanent already on the battlefield gives (`grantKeyword`: "Nontoken creatures you control have riot"), which the entering permanent
 *   sees as it enters (CR 614.12: the game looks at the permanents already there for the abilities that will apply to it).
 */
import type { Ability } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import type { ChooseOptionDecision, ChoosePermanentDecision } from '../state/decisions';
import type { GameObject, GameState } from '../state/types';
import { controllerOf } from './control';
import { derive } from './derive';
import { mayHaveStatic } from './printed-statics';
import { matchesFilter } from './select';
import { staticConditionHolds } from './static-conditions';

/** The two answers to a riot question, in the order the decision lists them (CR 702.136a). */
export const RIOT_OPTIONS: readonly string[] = ['counter', 'haste'];

/** The counter devour and riot put on a permanent. */
export const PLUS_COUNTER = '+1/+1';

/** N of the devour ability these abilities have (CR 702.82a), 0 for none. A face has at most one (`validateCard`). */
export function devourOf(abilities: readonly Ability[]): number {
  for (const a of abilities)
    if (a.kind === 'keyword' && a.keyword.kind === 'devour') return a.keyword.count;
  return 0;
}

/**
 * How many instances of riot `entering` has as it enters (CR 702.136b): the printed ones in `abilities` and the ones the static abilities of the
 * permanents on the battlefield give it. `entering` is the permanent as it would be on the battlefield (`zone: 'battlefield'`, its controller).
 */
export function riotInstances(
  state: GameState,
  abilities: readonly Ability[],
  entering: GameObject,
): number {
  let count = abilities.filter((a) => a.kind === 'keyword' && a.keyword.kind === 'riot').length;
  for (const id of state.battlefield) {
    const permanent = state.objects[id];
    if (permanent === undefined || !mayHaveStatic(state, permanent, 'grantKeyword')) continue;
    for (const ability of derive(state, permanent).abilities) {
      if (
        ability.kind !== 'static' ||
        ability.static.kind !== 'grantKeyword' ||
        ability.static.keyword.kind !== 'riot' ||
        ability.static.subject.kind !== 'filter'
      ) {
        continue;
      }
      if (
        ability.condition !== undefined &&
        !staticConditionHolds(state, ability.condition, permanent)
      ) {
        continue;
      }
      const { filter, other } = ability.static.subject;
      const ctx = { controller: controllerOf(state, permanent), source: id };
      if (
        matchesFilter(
          state,
          entering,
          { ...filter, ...(other === true ? { other: true } : {}), zone: 'battlefield' },
          ctx,
        )
      ) {
        count += 1;
      }
    }
  }
  return count;
}

/** The creatures `seat` controls, which devour may sacrifice (CR 702.82a), in battlefield order. */
export function devourCandidates(state: GameState, seat: SeatId): ObjectId[] {
  return state.battlefield.filter((id) => {
    const obj = state.objects[id];
    return (
      obj !== undefined &&
      controllerOf(state, obj) === seat &&
      derive(state, obj).types.includes('creature')
    );
  });
}

/** The question of an instance of riot (CR 702.136a): `soFar` is what the earlier instances answered. */
export function riotDecision(
  seat: SeatId,
  source: ObjectId,
  sourceName: string,
  sourceOracleText: string,
  soFar: readonly string[],
): Omit<ChooseOptionDecision, 'id'> {
  return {
    kind: 'chooseOption',
    seat,
    purpose: 'riot',
    options: RIOT_OPTIONS,
    riotSoFar: soFar,
    source,
    sourceName,
    sourceOracleText,
  };
}

/** The question of devour (CR 702.82a): which of `legal` to sacrifice, none or all being legal. */
export function devourDecision(
  seat: SeatId,
  source: ObjectId,
  legal: readonly ObjectId[],
): Omit<ChoosePermanentDecision, 'id'> {
  return {
    kind: 'choosePermanent',
    seat,
    source,
    subject: source,
    purpose: 'devour',
    min: 0,
    max: legal.length,
    legal,
  };
}

/**
 * The counters the permanent enters with because of devour and riot (CR 702.82a, 702.136a), added to its other counters: N for each creature
 * sacrificed, and one for each instance of riot that chose the counter. `abilities` are the permanent's own (the devour number).
 */
export function keywordEntryCounters(
  abilities: readonly Ability[],
  riot: readonly string[],
  devoured: number,
): Record<string, number> {
  const count = devourOf(abilities) * devoured + riot.filter((r) => r === 'counter').length;
  return count > 0 ? { [PLUS_COUNTER]: count } : {};
}

/** Whether an instance of riot chose haste (CR 702.136a: "If you don't, it gains haste"). */
export function riotGivesHaste(riot: readonly string[]): boolean {
  return riot.some((r) => r === 'haste');
}
