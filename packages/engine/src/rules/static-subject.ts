/**
 * Whom a static ability of a permanent affects (CR 611.3, 613): `affects` is the one test, used by `derive-statics.ts` (layers 6 and
 * 7, restrictions) and by `derive-group-types.ts` (layer 4, D-139). It imports no `derive`.
 */
import type { ObjectFilter, StaticSubject } from '../ast/types';
import type { GameObject, GameState } from '../state/types';
import { controllerOf } from './control';
import { type FilterContext, type FilterSubject, matchesFilterWith } from './filter-match';
import { partnerOf } from './pairing';

/** What a filter of `source`'s static ability reads of the source: whose "you" it is, which permanent "other" leaves out, what it chose (D-100). */
export function subjectContextOf(state: GameState, source: GameObject): FilterContext {
  return {
    controller: controllerOf(state, source),
    source: source.id,
    // D-100: "creatures you control of the chosen type" reads what this permanent chose as it entered.
    ...(source.chosen === undefined ? {} : { sourceChosen: source.chosen }),
  };
}

const otherFilters = new WeakMap<object, ObjectFilter>();

/** The filter of a subject that says "other": the same filter with `other` set, made once for each subject (the AST is not changed). */
function filterOf(subject: Extract<StaticSubject, { kind: 'filter' }>): ObjectFilter {
  if (subject.other !== true) return subject.filter;
  let filter = otherFilters.get(subject);
  if (filter === undefined) {
    filter = { ...subject.filter, other: true };
    otherFilters.set(subject, filter);
  }
  return filter;
}

/**
 * Whether the static ability of `source` with `subject` affects `target`, whose characteristics after the layers that come before the
 * one being applied are `view` (CR 613.1d, 613.1e: a lord of Frogs affects a creature that "became a Frog").
 */
export function subjectAffects(
  state: GameState,
  source: GameObject,
  subject: StaticSubject,
  target: GameObject,
  view: FilterSubject,
  context: FilterContext = subjectContextOf(state, source),
): boolean {
  if (subject.kind === 'this') return source.id === target.id;
  if (subject.kind === 'attached') {
    if (source.attachedTo !== target.id) return false;
    // CR 303.4m, 301.5a: "enchanted creature" is what the permanent is attached to, and only while that is a creature: an
    // `Enchant permanent` Aura on a land grants nothing from such a static ability.
    return (
      (subject.types ?? []).every((t) => view.types.includes(t)) &&
      (subject.supertypes ?? []).every((t) => view.supertypes.includes(t))
    );
  }
  if (subject.kind === 'pair') {
    // CR 702.95b, 611.3a (D-984): the permanent itself and the creature it is paired with now, whatever the pair is at this moment: nothing while it is
    // unpaired, or while either is phased out (CR 702.26b), whether or not the ability also names the `paired` condition.
    const partner = partnerOf(state, source);
    return partner !== null && (source.id === target.id || partner.id === target.id);
  }
  return matchesFilterWith(state, target, () => view, filterOf(subject), context);
}
