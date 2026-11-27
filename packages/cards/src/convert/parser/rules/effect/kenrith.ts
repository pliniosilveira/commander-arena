/**
 * Effect rules of the planeswalker Will Kenrith (Draconic Dissent, issue 167): "Until your next turn, up to two target creatures each have base power and toughness 0/3 and lose all
 * abilities." and "Until your next turn, instant, sorcery, and planeswalker spells that player casts cost {2} less to cast."
 */
import { fail, literal, map, pattern, sequence } from '../../combinators';
import type { IrAmount, IrDuration, IrNoun, IrTypeList } from '../../ir/types';
import { defineRule, family, spanned } from '../registry';
import { BASE_PT } from './becomes';
import { type Clauses, makeClause } from './operands';

const BOUNDARY = '(?![\\p{L}\\p{N}])';

/** "until your next turn" (CR 500.1, 611.2a): the duration family reads only "until end of turn", the rules that need this one read it themselves. */
const UNTIL_YOUR_NEXT_TURN = (rule: string) =>
  map(
    spanned(pattern(/until your next turn(?![\p{L}\p{N}])/iu)),
    ({ span }): IrDuration => ({ kind: 'duration', scope: 'untilYourNextTurn', span, rule }),
  );
const NOT_CONTINUED = `${BOUNDARY}(?!\\s+(?:and|then)${BOUNDARY})`;

/**
 * `effect.lead-targets-have-base-pt-lose-abilities`: "Until your next turn, up to two target creatures each have base power and toughness 0/3 and lose all abilities" (CR 613.4b base
 * power and toughness, 613.1f losing abilities, 611.2a, 500.1; Will Kenrith): the duration first, then several targets of one slot (a number of creatures, "up to") that each get the
 * base power and toughness and lose all abilities, as the engine's `setPt` and `loseAllAbilities` for the same objects and the same duration. Not read: one target ("has", "loses",
 * which `effect.base-pt` and `effect.loses-abilities` read in their words), another group, "all abilities" left out, another duration than "until your next turn",
 * a pump ("+0/+3"), keywords, an instruction after it in the same sentence.
 */
export const EFFECT_LEAD_TARGETS_HAVE_BASE_PT_LOSE_ABILITIES = defineRule<Clauses>({
  id: 'effect.lead-targets-have-base-pt-lose-abilities',
  family: 'effect',
  leading: ['until'],
  cites: [
    'CR 613.4b (Interaction of Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 611.2a (Continuous Effects)',
    'CR 500.1 (Beginning Phase)',
  ],
  examples: [
    'Until your next turn, up to two target creatures each have base power and toughness 0/3 and lose all abilities',
    'until your next turn, up to two target creatures each have base power and toughness 0/3 and lose all abilities',
    'Until your next turn, two target creatures each have base power and toughness 0/3 and lose all abilities',
  ],
  rejects: [
    'Until end of turn, up to two target creatures each have base power and toughness 1/1 and lose all abilities',
    'Until your next turn, up to two target creatures each have base power and toughness 0/3',
    'Until your next turn, up to two target creatures each have base power and toughness 0/3 and lose all abilities and draw a card',
    'Until your next turn, up to two target creatures each have base power and toughness +0/+3 and lose all abilities',
    'Until your next turn, up to two target creatures each have base power and toughness 0/3 and lose abilities',
    'Until your next turn, up to two target creatures each have base power and toughness 0/3 and gain flying',
    'Until your next turn, up to two target creatures has base power and toughness 0/3 and lose all abilities',
    'Until your next turn, target creature each have base power and toughness 0/3 and lose all abilities',
    'Until the end of your next turn, up to two target creatures each have base power and toughness 0/3 and lose all abilities',
    'up to two target creatures each have base power and toughness 0/3 and lose all abilities',
    'Until your next turn, up to two target creatures you control each have base power and toughness 0/3 and lose all abilities until end of turn',
  ],
  parse: (ctx, pos) => {
    const rule = 'effect.lead-targets-have-base-pt-lose-abilities';
    const r = sequence(
      UNTIL_YOUR_NEXT_TURN(rule),
      literal(', '),
      family<IrNoun>('noun', { only: ['noun.target-permanent'] }),
      literal(' each have '),
      BASE_PT(rule),
      spanned(pattern(new RegExp(` and lose all abilities${NOT_CONTINUED}`, 'iu'))),
    )(ctx, pos);
    if (!r.ok) return r;
    const [duration, , subject, , basePt, loses] = r.value;
    // Several creatures chosen as one target slot ("up to two target creatures", "two target creatures"): the plural noun with a number.
    if (
      !subject.plural ||
      subject.filter.types?.length !== 1 ||
      subject.filter.types[0] !== 'creature'
    ) {
      return fail(ctx, pos);
    }
    const setPt = makeClause(rule, 'setPt', { objects: subject, basePt }, basePt.span);
    const lose = makeClause(rule, 'loseAllAbilities', { objects: subject }, loses.span);
    return {
      ok: true,
      value: [
        { ...setPt, duration, connector: 'and' },
        { ...lose, duration },
      ],
      pos: r.pos,
    };
  },
});

