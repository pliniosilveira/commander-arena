/**
 * Effect rules of the Planeswalker Party deck (issue 132).
 */
import { fail, literal, optional, pattern, satisfy, sequence } from '../../combinators';
import type {
  IrAmount,
  IrBasePt,
  IrClause,
  IrColorSpec,
  IrCounterSpec,
  IrDuration,
  IrNoun,
  IrTypeList,
} from '../../ir/types';
import { KEYWORD_WORDS } from '../keyword/list';
import { defineRule, family, quietly, spanned } from '../registry';
import { CREATURE_TYPE_LIST } from './becomes';
import { type Clauses, makeClause } from './operands';

const ID = 'effect.damage-exile-if-dies';

/**
 * `effect.damage-exile-if-dies`: "~ deals X damage to target creature or planeswalker. If a permanent dealt damage this way would die this turn, exile it instead." (Chandra, Awakened
 * Inferno; CR 120.2, 614.1a, 614.6, 700.4): the damage of `effect.damage` and the replacement of the sentence after it, which are one instruction (the segmenter keeps the two sentences
 * together). The lowering turns the second sentence into the engine's `exileIfDiesThisTurn` of the target, behind the damage actually dealt. Only one target and the words "a permanent dealt
 * damage this way", "that creature" or "that permanent". Not read: another recipient than a target, "until end of turn", "instead of dying", a later sentence.
 */
export const EFFECT_DAMAGE_EXILE_IF_DIES = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['~'],
  cites: [
    'CR 120.2 (Damage)',
    'CR 614.1a (Replacement Effects)',
    'CR 614.6 (Replacement Effects)',
    'CR 700.4 (Dies)',
  ],
  examples: [
    '~ deals 3 damage to target creature. If that creature would die this turn, exile it instead',
    '~ deals 3 damage to target creature or planeswalker. If a permanent dealt damage this way would die this turn, exile it instead',
    '~ deals 2 damage to target creature. If that permanent would die this turn, exile it instead',
  ],
  rejects: [
    '~ deals 3 damage to target creature. If that creature would die this turn, exile it',
    '~ deals 3 damage to target creature. If that creature would die, exile it instead',
    '~ deals 3 damage to each creature. If that creature would die this turn, exile it instead',
    '~ deals 3 damage to target creature. If that creature would die this turn, exile it instead and draw a card',
    '~ deals 3 damage to target creature. If that creature would die this turn, put it on the bottom of its owner’s library instead',
    '~ deals 3 damage to target creature. If that creature would die until end of turn, exile it instead',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      family<Clauses>('effect', { only: ['effect.damage'] }),
      pattern(
        /\. if (?:a permanent dealt damage this way|that (?:creature|permanent)) would die this turn, exile it instead(?![\p{L}\p{N}])/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [clauses] = r.value;
    const [first, ...rest] = clauses;
    const to = first?.args.to;
    const items = to?.kind === 'noun' ? [to] : to?.kind === 'nounList' ? to.items : [];
    // One target: the permanent "dealt damage this way" is that target (CR 115.1), so a group ("each creature") is not read.
    if (
      first === undefined ||
      rest.length > 0 ||
      first.verb !== 'dealDamage' ||
      items.length !== 1 ||
      items[0]?.det !== 'target'
    ) {
      return fail(ctx, pos);
    }
    const marked = makeClause(
      ID,
      'dealDamage',
      { ...first.args, exileIfDies: { kind: 'flag', value: true, span: first.span, rule: ID } },
      first.span,
    );
    return { ok: true, value: [{ ...marked, rule: ID }], pos: r.pos };
  },
});

const BECOMES_ID = 'effect.lead-each-becomes-creature';

/**
 * `effect.lead-each-becomes-creature`: "Until end of turn, each planeswalker you control becomes a 4/4 red Dragon creature and gains flying." (Sarkhan the Masterless; CR 613.1d, 613.1e,
 * 613.1f, 613.4b, 611.2a, 205.1a): every planeswalker the controller controls as the effect begins is a creature of that color, creature type and base power and toughness until the
 * end of the turn, and no longer a planeswalker (it keeps its loyalty counters and abilities). The group is fixed once (CR 611.2c). Keywords are given first and the types last, so the
 * group is still the planeswalkers when each part is made. Not read: another group than planeswalkers you control, "still a planeswalker" (`effect.lead-becomes-creature`), no color,
 * another duration, a quoted ability.
 */
