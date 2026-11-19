/**
 * Static rules of the Multiverse Reforged deck (issue 81, Omnath, Locus of the Void): unspent mana that grows a creature and is made colorless instead of lost (CR 106.4, 500.5).
 */
import { fail, pattern, quiet, sequence } from '../../combinators';
import type { IrNoun, IrStatic } from '../../ir/types';
import { defineRule, family } from '../registry';
import { staticOf } from './angels-words';

const PERIOD = pattern(/\./u);

/**
 * `static.pt-unspent-mana`: "~ gets +1/+1 for each unspent mana you have." (CR 106.4, 613.4c, 611.3a: the number of mana in the controller's pool, worked out each time the
 * characteristics are). The step is +1 or +0 for each of power and toughness (not both 0). Only the permanent itself. Not read: another subject, another step, another count,
 * "an opponent has", a duration.
 */
export const STATIC_PT_UNSPENT_MANA = defineRule<IrStatic>({
  id: 'static.pt-unspent-mana',
  family: 'static',
  leading: ['~'],
  cites: [
    'CR 106.4 (Mana)',
    'CR 613.4c (Interaction of Continuous Effects)',
    'CR 611.3a (Continuous Effects)',
    'CR 604.1 (Handling Static Abilities)',
  ],
  examples: [
    '~ gets +1/+1 for each unspent mana you have.',
    '~ gets +1/+0 for each unspent mana you have.',
    '~ gets +0/+1 for each unspent mana you have.',
  ],
  rejects: [
    '~ gets +1/+1 for each unspent mana you have',
    '~ gets +2/+2 for each unspent mana you have.',
    '~ gets +0/+0 for each unspent mana you have.',
    '~ gets -1/-1 for each unspent mana you have.',
    '~ gets +1/+1 for each mana you have.',
    '~ gets +1/+1 for each unspent mana an opponent has.',
    'Creatures you control get +1/+1 for each unspent mana you have.',
    '~ gets +1/+1 for each unspent mana you have until end of turn.',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      quiet(family<IrNoun>('noun', { only: ['noun.self'] })),
      pattern(/ gets \+([01])\/\+([01])(?![\p{L}\p{N}/])/u),
      pattern(/ for each unspent mana you have(?![\p{L}\p{N}])/iu),
      PERIOD,
    )(ctx, pos);
    if (!r.ok) return r;
    const [subject, step] = r.value;
    const power = Number(step[1]);
    const toughness = Number(step[2]);
    if (power === 0 && toughness === 0) return fail(ctx, pos);
    return {
      ok: true,
      value: staticOf(
        'static.pt-unspent-mana',
        subject,
        [{ kind: 'ptUnspentMana', power: power === 1, toughness: toughness === 1 }],
        pos,
        r.pos,
      ),
      pos: r.pos,
    };
  },
});

/**
 * `static.unspent-mana-colorless`: "If you would lose unspent mana, that mana becomes colorless instead." (CR 106.4, 500.5, 614.1a: a replacement of the loss of mana as steps and phases
 * end, here a permanent's own ability about its controller's pool). Not read: another player, another result, "mana of a color", a second sentence.
 */
export const STATIC_UNSPENT_MANA_COLORLESS = defineRule<IrStatic>({
  id: 'static.unspent-mana-colorless',
  family: 'static',
  leading: ['if'],
  cites: [
    'CR 106.4 (Mana)',
    'CR 500.5 (General)',
    'CR 614.1a (Replacement Effects)',
    'CR 604.1 (Handling Static Abilities)',
  ],
  examples: ['If you would lose unspent mana, that mana becomes colorless instead.'],
  rejects: [
    'If you would lose unspent mana, that mana becomes colorless instead',
    'If you would lose unspent red mana, that mana becomes colorless instead.',
    'If an opponent would lose unspent mana, that mana becomes colorless instead.',
    'If you would lose unspent mana, that mana becomes red instead.',
    'If you would lose unspent mana, that mana becomes colorless.',
    'If you would lose unspent mana, that mana becomes colorless instead. Draw a card.',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/if you would lose unspent mana, that mana becomes colorless instead\./iu)(
      ctx,
      pos,
    );
    if (!r.ok) return r;
    const subject: IrNoun = {
      kind: 'noun',
      det: 'you',
      filter: { raw: 'You' },
      upTo: false,
      plural: false,
      other: false,
      span: { start: pos, end: pos + 3 },
      rule: 'static.unspent-mana-colorless',
    };
    return {
      ok: true,
      value: staticOf(
        'static.unspent-mana-colorless',
        subject,
        [{ kind: 'unspentManaBecomesColorless' }],
        pos,
        r.pos,
      ),
      pos: r.pos,
    };
  },
});

export const OMNATH_STATIC_RULES = [STATIC_PT_UNSPENT_MANA, STATIC_UNSPENT_MANA_COLORLESS];
