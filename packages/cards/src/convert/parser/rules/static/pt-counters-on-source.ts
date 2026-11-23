/**
 * Static rule of Call for Unity (Food and Fellowship deck): "Creatures you control get +1/+1 for each unity counter on ~." (CR 122.1, 613.4c, 611.3a).
 */
import { choice, fail, optional, pattern, quiet, sequence } from '../../combinators';
import type { IrNoun, IrStatic } from '../../ir/types';
import { defineRule, family } from '../registry';
import { staticOf } from './angels-words';
import { areTypes } from './grants';

const SINGULAR_SUBJECTS = ['noun.self', 'noun.attached-permanent'];
const PLURAL_SUBJECTS = ['noun.plain-permanents', 'noun.other-permanents'];

/**
 * `static.pt-counters-on-source`: "Creatures you control get +1/+1 for each unity counter on ~." (CR 122.1: the counters of one kind a permanent has; CR 613.4c, 611.3a: the bonus is
 * worked out each time the characteristics are, so it follows the counters). The step is +1 or +0 for each of power and toughness (not both 0), the counters are those of the
 * permanent with the ability, and the kind is a word ("unity") or "+1/+1". Not read: another step, a minus, counters on another permanent ("on target creature", "on it"), a
 * duration, a keyword besides, a subject other than the permanent itself or a group of creatures or permanents.
 */
export const STATIC_PT_COUNTERS_ON_SOURCE = defineRule<IrStatic>({
  id: 'static.pt-counters-on-source',
  family: 'static',
  leading: [],
  cites: [
    'CR 122.1 (Counters)',
    'CR 613.4c (Interaction of Continuous Effects)',
    'CR 611.3a (Continuous Effects)',
    'CR 604.1 (Handling Static Abilities)',
  ],
  examples: [
    'Creatures you control get +1/+1 for each unity counter on ~.',
    'Other creatures you control get +1/+0 for each quest counter on ~.',
    '~ gets +0/+1 for each charge counter on ~.',
    // Reaper's Scythe: what an Equipment gives, worked out from its own counters (CR 301.5a, 613.4c), and a type added (CR 205.1b).
    'Equipped creature gets +1/+1 for each soul counter on ~ and is an Assassin in addition to its other types.',
    'Enchanted creature gets +1/+1 for each unity counter on ~.',
  ],
  rejects: [
    'Creatures you control get +1/+1 for each unity counter on ~',
    'Creatures you control get +2/+2 for each unity counter on ~.',
    'Creatures you control get +0/+0 for each unity counter on ~.',
    'Creatures you control get -1/-1 for each unity counter on ~.',
    'Creatures you control get +1/+1 for each unity counter on it.',
    'Creatures you control get +1/+1 for each unity counter on target creature.',
    'Creatures you control get +1/+1 for each unity counters on ~.',
    'Creatures you control get +1/+1 for each counter on ~.',
    'Creatures you control get +1/+1 for each unity counter on ~ until end of turn.',
    'Creatures you control get +1/+1 for each unity counter on ~ and have flying.',
    'Equipped creature gets +1/+1 for each soul counter on ~ and has flying.',
  ],
  parse: (ctx, pos) => {
    const verb = (only: readonly string[], gets: string) =>
      sequence(quiet(family<IrNoun>('noun', { only })), pattern(new RegExp(` ${gets} `, 'u')));
    const subject = choice(verb(SINGULAR_SUBJECTS, 'gets'), verb(PLURAL_SUBJECTS, 'get'))(ctx, pos);
    if (!subject.ok) return subject;
    const r = sequence(
      pattern(/\+([01])\/\+([01])(?![\p{L}\p{N}/])/u),
      pattern(/ for each ([+-]\d+\/[+-]\d+|[a-z]+) counter on ~(?![\p{L}\p{N}])/u),
      optional(sequence(pattern(/(?: and |, and |, )/iu), quiet(areTypes(false))), null),
      pattern(/\./u),
    )(ctx, subject.pos);
    if (!r.ok) return r;
    const [step, counted, tail] = r.value;
    const power = Number(step[1]);
    const toughness = Number(step[2]);
    const counter = counted[1] ?? '';
    if (
      (power === 0 && toughness === 0) ||
      /^(?:creatures?|cards?|permanents?|lands?)$/u.test(counter)
    ) {
      return fail(ctx, pos);
    }
    return {
      ok: true,
      value: staticOf(
        'static.pt-counters-on-source',
        subject.value[0],
        [
          { kind: 'ptCountersOnSource', power: power === 1, toughness: toughness === 1, counter },
          ...(tail ? tail[1] : []),
        ],
        pos,
        r.pos,
      ),
      pos: r.pos,
    };
  },
});

export const PT_COUNTERS_ON_SOURCE_STATIC_RULES = [STATIC_PT_COUNTERS_ON_SOURCE];
