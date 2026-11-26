/**
 * Static rule of the Exit from Exile deck (Wild-Magic Sorcerer): "The first spell you cast from exile each turn has cascade." (CR 702.85a, 601.2a, 601.2i, 613.1f, 604.2).
 */
import { literal, sequence } from '../../combinators';
import type { IrNoun, IrStatic } from '../../ir/types';
import { defineRule } from '../registry';

const ID = 'static.first-spell-from-exile-has-cascade';

/**
 * `static.first-spell-from-exile-has-cascade`: a static ability of a permanent that gives cascade to the first spell its controller casts from exile in each turn (CR 702.85a: Cascade triggers
 * when its spell is cast; CR 601.2i: the spell is cast from where the card was). The engine's `grantKeywordToSpells` with `cascade` and the filter `castFromExile` with
 * `firstCastFromExileThisTurn`. Not read: another keyword, another zone, "each of your turns", a second keyword, "spells" in the plural, a spell cast by another player.
 */
export const STATIC_FIRST_SPELL_FROM_EXILE_HAS_CASCADE = defineRule<IrStatic>({
  id: ID,
  family: 'static',
  leading: ['the'],
  cites: [
    'CR 702.85a (Cascade)',
    'CR 601.2a (Casting Spells)',
    'CR 601.2i (Casting Spells)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 604.2 (Handling Static Abilities)',
  ],
  examples: ['The first spell you cast from exile each turn has cascade.'],
  rejects: [
    'The first spell you cast from exile each turn has cascade',
    'The first spell you cast from exile each turn has convoke.',
    'The first spell you cast from your graveyard each turn has cascade.',
    'The first spell you cast each turn has cascade.',
    'The first spells you cast from exile each turn have cascade.',
    'The first spell you cast from exile each turn has cascade and flying.',
    'The first spell an opponent casts from exile each turn has cascade.',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('The first spell you cast from exile each turn has cascade'),
      literal('.'),
    )(ctx, pos);
    if (!r.ok) return r;
    const subject: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter: {
        controller: 'you',
        castFromExile: true,
        firstCastFromExileThisTurn: true,
        raw: 'the first spell you cast from exile each turn',
      },
      upTo: false,
      plural: true,
      other: false,
      span: { start: pos, end: r.pos },
      rule: ID,
    };
    return {
      ok: true,
      value: {
        kind: 'static',
        subject,
        effects: [{ kind: 'spellKeyword', keyword: 'cascade' }],
        span: { start: pos, end: r.pos },
        rule: ID,
      },
      pos: r.pos,
    };
  },
});

export const EXILE_SPELL_GRANT_STATIC_RULES = [STATIC_FIRST_SPELL_FROM_EXILE_HAS_CASCADE];
