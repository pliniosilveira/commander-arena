/**
 * Costs of the Counter Intelligence deck, group 2 (moving, removing, counting and choosing counters): "Remove a counter from ~", "Remove three counters from among other artifacts,
 * creatures, and planeswalkers you control", "Remove X counters from an artifact or creature you control" (CR 118.3, 122.1, 602.2b).
 */
import {
  choice,
  fail,
  literal,
  map,
  optional,
  type Parser,
  pattern,
  satisfy,
  sequence,
} from '../../combinators';
import type { IrCost, IrFilter, IrNoun } from '../../ir/types';
import {
  CONTROL_SUFFIX,
  NO_PARTS,
  permanentPhrase,
  toFilter,
  typeChoice,
  withoutZone,
} from '../noun/phrases';
import { defineRule } from '../registry';

const NUMBER_WORDS: ReadonlyMap<string, number> = new Map([
  ['one', 1],
  ['two', 2],
  ['three', 3],
  ['four', 4],
  ['five', 5],
  ['six', 6],
  ['seven', 7],
  ['eight', 8],
  ['nine', 9],
  ['ten', 10],
]);

const REMOVE_ID = 'cost.remove-any-counters';

/** The permanent types in the plural, as a list of them is written ("artifacts, creatures, and planeswalkers"). */
const PLURAL_TYPES = 'artifacts|battles|creatures|enchantments|lands|planeswalkers';

/**
 * "artifacts, creatures, and planeswalkers you control" (CR 205.2a, 110.1): a permanent that is any of the types. The permanent phrases read one noun; a list of plural nouns joined by
 * "and" is read here, with the player who controls them.
 */
const pluralTypeList: Parser<IrFilter> = (ctx, pos) => {
  const r = sequence(typeChoice(PLURAL_TYPES, false, 'and'), CONTROL_SUFFIX)(ctx, pos);
  if (!r.ok) return r;
  const [words, controller] = r.value;
  const types = words.map((word) => word.slice(0, -1));
  const base = toFilter('battlefield', { ...NO_PARTS, controller }, ctx.text.slice(pos, r.pos));
  return {
    ok: true,
    value: { ...base, anyOf: types.map((type): IrFilter => ({ types: [type], raw: type })) },
    pos: r.pos,
  };
};

/**
 * `cost.remove-any-counters`: "Remove a counter from ~", "Remove three counters from among other artifacts, creatures, and planeswalkers you control", "Remove X counters from an artifact or
 * creature you control" (CR 118.3: a cost can't be paid unless the whole of it can; CR 122.1: counters on permanents; CR 602.2b: X is announced as the ability is activated). Counters of any
 * kind, the player choosing which as the cost is paid: the permanent with the ability, a group of permanents the player controls ("from among ..."), or one permanent they control that
 * has all of them ("from a ..."). The engine's `removeCounters` with no kind. Not read: a kind of counter (`cost.remove-counters`, `cost.remove-counters-among`), "all", "any number", "up
 * to", "target", a permanent an opponent controls, the wrong number of the noun, a trailing clause.
 */
export const COST_REMOVE_ANY_COUNTERS = defineRule<IrCost>({
  id: REMOVE_ID,
  family: 'cost',
  leading: ['remove'],
  cites: ['CR 118.3 (Costs)', 'CR 122.1 (Counters)', 'CR 602.2b (Activating Activated Abilities)'],
  examples: [
    'Remove a counter from ~',
    'Remove two counters from ~',
    'Remove X counters from ~',
    'Remove a counter from among creatures you control',
    'Remove three counters from among other artifacts, creatures, and planeswalkers you control',
    'Remove X counters from an artifact or creature you control',
    'Remove two counters from a creature you control',
    'Remove two counters from among artifacts and creatures you control',
  ],
  rejects: [
    'Remove a +1/+1 counter from ~',
    'Remove all counters from ~',
    'Remove any number of counters from ~',
    'Remove a counter from target creature',
    'Remove a counter from a creature an opponent controls',
    'Remove a counter from among creatures your opponents control',
    'Remove a counters from ~',
    'Remove two counter from ~',
    'Remove zero counters from ~',
    'Remove X counter from ~',
    'Remove a counter from ~ and',
    'Remove a counter from ~.',
    'Remove a counter',
    'Remove a counter from among creature you control',
    'Remove a counter from creatures you control',
    'Remove X counters from a creatures you control',
    'Remove X counters from among creatures',
    'Remove two counters from among artifacts, creatures and planeswalkers you control',
    'Remove two counters from among artifacts or creatures you control',
  ],
  parse: (ctx, pos) => {
    const head = pattern(
      /remove (an?|x|\d+|one|two|three|four|five|six|seven|eight|nine|ten) (counters?)(?![\p{L}\p{N}]) from /iu,
    )(ctx, pos);
    if (!head.ok) return head;
    const word = (head.value[1] ?? '').toLowerCase();
    const x = word === 'x';
    const count = x || word === 'a' || word === 'an' ? 1 : (NUMBER_WORDS.get(word) ?? Number(word));
    // "a counter" is one counter and "two counters" is more: the noun's number follows the count (X is a number, so plural).
    const plural = (head.value[2] ?? '').toLowerCase() === 'counters';
    if (!Number.isSafeInteger(count) || count < 1 || plural !== (x || count !== 1)) {
      return fail(ctx, pos);
    }
    const self = map(literal('~'), () => null);
    const among = map(
      sequence(
        literal('among '),
        optional(literal('other '), null),
        satisfy(
          choice(pluralTypeList, permanentPhrase(true, 'all')),
          (filter) => filter.controller === 'you',
        ),
      ),
      ([, other, phrase]) => ({ phrase, other: other !== null, plural: true }),
    );
    const one = map(
      sequence(
        pattern(/an? /iu),
        satisfy(permanentPhrase(false, 'all'), (filter) => filter.controller === 'you'),
      ),
      ([, phrase]) => ({ phrase, other: false, plural: false }),
    );
    const from = choice(self, among, one)(ctx, head.pos);
    if (!from.ok) return from;
    const value = from.value;
    // "Remove a counter from among creatures you control" takes counters off several permanents; "from a creature you control" off one, which "from ~" is too.
    const what: IrNoun | null =
      value === null
        ? null
        : {
            kind: 'noun',
            det: 'a',
            filter: withoutZone(value.phrase),
            upTo: false,
            plural: value.plural,
            other: value.other,
            span: { start: head.pos, end: from.pos },
            rule: REMOVE_ID,
          };
    return {
      ok: true,
      value: {
        kind: 'removeAnyCounters',
        count,
        x,
        what,
        fromOne: value !== null && !value.plural,
        span: { start: pos, end: from.pos },
        rule: REMOVE_ID,
      },
      pos: from.pos,
    };
  },
});

export const COUNTER_INTELLIGENCE_G2_COST_RULES = [COST_REMOVE_ANY_COUNTERS];
