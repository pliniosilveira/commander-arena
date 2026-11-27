/**
 * The Miracle Worker deck (issue 109): "Once during each of your turns, you may cast an enchantment spell by paying life equal to its mana value rather than paying its mana cost."
 * (Demon of Fate's Design), "... you may cast a spell from your hand by paying life equal to its mana value rather than paying its mana cost." (Access Maze), "... you may cast a spell
 * from your hand or the top of your library without paying its mana cost." (One with the Multiverse). CR 118.9: an alternative cost a static ability of a permanent gives one spell in
 * each turn of its controller, chosen as the spell is cast (CR 601.2b). The engine's `castOnceEachTurn`.
 */
import { pattern } from '../../combinators';
import type { IrStatic } from '../../ir/types';
import { defineRule } from '../registry';
import { staticOf, subjectNoun } from './angels-words';

const ID = 'static.cast-once-each-turn';

const ZONES: Readonly<Record<string, readonly ('hand' | 'libraryTop')[]>> = {
  ' from your hand': ['hand'],
  ' from the top of your library': ['libraryTop'],
  ' from your hand or the top of your library': ['hand', 'libraryTop'],
};

/**
 * `static.cast-once-each-turn`: the spell is "a spell" or a spell of one card type; the zone is none, "from your hand", "from the top of your library" or both; the alternative cost is
 * "by paying life equal to its mana value rather than paying its mana cost" or "without paying its mana cost". Not read: a graveyard or exile (`static.graveyard-play-once`), another
 * player's turn or "once each turn", several spells, a mana value limit, another cost, a line with more text.
 */
export const STATIC_CAST_ONCE_EACH_TURN = defineRule<IrStatic>({
  id: ID,
  family: 'static',
  leading: ['once'],
  cites: [
    'CR 118.9 (Costs)',
    'CR 118.9a (Costs)',
    'CR 601.2b (Casting Spells)',
    'CR 601.2f (Casting Spells)',
    'CR 107.3b (Numbers and Symbols)',
    'CR 613.1f (Interaction of Continuous Effects)',
  ],
  examples: [
    'Once during each of your turns, you may cast an enchantment spell by paying life equal to its mana value rather than paying its mana cost.',
    'Once during each of your turns, you may cast a spell from your hand by paying life equal to its mana value rather than paying its mana cost.',
    'Once during each of your turns, you may cast a spell from your hand or the top of your library without paying its mana cost.',
    'Once during each of your turns, you may cast a creature spell from the top of your library without paying its mana cost.',
  ],
  rejects: [
    'Once during each of your turns, you may cast an enchantment spell by paying life equal to its mana value rather than paying its mana cost',
    'Once during each of your turns, you may cast a enchantment spell by paying life equal to its mana value rather than paying its mana cost.',
    'Once each turn, you may cast an enchantment spell by paying life equal to its mana value rather than paying its mana cost.',
    "Once during each opponent's turn, you may cast a spell from your hand without paying its mana cost.",
    'Once during each of your turns, you may cast a spell from your graveyard without paying its mana cost.',
    'Once during each of your turns, you may cast a spell from exile without paying its mana cost.',
    'Once during each of your turns, you may cast enchantment spells by paying life equal to their mana value rather than paying their mana costs.',
    'Once during each of your turns, you may cast a spell with mana value 3 or less from your hand without paying its mana cost.',
    'Once during each of your turns, you may cast a spell from your hand by paying 2 life rather than paying its mana cost.',
    'Once during each of your turns, you may cast a spell from your hand by paying life equal to its mana value.',
    'Once during each of your turns, you may cast a permanent spell from your hand without paying its mana cost.',
    'Once during each of your turns, you may cast a spell from your hand without paying its mana cost. Draw a card.',
    'You may cast a spell from your hand without paying its mana cost.',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /once during each of your turns, you may cast (?:an (artifact|enchantment|instant)|a (creature|sorcery|planeswalker|battle)|a) spell( from your hand or the top of your library| from your hand| from the top of your library)? (by paying life equal to its mana value rather than paying its mana cost|without paying its mana cost)\.(?![\p{L}\p{N}])(?!\s*\S)/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    const type = (r.value[1] ?? r.value[2])?.toLowerCase();
    const from = r.value[3] === undefined ? undefined : ZONES[r.value[3].toLowerCase()];
    return {
      ok: true,
      value: staticOf(
        ID,
        subjectNoun('you', 'you', { start: pos, end: r.pos }, ID),
        [
          {
            kind: 'castOnceEachTurn',
            alternative: (r.value[4] ?? '').toLowerCase().startsWith('without')
              ? 'free'
              : 'lifeForMana',
            ...(type === undefined ? {} : { types: [type] }),
            ...(from === undefined ? {} : { from }),
          },
        ],
        pos,
        r.pos,
      ),
      pos: r.pos,
    };
  },
});
