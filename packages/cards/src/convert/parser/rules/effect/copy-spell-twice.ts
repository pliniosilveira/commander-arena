/**
 * Effect rule of the Multiverse Reforged deck (issue 81, Venser, Fervent Forger): copying a spell an opponent controls twice.
 */
import { literal, pattern, quiet, sequence } from '../../combinators';
import type { IrAmount, IrNoun } from '../../ir/types';
import { BOUNDARY, spellPhrase } from '../noun/phrases';
import { defineRule, quietly, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

const ID = 'effect.copy-spell-twice';

/**
 * `effect.copy-spell-twice`: "copy target instant or sorcery spell an opponent controls twice. You may choose new targets for the copies." (CR 707.10, 707.10c: two copies of a spell
 * the caster does not control, each a spell its copier controls, and the copier may choose new targets for each). The engine's `copySpell` with a `count` of two and `newTargets`
 * `may`; the permission to choose new targets for the copies is part of the instruction. Not read: another number of copies, a spell you control, "the copy", no permission.
 */
export const EFFECT_COPY_SPELL_TWICE = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['copy'],
  cites: [
    'CR 707.10 (Copying Objects)',
    'CR 707.10c (Copying Objects)',
    'CR 601.2c (Casting Spells)',
  ],
  examples: [
    'copy target instant or sorcery spell an opponent controls twice. you may choose new targets for the copies',
    'copy target spell an opponent controls twice. you may choose new targets for the copies',
  ],
  rejects: [
    'copy target instant or sorcery spell an opponent controls twice',
    'copy target instant or sorcery spell an opponent controls. you may choose new targets for the copy',
    'copy target instant or sorcery spell an opponent controls three times. you may choose new targets for the copies',
    'copy target instant or sorcery spell you control twice. you may choose new targets for the copies',
    'copy target instant or sorcery spell an opponent controls twice. you may choose new targets for the copy',
    'copy target instant or sorcery spell an opponent controls twice and draw a card',
    'copy target instant or sorcery spell twice. you may choose new targets for the copies',
    'copy target creature an opponent controls twice. you may choose new targets for the copies',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('copy target '),
      spanned(spellPhrase()),
      pattern(new RegExp(` an opponent controls twice${BOUNDARY}`, 'iu')),
      quiet(
        pattern(
          /\. you may choose new targets for the copies(?![\p{L}\p{N}])(?!,| and\b| then\b)/iu,
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const filter = r.value[1];
    const span = { start: pos, end: r.pos };
    const spell: IrNoun = {
      kind: 'noun',
      det: 'target',
      filter: { ...filter.value, controller: 'opponent' },
      upTo: false,
      plural: false,
      other: false,
      span: filter.span,
      rule: ID,
    };
    const count: IrAmount = { kind: 'number', value: 2, span };
    return {
      ok: true,
      value: [
        makeClause(
          ID,
          'copySpell',
          { spell, newTargets: { kind: 'flag', value: true, span, rule: ID }, count },
          span,
        ),
      ],
      pos: r.pos,
    };
  },
});

// Read quietly: a copy line this rule does not read keeps the diagnostic of `effect.copy-spell`.
export const COPY_SPELL_TWICE_EFFECT_RULES = [EFFECT_COPY_SPELL_TWICE].map(quietly);
