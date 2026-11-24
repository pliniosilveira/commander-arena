/**
 * Effects whose controller chooses which counters (CR 122.1, 122.5, 608.2d): "Remove any number of counters from among permanents on the battlefield" (Eventide's Shadow), "Remove up to three
 * counters from target permanent" (Glissa Sunslayer) and "Move a counter from target permanent you control onto a second target permanent" (Nesting Grounds). The engine runs the removals as
 * `removeChosenCounters` and the move as `moveCounter` (`rules/counter-pick.ts`): the kind of counter and the permanent it comes off are asked as the effect resolves.
 */
import { choice, literal, map, pattern, satisfy, sequence } from '../../combinators';
import type { IrAmount, IrNoun } from '../../ir/types';
import { defineRule, family, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

const REMOVE_ID = 'effect.remove-chosen-counters';
const MOVE_ID = 'effect.move-counter';

/** One target permanent or creature: "target permanent", "target creature you control", never "up to one", a plural or "any target". */
const oneTarget = (noun: IrNoun): boolean =>
  noun.det === 'target' &&
  !noun.plural &&
  !noun.upTo &&
  noun.anyNumber !== true &&
  noun.filter.player === undefined &&
  noun.filter.anyTarget !== true;

/**
 * `effect.remove-chosen-counters`: "Remove any number of counters from among permanents on the battlefield" and "Remove up to three counters from target permanent" (CR 122.1, 608.2d):
 * the controller takes counters of any kind, one at a time, from the permanents the text names. "Any number" has no limit; "up to" is a number of two words or more written out as a
 * number. The permanents are every permanent on the battlefield, or one target. Not read: a kind of counter ("remove up to three +1/+1 counters"), "a counter", "all counters", "any number of
 * counters from target permanent", a target that is not one permanent, a trailing clause.
 */
export const EFFECT_REMOVE_CHOSEN_COUNTERS = defineRule<Clauses>({
  id: REMOVE_ID,
  family: 'effect',
  leading: ['remove'],
  cites: [
    'CR 122.1 (Counters)',
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    'remove any number of counters from among permanents on the battlefield',
    'remove up to three counters from target permanent',
    'remove up to two counters from target creature',
    'remove up to one counter from target permanent',
  ],
  rejects: [
    'remove any number of counters from target permanent',
    'remove up to three +1/+1 counters from target permanent',
    'remove up to three counters from target permanents',
    'remove up to three counters from up to one target permanent',
    'remove up to three counters from ~',
    'remove up to three counters',
    'remove three counters from target permanent',
    'remove a counter from target permanent',
    'remove all counters from target permanent',
    'remove any number of counters from among permanents you control',
    'remove any number of counters from among creatures on the battlefield and draw a card',
    'remove up to three counters from target permanent and draw a card',
    'remove up to X counters from target permanent',
  ],
  parse: (ctx, pos) => {
    const everyPermanent = map(
      spanned(literal('any number of counters from among permanents on the battlefield')),
      ({ span }): readonly [IrAmount | null, IrNoun] => [
        null,
        {
          kind: 'noun',
          det: 'each',
          filter: { raw: 'permanents on the battlefield' },
          upTo: false,
          plural: true,
          other: false,
          span,
          rule: REMOVE_ID,
        },
      ],
    );
    const fromTarget = map(
      sequence(
        literal('up to '),
        family<IrAmount>('amount', { only: ['amount.number'] }),
        pattern(/ counters? from /i),
        satisfy(family<IrNoun>('noun', { only: ['noun.target-permanent'] }), oneTarget),
      ),
      ([, upTo, , objects]): readonly [IrAmount | null, IrNoun] => [upTo, objects],
    );
    const r = sequence(literal('remove '), choice(everyPermanent, fromTarget))(ctx, pos);
    if (!r.ok) return r;
    const [, [upTo, objects]] = r.value;
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: [
        makeClause(
          REMOVE_ID,
          'removeChosenCounters',
          upTo === null ? { objects } : { objects, upTo },
          span,
        ),
      ],
      pos: r.pos,
    };
  },
});

/**
 * `effect.move-counter`: "Move a counter from target permanent you control onto a second target permanent" (CR 122.5, 115.3, 608.2d): one counter of a kind the controller chooses as the
 * effect resolves ("any number of counters" lets the controller stop). The two permanents are two targets; "a second target" and "another target" both read (CR 122.5: moving a counter from a permanent onto itself does nothing, so the
 * second need not differ). Not read: a kind of counter, "all counters" (`effect.move-all-counters`), "any number of +1/+1 counters" (a kind), plural or "up to" targets, "~", a trailing clause.
 */
