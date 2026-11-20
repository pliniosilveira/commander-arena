/**
 * Whom a static ability of a permanent affects (CR 611.3, 613): `affects` is the one test, used by `derive-statics.ts` (layers 6 and
 * 7, restrictions) and by `derive-group-types.ts` (layer 4, D-139). It imports no `derive`.
 */
import type { ObjectFilter, StaticSubject } from '../ast/types';
import type { GameObject, GameState } from '../state/types';
import { controllerOf } from './control';
import { copiableValues } from './copiable';
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

/** Whether a filter, or a member of its `anyOf`, says "modified". */
function readsModified(filter: ObjectFilter): boolean {
  return filter.modified === true || filter.anyOf?.some(readsModified) === true;
}

/**
 * CR 700.9 (issue 345, Invigorating Hot Spring: "Modified creatures you control have haste."): whether `target` is modified, for the subject of a static ability. `derive` matches
 * that subject before the layers are settled, so what `isModified` reads through `derive` is read from the copiable values instead (CR 707.2): an Equipment or an Aura by its
 * printed or copied subtypes. A layer 4 effect that makes an attached permanent an Equipment or an Aura is not seen here (a known limit).
 */
function modifiedBeforeLayers(state: GameState, target: GameObject): boolean {
  if (target.zone !== 'battlefield') return false;
  if (Object.values(target.counters).some((n) => n > 0)) return true;
  const owner = controllerOf(state, target);
  return state.battlefield.some((id) => {
    const attached = state.objects[id];
    if (attached === undefined || attached.attachedTo !== target.id) return false;
    const subtypes = copiableValues(state, attached).characteristics.subtypes;
    if (subtypes.includes('Equipment')) return true;
    return subtypes.includes('Aura') && controllerOf(state, attached) === owner;
  });
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
    // "~ and enchanted creature" (`andThis`): the permanent itself too, whether or not it is attached.
    if (subject.andThis === true && source.id === target.id) return true;
    if (source.attachedTo !== target.id) return false;
    // CR 303.4m, 301.5a: "enchanted creature" is what the permanent is attached to, and only while that is a creature: an
    // `Enchant permanent` Aura on a land grants nothing from such a static ability.
    return (
      (subject.types ?? []).every((t) => view.types.includes(t)) &&
      (subject.supertypes ?? []).every((t) => view.supertypes.includes(t))
    );
  }
  if (subject.kind === 'pair') {
    // CR 702.95b, 611.3a (D-286): the permanent itself and the creature it is paired with now, whatever the pair is at this moment: nothing while it is
    // unpaired, or while either is phased out (CR 702.26b), whether or not the ability also names the `paired` condition.
    const partner = partnerOf(state, source);
    return partner !== null && (source.id === target.id || partner.id === target.id);
  }
  const filter = filterOf(subject);
  const seen = readsModified(filter) ? { ...view, modified: modifiedBeforeLayers(state, target) } : view;
  return matchesFilterWith(state, target, () => seen, filter, {
    ...context,
    attackers: state.combat?.attackers.map((a) => a.object) ?? [],
  });
}