export const EFFECT_LEAD_EACH_BECOMES_CREATURE = defineRule<Clauses>({
  id: BECOMES_ID,
  family: 'effect',
  leading: ['until'],
  cites: [
    'CR 611.2a (Continuous Effects)',
    'CR 611.2c (Continuous Effects)',
    'CR 613.1d (Interaction of Continuous Effects)',
    'CR 613.1e (Interaction of Continuous Effects)',
    'CR 613.4b (Interaction of Continuous Effects)',
    'CR 205.1a (Type Line)',
  ],
  examples: [
    'until end of turn, each planeswalker you control becomes a 4/4 red Dragon creature and gains flying',
    'Until end of turn, each planeswalker you control becomes a 4/4 red Dragon creature',
  ],
  rejects: [
    'until end of turn, each planeswalker you control becomes a 4/4 red Dragon creature and gains flying.',
    'until end of turn, each creature you control becomes a 4/4 red Dragon creature and gains flying',
    "until end of turn, each planeswalker you control becomes a 4/4 red Dragon creature that's still a planeswalker",
    'until end of turn, each planeswalker you control becomes a 4/4 Dragon creature and gains flying',
    'until end of turn, each planeswalker you control becomes a red Dragon creature and gains flying',
    'until your next turn, each planeswalker you control becomes a 4/4 red Dragon creature and gains flying',
    'until end of turn, each planeswalker becomes a 4/4 red Dragon creature and gains flying',
    'until end of turn, each planeswalker you control becomes a 4/4 red Dragon creature and gains flying and draws a card',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      family<IrDuration>('duration'),
      literal(', '),
      satisfy(
        family<IrNoun>('noun', { only: ['noun.each-permanent'] }),
        (n) =>
          n.filter.types?.length === 1 &&
          n.filter.types[0] === 'planeswalker' &&
          n.filter.controller === 'you' &&
          !n.other,
      ),
      literal(' becomes a '),
      spanned(pattern(/(\d+)\/(\d+) /)),
      spanned(pattern(/(white|blue|black|red|green)(?![\p{L}\p{N}]) /iu)),
      spanned(CREATURE_TYPE_LIST),
      literal(' creature'),
      optional(spanned(sequence(literal(' and gains '), KEYWORD_WORDS)), null),
    )(ctx, pos);
    if (!r.ok) return r;
    const [duration, , subject, , pt, color, types, , gained] = r.value;
    const basePt: IrBasePt = {
      kind: 'basePt',
      power: Number(pt.value[1]),
      toughness: Number(pt.value[2]),
      span: pt.span,
      rule: BECOMES_ID,
    };
    const typeList: IrTypeList = {
      kind: 'typeList',
      subtypes: types.value,
      cardTypes: ['creature'],
      span: types.span,
      rule: BECOMES_ID,
    };
    const colorSpec: IrColorSpec = {
      kind: 'colorSpec',
      colors: [(color.value[1] ?? '').toLowerCase()],
      span: color.span,
      rule: BECOMES_ID,
    };
    const clauses: IrClause[] = [];
    const names = gained === null ? [] : gained.value[1];
    names.forEach((name) => {
      const keyword = {
        kind: 'keywordName' as const,
        name,
        span: gained?.span ?? pt.span,
        rule: BECOMES_ID,
      };
      clauses.push({
        ...makeClause(BECOMES_ID, 'grantKeyword', { objects: subject, keyword }, keyword.span),
        duration,
        connector: 'and' as const,
      });
    });
    clauses.push({
      ...makeClause(
        BECOMES_ID,
        'becomesCreatureGroup',
        { objects: subject, types: typeList, colors: colorSpec, basePt },
        types.span,
      ),
      duration,
    });
    return { ok: true, value: clauses, pos: r.pos };
  },
});

const EACH_DEALS_ID = 'effect.each-deals-damage-to-that';

/**
 * `effect.each-deals-damage-to-that`: "each Dragon you control deals 1 damage to that creature" (Sarkhan the Masterless; CR 120.3, 608.2c): every permanent of a group the controller
 * controls is a source of one damage of its own to the permanent the trigger is about. The engine's `dealDamageFromEach`. Not read: "deals damage equal to its power" (`effect.damage-it-count`),
 * another recipient than "that creature", a group that is not "each ... you control", the singular.
 */
