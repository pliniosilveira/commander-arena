/**
 * The "+N/+N" and the keywords a static ability that another permanent gives a permanent gives to a group (CR 604.1, 613.1f, 613.8): Dancer's Chakrams gives the equipped creature
 * `"Other commanders you control get +2/+2 and have lifelink,"`. The creature has that static ability as its own, so its controller is "you" and it is the permanent "other" leaves out.
 *
 * The same for the permanent the one with the ability is attached to (CR 301.5): "Treasures you control are Equipment ... and have 'Equipped creature gets +2/+0'".
 *
 * `derive` makes this a second pass: the first pass settles layer 6 for every permanent (`derive-statics.ts`, which gives the creature the static ability), and this pass reads the
 * abilities each permanent has then, so a creature that loses all abilities in layer 6 gives nothing. A granted static ability applies with the timestamp of the permanent that has
 * it (CR 613.7a). The group is named by what no layer after 4 and 5 changes (`validateCard`), the amount is a number and the ability has no condition, so no effect here depends
 * on another one (CR 613.8) and the order does not matter.
 */
import type { Ability, StaticEffect } from '../ast/types';
import type { GameObject, GameState } from '../state/types';
import type { StaticGrant } from './derive-layers';
import type { StaticBase } from './derive-statics';
import { printedAbilities } from './derive-statics';
import { subjectAffects, subjectContextOf } from './static-subject';

type GroupStatic = Extract<StaticEffect, { kind: 'modifyPt' | 'grantKeyword' }>;

/** A permanent that has a granted static ability of this kind, with what it gives. */
export interface GrantedStaticSource {
  readonly object: GameObject;
  readonly statics: readonly GroupStatic[];
}

/** What the granted static abilities give one permanent. */
export interface GrantedStaticEffects {
  readonly grants: readonly StaticGrant[];
  readonly power: number;
  readonly toughness: number;
  readonly affectedBy: readonly GameObject['id'][];
}

const NONE: GrantedStaticEffects = { grants: [], power: 0, toughness: 0, affectedBy: [] };

const sourcesOf = new WeakMap<GameState, readonly GrantedStaticSource[]>();
const making = new WeakSet<GameState>();

function isGroupStatic(a: Ability): a is Extract<Ability, { kind: 'static' }> & {
  static: GroupStatic;
} {
  return a.kind === 'static' && (a.static.kind === 'modifyPt' || a.static.kind === 'grantKeyword');
}

/**
 * The permanents that have a "+N/+N" or a keyword static ability they were given (not one printed on them), read from the abilities `abilitiesAfterLayer6` says each has: the first
 * pass of `derive`, which never reads this list (so no loop). Made once for a state. A permanent whose abilities are asked for while the list is being made (a condition of another static
 * ability reads `derive`) sees an empty list: the first pass is what it needs.
 */
export function grantedStaticSources(
  state: GameState,
  abilitiesAfterLayer6: (obj: GameObject) => readonly Ability[],
): readonly GrantedStaticSource[] {
  const known = sourcesOf.get(state);
  if (known !== undefined) return known;
  if (making.has(state)) return [];
  making.add(state);
  try {
    const out: GrantedStaticSource[] = [];
    for (const id of state.battlefield) {
      const object = state.objects[id];
      if (object === undefined) continue;
      const printed = printedAbilities(state, object);
      const given = abilitiesAfterLayer6(object).filter(
        (a) => isGroupStatic(a) && !printed.includes(a),
      );
      if (given.length > 0) {
        out.push({ object, statics: given.map((a) => (a as { static: GroupStatic }).static) });
      }
    }
    sourcesOf.set(state, out);
    return out;
  } finally {
    making.delete(state);
  }
}

/**
 * What the granted static abilities give `target`, whose characteristics after layers 4 and 5 are `base`: the keywords as grants of layer 6 (with the timestamp of the permanent that
 * has the ability) and the sums of "+N/+N" of layer 7c (CR 613.4c: additions commute). `layer6Only` leaves the sums out, as for the other static abilities.
 */
export function grantedStaticsOn(
  state: GameState,
  target: GameObject,
  base: StaticBase,
  sources: readonly GrantedStaticSource[],
): GrantedStaticEffects {
  if (target.zone !== 'battlefield' || sources.length === 0) return NONE;
  const grants: StaticGrant[] = [];
  const affectedBy: GameObject['id'][] = [];
  let power = 0;
  let toughness = 0;
  for (const { object, statics } of sources) {
    const context = subjectContextOf(state, object);
    for (const s of statics) {
      if (!subjectAffects(state, object, s.subject, target, base, context)) continue;
      if (object.id !== target.id && !affectedBy.includes(object.id)) affectedBy.push(object.id);
      if (s.kind === 'grantKeyword') {
        grants.push({
          ability: { kind: 'keyword', keyword: s.keyword },
          timestamp: object.timestamp,
        });
      } else if (base.layer6Only !== true) {
        power += typeof s.power === 'number' ? s.power : 0;
        toughness += typeof s.toughness === 'number' ? s.toughness : 0;
      }
    }
  }
  return { grants, power, toughness, affectedBy };
}