export const EFFECT_MOVE_COUNTER = defineRule<Clauses>({
  id: MOVE_ID,
  family: 'effect',
  leading: ['move'],
  cites: [
    'CR 122.5 (Counters)',
    'CR 122.1 (Counters)',
    'CR 608.2d (Resolving Spells and Abilities)',
  ],
  examples: [
    'move a counter from target permanent you control onto a second target permanent',
    'move a counter from target creature onto a second target creature',
    'move a counter from target permanent onto another target permanent',
    'move a counter from target creature an opponent controls onto target creature you control',
    // Resourceful Defense (CR 122.5, 608.2d): the controller moves counters one at a time and stops when they like.
    'move any number of counters from target permanent you control onto a second target permanent you control',
  ],
  rejects: [
    'move a counter from target permanent onto target permanent',
    'move a counter from target creature you control onto target creature you control',
    'move a counter from target creature onto target creature you control',
    'move a +1/+1 counter from target creature onto a second target creature',
    'move a counter from ~ onto a second target permanent',
    'move any number of counters from target permanents onto a second target permanent',
    'move any number of +1/+1 counters from target permanent onto a second target permanent',
    'move a counter from target permanent you control onto ~',
    'move two counters from target permanent onto a second target permanent',
    'move all counters from target permanent onto a second target permanent',
    'move a counter from target permanents onto a second target permanent',
    'move a counter from target permanent onto a second target permanents',
    'move a counter from up to one target permanent onto a second target permanent',
    'move a counter from target permanent onto a second target permanent and draw a card',
    'move a counter from target permanent onto a third target permanent',
  ],
  parse: (ctx, pos) => {
    const first = satisfy(
      family<IrNoun>('noun', { only: ['noun.target-permanent'] }),
      (n) => oneTarget(n) && !n.other,
    );
    const secondFor = (from: IrNoun) =>
      choice(
        map(
          sequence(
            literal('a second '),
            satisfy(
              family<IrNoun>('noun', { only: ['noun.target-permanent'] }),
              (n) => oneTarget(n) && !n.other,
            ),
          ),
          ([, n]): IrNoun => n,
        ),
        // "another target permanent" is a different target (CR 115.3), not "other than the source".
        map(
          satisfy(
            family<IrNoun>('noun', { only: ['noun.target-permanent'] }),
            (n) => oneTarget(n) && n.other,
          ),
          (n): IrNoun => ({ ...n, other: false, otherTarget: true }),
        ),
        // "from target creature an opponent controls onto target creature you control" (Rikku): a plain second "target" that no one permanent can be both of, because the two name
        // different controllers (CR 115.3: each use of the word is its own target).
        satisfy(
          family<IrNoun>('noun', { only: ['noun.target-permanent'] }),
          (n) =>
            oneTarget(n) &&
            !n.other &&
            from.filter.controller !== undefined &&
            n.filter.controller !== undefined &&
            from.filter.controller !== n.filter.controller,
        ),
      );
    const head = sequence(
      choice(literal('move a counter from '), literal('move any number of counters from ')),
      first,
      literal(' onto '),
    )(ctx, pos);
    if (!head.ok) return head;
    const anyNumber = head.value[0].toLowerCase().startsWith('move any number');
    const tail = sequence(secondFor(head.value[1]), pattern(/(?=\.|$)/u))(ctx, head.pos);
    if (!tail.ok) return tail;
    const r = {
      ok: true as const,
      value: [head.value[0], head.value[1], head.value[2], tail.value[0]] as const,
      pos: tail.pos,
    };
    const [, from, , to] = r.value;
    return {
      ok: true,
      value: [
        makeClause(
          MOVE_ID,
          'moveCounter',
          anyNumber
            ? {
                from,
                to,
                anyNumber: {
                  kind: 'flag',
                  value: true,
                  span: { start: pos, end: r.pos },
                  rule: MOVE_ID,
                },
              }
            : { from, to },
          { start: pos, end: r.pos },
        ),
      ],
      pos: r.pos,
    };
  },
});

export const COUNTER_CHOICE_RULES = [EFFECT_REMOVE_CHOSEN_COUNTERS, EFFECT_MOVE_COUNTER];