export const EFFECT_EACH_DEALS_DAMAGE_TO_THAT = defineRule<Clauses>({
  id: EACH_DEALS_ID,
  family: 'effect',
  leading: ['each'],
  cites: ['CR 120.3 (Damage)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: [
    'each Dragon you control deals 1 damage to that creature',
    'each creature you control deals 2 damage to that creature',
  ],
  rejects: [
    'each Dragon you control deals damage to that creature',
    'each Dragon deals 1 damage to that creature',
    'each Dragon you control deals 1 damage to target creature',
    'each Dragon you control deals 1 damage to that creature and draws a card',
    'each Dragon you control deal 1 damage to that creature',
    'each Dragon you control deals 1 damage to that player',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      satisfy(
        family<IrNoun>('noun', { only: ['noun.each-permanent'] }),
        (n) => n.filter.controller === 'you' && !n.other,
      ),
      literal(' deals '),
      family<IrAmount>('amount', { only: ['amount.number'] }),
      literal(' damage to '),
      spanned(pattern(/that (?:creature|permanent)(?![\p{L}\p{N}'’])/iu)),
    )(ctx, pos);
    if (!r.ok) return r;
    const [sources, , amount, , victim] = r.value;
    // "that creature" is the creature the trigger is about, not the group named before it (the binding pass would take the nearest noun): the trigger's own subject.
    const to: IrNoun = {
      kind: 'noun',
      det: 'triggerSubject',
      filter: { raw: victim.value[0] },
      upTo: false,
      plural: false,
      other: false,
      span: victim.span,
      rule: EACH_DEALS_ID,
    };
    if (amount.kind !== 'number') return fail(ctx, pos);
    return {
      ok: true,
      value: [
        makeClause(
          EACH_DEALS_ID,
          'dealDamageFromEach',
          { sources, amount, to },
          { start: pos, end: r.pos },
        ),
      ],
      pos: r.pos,
    };
  },
});

const MOVE_ID = 'effect.move-counter-from-self';

/**
 * `effect.move-counter-from-self`: "move a loyalty counter from ~ onto that planeswalker" (Gatewatch Beacon; CR 122.1, 122.6): one counter of a named kind from the permanent with the
 * ability onto the permanent the trigger is about. The engine's `moveCounterFromThis`. Not read: "any number" (`effect.move-counters-onto-others`), a number of counters other than "a",
 * the counters of another permanent, a target, another noun than "that [type]".
 */
export const EFFECT_MOVE_COUNTER_FROM_SELF = defineRule<Clauses>({
  id: MOVE_ID,
  family: 'effect',
  leading: ['move'],
  cites: [
    'CR 122.1 (Counters)',
    'CR 122.6 (Counters)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    'move a loyalty counter from ~ onto that planeswalker',
    'move a +1/+1 counter from ~ onto that creature',
  ],
  rejects: [
    'move a loyalty counter from ~ onto target planeswalker',
    'move two loyalty counters from ~ onto that planeswalker',
    'move a loyalty counter from target planeswalker onto that planeswalker',
    'move any number of loyalty counters from ~ onto that planeswalker',
    'move a loyalty counter from ~ onto that planeswalker and draw a card',
    'move a loyalty counter from ~ onto that',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('move a '),
      spanned(pattern(/[+-]\d+\/[+-]\d+|[a-z]+/i)),
      literal(' counter from ~ onto '),
      family<IrNoun>('noun', { only: ['noun.that-object'] }),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, counterWord, , noun] = r.value;
    const counter: IrCounterSpec = {
      kind: 'counterSpec',
      name: counterWord.value[0].toLowerCase(),
      span: counterWord.span,
      rule: MOVE_ID,
    };
    return {
      ok: true,
      value: [
        makeClause(
          MOVE_ID,
          'moveCounterFromThis',
          { counter, objects: noun },
          { start: pos, end: r.pos },
        ),
      ],
      pos: r.pos,
    };
  },
});

export const PLANESWALKER_PARTY_EFFECT_RULES = [
  quietly(EFFECT_DAMAGE_EXILE_IF_DIES),
  quietly(EFFECT_MOVE_COUNTER_FROM_SELF),
  quietly(EFFECT_EACH_DEALS_DAMAGE_TO_THAT),
  quietly(EFFECT_LEAD_EACH_BECOMES_CREATURE),
];
