/**
 * Noun rule of the Miracle Worker deck (issue 109, Secret Arcade): the nonland permanents you control and the permanent spells you control, as one group.
 */
import { fail, pattern, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule } from '../registry';
import { BOUNDARY, permanentPhrase } from './phrases';

const ID = 'noun.nonland-permanents-and-permanent-spells';

/**
 * `noun.nonland-permanents-and-permanent-spells`: "nonland permanents you control and permanent spells you control" (Secret Arcade, CR 110.4a, 205.1b, 613.1d): the nonland permanents on
 * the battlefield that you control and, on the stack, the permanent spells that you control. A plural group that only the statement "are enchantments in addition to their other types"
 * (the engine's `setTypes` for the permanents and `giveTypesToPermanentSpells` for the spells) reads: the lowering refuses it for any other effect. Not read: another kind of permanent
 * ("creatures you control and creature spells you control"), spells of other players, "other", a singular, the spells left out.
 */
export const NOUN_NONLAND_PERMANENTS_AND_PERMANENT_SPELLS = defineRule<IrNoun>({
  id: ID,
  family: 'noun',
  leading: [],
  cites: [
    'CR 110.4a (Permanents)',
    'CR 205.1b (Card Types)',
    'CR 613.1d (Interaction of Continuous Effects)',
  ],
  examples: [
    'nonland permanents you control and permanent spells you control',
    'Nonland permanents you control and permanent spells you control',
  ],
  rejects: [
    'nonland permanents you control and permanent spells',
    'nonland permanents you control and creature spells you control',
    'creatures you control and permanent spells you control',
    'nonland permanents your opponents control and permanent spells you control',
    'nonland permanents you control and permanent spells your opponents control',
    'nonland permanent you control and permanent spell you control',
    'other nonland permanents you control and permanent spells you control',
    'permanents you control and permanent spells you control',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      permanentPhrase(true, 'all'),
      pattern(new RegExp(` and permanent spells you control${BOUNDARY}`, 'iu')),
    )(ctx, pos);
    if (!r.ok) return r;
    const [filter] = r.value;
    const nonland =
      filter.controller === 'you' &&
      (filter.types ?? []).length === 0 &&
      (filter.notTypes ?? []).length === 1 &&
      filter.notTypes?.[0] === 'land' &&
      filter.subtypes === undefined;
    if (!nonland) return fail(ctx, pos);
    const noun: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter: { ...filter, raw: ctx.text.slice(pos, r.pos) },
      upTo: false,
      plural: true,
      other: false,
      alsoPermanentSpellsYouControl: true,
      span: { start: pos, end: r.pos },
      rule: ID,
    };
    return { ok: true, value: noun, pos: r.pos };
  },
});

export const PERMANENT_SPELLS_NOUN_RULES = [NOUN_NONLAND_PERMANENTS_AND_PERMANENT_SPELLS];
