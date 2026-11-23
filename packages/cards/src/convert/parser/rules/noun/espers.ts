/**
 * Noun rules of Espers to Magicite (deck-support issue 97): "up to one target creature card exiled this way".
 */
import { pattern } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule } from '../registry';
import { BOUNDARY } from './phrases';

/**
 * `noun.target-card-exiled-this-way`: "up to one target creature card exiled this way" (CR 603.12, 115.1, 400.7j): one card in exile, of the card type the words name, that the resolution
 * that created the reflexive ability ("When you do, ...") exiled (the engine's `exiledThisWay`). None or one: the target is chosen as the reflexive ability goes on the stack. Read only by
 * `effect.choose-card-exiled-this-way`, which names it. Not read: another count ("two target cards exiled this way"), a target with no "up to" (the engine reads "up to one" only), "target
 * card exiled with ~", a card that is not exiled "this way", no card type word ("target card exiled this way" is read: any card), two types.
 */
export const NOUN_TARGET_CARD_EXILED_THIS_WAY = defineRule<IrNoun>({
  id: 'noun.target-card-exiled-this-way',
  family: 'noun',
  leading: [],
  cites: ['CR 603.12 (Reflexive Triggered Abilities)', 'CR 115.1 (Targets)', 'CR 400.7 (General)'],
  examples: [
    'up to one target creature card exiled this way',
    'up to one target card exiled this way',
    'up to one target artifact card exiled this way',
  ],
  rejects: [
    'up to two target creature cards exiled this way',
    'target creature card exiled this way',
    'up to one target creature card exiled with ~',
    'up to one target creature card exiled',
    'up to one target creature card in exile',
    'up to one target creature or land card exiled this way',
    'up to one creature card exiled this way',
    'up to one target creature exiled this way',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      new RegExp(
        `up to one target (?:(artifact|creature|enchantment|land|planeswalker|instant|sorcery) )?card exiled this way${BOUNDARY}`,
        'iu',
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const type = r.value[1]?.toLowerCase();
    return {
      ok: true,
      value: {
        kind: 'noun',
        det: 'target',
        filter: {
          zone: 'exile',
          card: true,
          ...(type === undefined ? {} : { types: [type] }),
          exiledThisWay: true,
          raw: ctx.text.slice(pos, r.pos),
        },
        count: { kind: 'number', value: 1, span: { start: pos, end: pos + 'up to one'.length } },
        upTo: true,
        plural: false,
        other: false,
        span: { start: pos, end: r.pos },
        rule: 'noun.target-card-exiled-this-way',
      },
      pos: r.pos,
    };
  },
});

export const ESPERS_NOUN_RULES = [NOUN_TARGET_CARD_EXILED_THIS_WAY];
