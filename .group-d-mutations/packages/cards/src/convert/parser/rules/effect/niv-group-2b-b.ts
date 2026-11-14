/**
 * Effect rules of group 2b-b of the Niv-Mizzet deck (issue 25, D-328): the rider of mana that copies the spell it is spent on.
 */
import { fail, literal, optional, pattern, sequence } from '../../combinators';
import type { IrFilter, IrNoun } from '../../ir/types';
import { BOUNDARY, CARD_TYPES, typeChoice } from '../noun/phrases';
import { defineRule, quietly } from '../registry';
import { flag } from './dragons';
import { type Clauses, makeClause } from './operands';

const COLOR_WORD = pattern(/(white|blue|black|red|green) /iu);
const ONE_TYPE = pattern(new RegExp(`(?:${CARD_TYPES})${BOUNDARY}`, 'iu'));

/**
 * `effect.mana-rider-copy`: "When that mana is spent to cast a red instant or sorcery spell, copy that spell and you may choose new targets for the copy."
 * (CR 106.6, 603.2, 603.7a, 707.10, 707.10c: mana a mana ability adds may carry an ability that triggers when it is spent on a spell; here the controller of
 * the permanent puts a copy of that spell on the stack, and may choose new targets for it). Like `effect.mana-rider` it says something about the mana ability
 * before it, which the lowering of that ability reads. The spell is named by one color (or none) and one card type or a choice of card types ("a red instant or
 * sorcery spell" is a spell that is red and an instant or a sorcery); the clause after the comma is "copy that spell", with or without the new targets.
 */
export const EFFECT_MANA_RIDER_COPY = defineRule<Clauses>({
  id: 'effect.mana-rider-copy',
  family: 'effect',
  leading: ['when'],
  cites: [
    'CR 106.6 (Mana)',
    'CR 603.2 (Triggered Abilities)',
    'CR 603.7a (Delayed Triggered Abilities)',
    'CR 707.10 (Copying Objects)',
    'CR 707.10c (Copying Objects)',
  ],
  examples: [
    'when that mana is spent to cast a red instant or sorcery spell, copy that spell and you may choose new targets for the copy',
    'when that mana is spent to cast an instant spell, copy that spell',
    'when that mana is spent to cast a blue instant spell, copy that spell and you may choose new targets for the copy',
    'when that mana is spent to cast a sorcery spell, copy that spell',
  ],
  rejects: [
    'when that mana is spent to cast a red instant or sorcery spell, copy that spell and you may choose new targets',
    'when that mana is spent to cast a red instant or sorcery spell, copy that spell and you may choose new targets for the copy and draw a card',
    'when that mana is spent to cast a red instant or sorcery spell, copy it and you may choose new targets for the copy',
    'when that mana is spent to cast a red instant or sorcery spell, copy that spell twice',
    'when that mana is spent to cast a spell, copy that spell',
    'when that mana is spent to cast a red spell, copy that spell',
    'when that mana is spent to cast a red or blue instant spell, copy that spell',
    'when that mana is spent to cast a red instant or sorcery spell, you may copy that spell',
    'when this mana is spent to cast a red instant or sorcery spell, copy that spell',
    'when that mana is spent to cast an instant and sorcery spell, copy that spell',
    'when that mana is spent to activate an ability, copy that spell',
    'when that mana is spent to cast a red instant or sorcery spell, copy that spell and you choose new targets for the copy',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.mana-rider-copy';
    const head = pattern(/when that mana is spent to cast an? /iu)(ctx, pos);
    if (!head.ok) return head;
    const color = optional(COLOR_WORD, null)(ctx, head.pos);
    if (!color.ok) return color;
    const typesAt = color.pos;
    // One card type, or a choice of two or more ("instant or sorcery"); a color alone says too little of the spell.
    const many = typeChoice(CARD_TYPES)(ctx, typesAt);
    const one = many.ok ? null : ONE_TYPE(ctx, typesAt);
    let types: string[];
    let typesEnd: number;
    if (many.ok) {
      types = many.value;
      typesEnd = many.pos;
    } else if (one?.ok === true) {
      types = [one.value[0].toLowerCase()];
      typesEnd = one.pos;
    } else {
      return fail(ctx, pos);
    }
    const tail = sequence(
      literal(' spell, copy that spell'),
      optional(literal(' and you may choose new targets for the copy'), null),
      pattern(new RegExp(BOUNDARY, 'u')),
    )(ctx, typesEnd);
    if (!tail.ok) return tail;
    const span = { start: pos, end: tail.pos };
    const spellSpan = { start: head.pos, end: typesEnd };
    const colorWord = color.value?.[1]?.toLowerCase();
    const filter: IrFilter = {
      stackKind: 'spell',
      ...(colorWord === undefined ? {} : { colors: [colorWord] }),
      ...(types.length === 1
        ? { types }
        : { anyOf: types.map((t): IrFilter => ({ types: [t], raw: t })) }),
      raw: ctx.text.slice(head.pos, typesEnd),
    };
    const noun: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter,
      upTo: false,
      plural: true,
      other: false,
      span: spellSpan,
      rule: id,
    };
    const newTargets = tail.value[1] !== null;
    return {
      ok: true,
      value: [
        makeClause(
          id,
          'spentRider',
          { spells: noun, copy: flag(id, true, span), newTargets: flag(id, newTargets, span) },
          span,
        ),
      ],
      pos: tail.pos,
    };
  },
});

export const NIV_GROUP_2B_B_EFFECT_RULES = [EFFECT_MANA_RIDER_COPY].map(quietly);
