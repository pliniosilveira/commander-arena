/**
 * Static rule of the Most Wanted deck, group 2 (mana and Treasure): Rain of Riches, "The first spell you cast each turn that mana from a Treasure was spent to cast has cascade."
 * (CR 702.85a, 601.2h, 601.2i, 613.1f, 604.2).
 */
import { literal, sequence } from '../../combinators';
import type { IrNoun, IrStatic } from '../../ir/types';
import { defineRule } from '../registry';

const ID = 'static.first-spell-with-treasure-mana-has-cascade';

/**
 * `static.first-spell-with-treasure-mana-has-cascade`: a static ability of a permanent that gives cascade to the first spell its controller casts each turn that mana from a Treasure
 * was spent to cast (CR 702.85a: Cascade triggers when its spell is cast; CR 601.2h: the mana is spent as the spell is paid for, before it is cast; CR 601.2i). The engine's
 * `grantKeywordToSpells` with `cascade` and the filter `manaSpentFromSubtype` `Treasure` with `firstManaSpentFromSubtypeThisTurn`. Not read: another keyword, another source of the
 * mana ("from a Food"), "spells" in the plural, "each of your turns", a second keyword, a spell cast by another player.
 */
export const STATIC_FIRST_SPELL_WITH_TREASURE_MANA_HAS_CASCADE = defineRule<IrStatic>({
  id: ID,
  family: 'static',
  leading: ['the'],
  cites: [
    'CR 702.85a (Cascade)',
    'CR 601.2h (Casting Spells)',
    'CR 601.2i (Casting Spells)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 604.2 (Handling Static Abilities)',
  ],
  examples: [
    'The first spell you cast each turn that mana from a Treasure was spent to cast has cascade.',
  ],
  rejects: [
    'The first spell you cast each turn that mana from a Treasure was spent to cast has cascade',
    'The first spell you cast each turn that mana from a Treasure was spent to cast has convoke.',
    'The first spell you cast each turn that mana from a Food was spent to cast has cascade.',
    'The first spell you cast each turn has cascade.',
    'The first spells you cast each turn that mana from a Treasure was spent to cast have cascade.',
    'The first spell you cast each turn that mana from a Treasure was spent to cast has cascade and flying.',
    'The first spell an opponent casts each turn that mana from a Treasure was spent to cast has cascade.',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal(
        'The first spell you cast each turn that mana from a Treasure was spent to cast has cascade',
      ),
      literal('.'),
    )(ctx, pos);
    if (!r.ok) return r;
    const subject: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter: {
        controller: 'you',
        manaSpentFromSubtype: 'Treasure',
        firstManaSpentFromSubtypeThisTurn: true,
        raw: 'the first spell you cast each turn that mana from a Treasure was spent to cast',
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

export const TREASURE_SPELL_GRANT_STATIC_RULES = [
  STATIC_FIRST_SPELL_WITH_TREASURE_MANA_HAS_CASCADE,
];
