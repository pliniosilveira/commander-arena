/**
 * Replacement rule of the Counter Blitz deck, group G (Sin, Unending Cataclysm): "As ~ enters, remove all counters from any number of artifacts, creatures, and enchantments. ~ enters
 * with X +1/+1 counters on it, where X is twice the number of counters removed this way." (CR 614.12, 122.1, 122.6.)
 */
import { fail, pattern } from '../../combinators';
import type { IrAbility, IrClause, IrFilter, IrNoun } from '../../ir/types';
import { defineRule, quietly } from '../registry';
import { replacement } from './shared';

const ID = 'replacement.as-enters-remove-counters';

/** The plural card types a permanent may be of, as the text spells them, and the type each stands for. */
const PLURALS: Readonly<Record<string, string>> = {
  artifacts: 'artifact',
  creatures: 'creature',
  enchantments: 'enchantment',
  lands: 'land',
  planeswalkers: 'planeswalker',
};

/**
 * The card types of "artifacts, creatures, and enchantments" ("artifacts", "artifacts and creatures", "artifacts, creatures, and enchantments"): each at most once, in the
 * form a card writes a list. Null when the words are not such a list.
 */
function typeList(text: string): readonly string[] | null {
  const parts = text.split(/, and | and |, /);
  const separators = [...text.matchAll(/, and | and |, /g)].map((m) => m[0]);
  const last = separators[separators.length - 1];
  const shaped =
    separators.length === parts.length - 1 &&
    separators.slice(0, -1).every((sep) => sep === ', ') &&
    (parts.length === 1 || (parts.length === 2 ? last === ' and ' : last === ', and '));
  if (!shaped || !parts.every((part) => PLURALS[part] !== undefined)) return null;
  const types = parts.map((part) => PLURALS[part] ?? '');
  return new Set(types).size === types.length ? types : null;
}

/**
 * `replacement.as-enters-remove-counters`: "As ~ enters, remove all counters from any number of artifacts, creatures, and enchantments. ~ enters with X +1/+1 counters on it, where X is
 * twice the number of counters removed this way." (CR 614.12, 122.1, 122.6: the controller of the permanent chooses, before it enters, any number of the permanents of those types, of
 * every player, and every counter comes off each; it enters with a +1/+1 counter for each counter that came off, or two for each with "twice".) The engine's `asEntersRemoveCounters` and
 * an `entersWithCounters` of `countersRemovedAsEntered`. Not read: "all counters of a kind", a controller ("you control"), "up to", "target", another multiple than "twice" or "the number
 * of", another counter than +1/+1, one sentence without the other, a creature type.
 */
export const REPLACEMENT_AS_ENTERS_REMOVE_COUNTERS = defineRule<IrAbility>({
  id: ID,
  family: 'replacement',
  leading: ['as'],
  cites: [
    'CR 614.12 (Replacement Effects)',
    'CR 614.12a (Replacement Effects)',
    'CR 122.1 (Counters)',
    'CR 122.6 (Counters)',
  ],
  examples: [
    'As ~ enters, remove all counters from any number of artifacts, creatures, and enchantments. ~ enters with X +1/+1 counters on it, where X is twice the number of counters removed this way.',
    'As ~ enters the battlefield, remove all counters from any number of artifacts and creatures. ~ enters with X +1/+1 counters on it, where X is the number of counters removed this way.',
    'As ~ enters, remove all counters from any number of creatures. ~ enters with X +1/+1 counters on it, where X is twice the number of counters removed this way.',
  ],
  rejects: [
    'As ~ enters, remove all counters from any number of artifacts, creatures, and enchantments.',
    'As ~ enters, remove all counters from any number of artifacts, creatures, and enchantments. ~ enters with X +1/+1 counters on it, where X is twice the number of counters removed this way',
    'As ~ enters, remove all counters from any number of artifacts, creatures, and enchantments. ~ enters with X +1/+1 counters on it, where X is three times the number of counters removed this way.',
    'As ~ enters, remove all counters from any number of artifacts, creatures, and enchantments. ~ enters with X -1/-1 counters on it, where X is twice the number of counters removed this way.',
    'As ~ enters, remove all counters from any number of artifacts, creatures, and enchantments you control. ~ enters with X +1/+1 counters on it, where X is twice the number of counters removed this way.',
    'As ~ enters, remove all counters from up to three artifacts, creatures, and enchantments. ~ enters with X +1/+1 counters on it, where X is twice the number of counters removed this way.',
    'As ~ enters, remove all counters from any number of artifacts, creatures and enchantments. ~ enters with X +1/+1 counters on it, where X is twice the number of counters removed this way.',
    'As ~ enters, remove all counters from any number of creatures, creatures, and artifacts. ~ enters with X +1/+1 counters on it, where X is twice the number of counters removed this way.',
    'As ~ enters, remove all +1/+1 counters from any number of creatures. ~ enters with X +1/+1 counters on it, where X is twice the number of counters removed this way.',
    'As ~ enters, remove all counters from any number of elves. ~ enters with X +1/+1 counters on it, where X is twice the number of counters removed this way.',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /as ~ enters(?: the battlefield)?, remove all counters from any number of ([a-z]+(?:(?:, and | and |, )[a-z]+)*)\. ~ enters with X \+1\/\+1 counters on it, where X is (twice )?the number of counters removed this way\./iu,
    )(ctx, pos);
    if (!r.ok) return r;
    const types = typeList((r.value[1] ?? '').toLowerCase());
    if (types === null) return fail(ctx, pos);
    const twice = (r.value[2] ?? '').toLowerCase() === 'twice ';
    const span = { start: pos, end: r.pos };
    const members: IrFilter[] = types.map((type) => ({ types: [type], raw: type }));
    const what: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter: {
        ...(members.length === 1 ? { types: [...types] } : { anyOf: members }),
        raw: r.value[1] ?? '',
      },
      upTo: false,
      plural: true,
      other: false,
      span,
      rule: ID,
    };
    const event: IrClause = {
      kind: 'clause',
      verb: 'entersRemoveCounters',
      args: { what, times: { kind: 'number', value: twice ? 2 : 1, span } },
      optional: false,
      span,
      rule: ID,
    };
    return { ok: true, value: replacement(ID, span, event), pos: r.pos };
  },
});

export const COUNTER_BLITZ_G_REPLACEMENT_RULES = [REPLACEMENT_AS_ENTERS_REMOVE_COUNTERS].map(
  quietly,
);