/** The generic mana taken off: "{2}". Only a number: a colored or an X reduction is not generic mana. */
const GENERIC = spanned(pattern(/\{([1-9]\d*)\}/));

/** One card type word of a list of spells. */
const SPELL_WORD = '(?:artifact|creature|enchantment|instant|sorcery|planeswalker)';

/**
 * `effect.lead-spells-cost-less`: "Until your next turn, instant, sorcery, and planeswalker spells that player casts cost {2} less to cast" (CR 601.2f, 118.7a, 611.2a, 500.1; Will Kenrith):
 * the duration first, a list of card types of the spells, and the player they are cast by, "that player" (the player an instruction before it named; the binding pass points it at them).
 * The engine's `playerSpellsCostLess`: every spell of that player that has one of the types costs the generic mana less until the next turn of the controller of the ability begins, not just
 * the next one. Not read: "you" or "an opponent" (other readings), one list with "or", a type that is not a card type of a spell, "spells" alone, a cost reduction of colored or X
 * mana, another duration than "until your next turn", "to cast" left out, an instruction after it in the same sentence.
 */
export const EFFECT_LEAD_SPELLS_COST_LESS = defineRule<Clauses>({
  id: 'effect.lead-spells-cost-less',
  family: 'effect',
  leading: ['until'],
  cites: [
    'CR 601.2f (Casting Spells)',
    'CR 118.7a (Costs)',
    'CR 611.2a (Continuous Effects)',
    'CR 500.1 (Beginning Phase)',
  ],
  examples: [
    'Until your next turn, instant, sorcery, and planeswalker spells that player casts cost {2} less to cast',
    'until your next turn, instant, sorcery, and planeswalker spells that player casts cost {2} less to cast',
    'Until your next turn, instant and sorcery spells that player casts cost {1} less to cast',
    'Until your next turn, creature spells that player casts cost {1} less to cast',
  ],
  rejects: [
    'Until your next turn, instant, sorcery, and planeswalker spells you cast cost {2} less to cast',
    'Until your next turn, instant, sorcery, and planeswalker spells an opponent casts cost {2} less to cast',
    'Until your next turn, spells that player casts cost {2} less to cast',
    'Until your next turn, instant, sorcery, and planeswalker spells that player casts cost {R} less to cast',
    'Until your next turn, instant, sorcery, and planeswalker spells that player casts cost {X} less to cast',
    'Until your next turn, instant, sorcery, and planeswalker spells that player casts cost {2} more to cast',
    'Until your next turn, instant, sorcery, and planeswalker spells that player casts cost {2} less',
    'Until end of turn, instant, sorcery, and planeswalker spells that player casts cost {2} less to cast',
    'Until your next turn, instant, sorcery, and planeswalker spells that player casts cost {2} less to cast and draw a card',
    'Until your next turn, instant, sorcery, or planeswalker spells that player casts cost {2} less to cast',
    'Until your next turn, instant, sorcery, and land spells that player casts cost {2} less to cast',
    'Until your next turn, instant, sorcery, and planeswalker spell that player casts costs {2} less to cast',
    'instant, sorcery, and planeswalker spells that player casts cost {2} less to cast',
  ],
  parse: (ctx, pos) => {
    const rule = 'effect.lead-spells-cost-less';
    const head = sequence(
      UNTIL_YOUR_NEXT_TURN(rule),
      literal(', '),
      spanned(
        pattern(
          new RegExp(
            `(${SPELL_WORD}(?:, ${SPELL_WORD})*,? and ${SPELL_WORD}|${SPELL_WORD}) spells${BOUNDARY}`,
            'iu',
          ),
        ),
      ),
      literal(' '),
      family<IrNoun>('noun', { only: ['noun.that-player'] }),
      literal(' casts cost '),
      GENERIC,
      spanned(pattern(new RegExp(` less to cast${NOT_CONTINUED}`, 'iu'))),
    )(ctx, pos);
    if (!head.ok) return head;
    const [duration, , spells, , player, , generic, tail] = head.value;
    const cardTypes = (spells.value[1] ?? '')
      .toLowerCase()
      .split(/,\s*(?:and\s+)?|\s+and\s+/u)
      .filter((word) => word !== '');
    const typeList: IrTypeList = {
      kind: 'typeList',
      subtypes: [],
      cardTypes,
      span: spells.span,
      rule,
    };
    const amount: IrAmount = {
      kind: 'number',
      value: Number(generic.value[1]),
      span: generic.span,
    };
    const clause = makeClause(
      rule,
      'playerSpellsCostLess',
      { player, spells: typeList, amount },
      { start: pos, end: tail.span.end },
    );
    return { ok: true, value: [{ ...clause, duration }], pos: head.pos };
  },
});

export const KENRITH_EFFECT_RULES = [
  EFFECT_LEAD_TARGETS_HAVE_BASE_PT_LOSE_ABILITIES,
  EFFECT_LEAD_SPELLS_COST_LESS,
];
