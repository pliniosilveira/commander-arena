/**
 * Effect rules of group 4 of the Troyan deck (issue 337): the body of Rashmi, Eternities Crafter, "reveal the top card of your library. You may cast it without paying its
 * mana cost if it's a spell with lesser mana value. If you don't cast it, put it into your hand." The lowering is in `lower/troyan-g4.ts`.
 */
import { pattern } from '../../combinators';
import { defineRule, quietly } from '../registry';
import { type Clauses, makeClause } from './operands';

/**
 * `effect.reveal-top-cast`: "reveal the top card of your library. You may cast it without paying its mana cost if it's a spell with lesser mana value. If you don't cast it,
 * put it into your hand." (CR 701.20a: the card is revealed and stays on top; CR 608.2g, 118.9: it is cast as the effect resolves, with no timing restriction and no mana cost
 * paid; CR 202.3e: its mana value counts an {X} as 0). The three sentences are one instruction, kept together by the segmenter. "Lesser" is relative to the mana value of the
 * spell that caused the ability to trigger, which the lowering reads from the trigger. Not read: another zone or library, a greater or other comparison, "if it's a
 * creature spell", "you may cast it" without the condition, another fate for the card ("onto the battlefield", "on the bottom").
 */
export const EFFECT_REVEAL_TOP_CAST = defineRule<Clauses>({
  id: 'effect.reveal-top-cast',
  family: 'effect',
  leading: ['reveal'],
  cites: [
    'CR 701.20a (Reveal)',
    'CR 608.2g (Resolving Spells and Abilities)',
    'CR 118.9 (Costs)',
    'CR 202.3e (Mana Value)',
  ],
  examples: [
    "reveal the top card of your library. you may cast it without paying its mana cost if it's a spell with lesser mana value. if you don't cast it, put it into your hand",
    'reveal the top card of your library. you may cast it without paying its mana cost if it’s a spell with lesser mana value. if you don’t cast it, put it into your hand',
  ],
  rejects: [
    "reveal the top card of your library. you may cast it without paying its mana cost if it's a spell with lesser mana value",
    "reveal the top card of your library. you may cast it without paying its mana cost if it's a spell with greater mana value. if you don't cast it, put it into your hand",
    "reveal the top card of your library. you may cast it without paying its mana cost if it's a creature spell with lesser mana value. if you don't cast it, put it into your hand",
    "reveal the top card of your library. you may cast it without paying its mana cost. if you don't cast it, put it into your hand",
    "reveal the top card of target player's library. you may cast it without paying its mana cost if it's a spell with lesser mana value. if you don't cast it, put it into your hand",
    "reveal the top card of your library. you may cast it without paying its mana cost if it's a spell with lesser mana value. if you don't cast it, put it on the bottom of your library",
    "reveal the top card of your library. you may cast it without paying its mana cost if it's a spell with lesser mana value. if you don't cast it, put it into your hand and draw a card",
    "reveal the top two cards of your library. you may cast it without paying its mana cost if it's a spell with lesser mana value. if you don't cast it, put it into your hand",
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /reveal the top card of your library\. you may cast it without paying its mana cost if it['’]s a spell with lesser mana value\. if you don['’]t cast it, put it into your hand(?![\p{L}\p{N}])(?!\s+(?:and|then)(?![\p{L}\p{N}]))/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: [
        makeClause('effect.reveal-top-cast', 'revealTopCast', {}, { start: pos, end: r.pos }),
      ],
      pos: r.pos,
    };
  },
});

/** Quiet: the words "reveal the top" start other rules' lines, which must stop where they always did. */
export const TROYAN_G4_EFFECT_RULES = [quietly(EFFECT_REVEAL_TOP_CAST)];
