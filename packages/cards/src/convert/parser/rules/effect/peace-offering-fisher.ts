/**
 * Effect rule of the Peace Offering deck (issue 112), group F: Fisher's Talent's look at the top card, a land card that may be revealed, and a token for a card revealed
 * (CR 701.20a, 701.20b, 608.2c). The three sentences are kept together by the segmenter (`segment-peace-offering.ts`); the engine runs `lookAtTop` with `take.to` `reveal`
 * and a `conditional` on `didPrevious`.
 */
import { fail, pattern, sequence } from '../../combinators';
import type { IrToken } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, family } from '../registry';
import { TAKEN_CARD } from './library';
import { type Clauses, makeClause } from './operands';

/** Only the end of the sentence may follow: nothing that adds an instruction the rule would not run. */
const MORE_AFTER = /^(?:,| and\b| then\b)/iu;

const ID = 'effect.look-top-may-reveal-create-if-revealed';

/**
 * `effect.look-top-may-reveal-create-if-revealed`: "look at the top card of your library. You may reveal it if it's a land card. Create a 1/1 blue Fish creature token if you
 * revealed it this way" (Fisher's Talent; CR 701.20a, 701.20b, 608.2c): the controller looks at the top card of their library; when it is a card of the kind they may reveal it to
 * every player (it stays on top: revealing does not move a card), and the token is created only if they did. The kind is the one a look at the top card lets the player take ("a
 * land card", "a creature card"). Not read: a look at another player's library or at more than one card, a reveal that also moves the card ("and put it into your hand"),
 * another condition than "if you revealed it this way", another instruction than the creation of one token, more after the token.
 */
export const EFFECT_LOOK_TOP_MAY_REVEAL_CREATE_IF_REVEALED = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['look'],
  cites: [
    'CR 701.20a (Reveal)',
    'CR 701.20b (Reveal)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    "look at the top card of your library. You may reveal it if it's a land card. Create a 1/1 blue Fish creature token if you revealed it this way",
    'look at the top card of your library. You may reveal it if it’s a creature card. Create a Treasure token if you revealed it this way',
  ],
  rejects: [
    "look at the top card of your library. You may reveal it if it's a land card",
    "look at the top two cards of your library. You may reveal it if it's a land card. Create a 1/1 blue Fish creature token if you revealed it this way",
    "look at the top card of target player's library. You may reveal it if it's a land card. Create a 1/1 blue Fish creature token if you revealed it this way",
    "look at the top card of your library. You may reveal it if it's a land card. Create a 1/1 blue Fish creature token if you do",
    "look at the top card of your library. You may reveal it and put it into your hand if it's a land card. Create a 1/1 blue Fish creature token if you revealed it this way",
    "look at the top card of your library. You may reveal it if it's a land card. Draw a card if you revealed it this way",
    "look at the top card of your library. You may reveal it if it's a land card. Create a 1/1 blue Fish creature token if you revealed it this way and draw a card",
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      pattern(/look at the top card of your library\. you may reveal it if it['’]s /iu),
      TAKEN_CARD,
      pattern(/\. create /iu),
      family<IrToken>('token', { only: ['token.predefined', 'token.custom'] }),
      pattern(new RegExp(` if you revealed it this way${BOUNDARY}`, 'iu')),
    )(ctx, pos);
    if (!r.ok) return r;
    if (MORE_AFTER.test(ctx.text.slice(r.pos))) return fail(ctx, pos);
    const [, take, , token] = r.value;
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: [makeClause(ID, 'lookTopMayRevealCreate', { take, token }, span)],
      pos: r.pos,
    };
  },
});

export const PEACE_OFFERING_FISHER_EFFECT_RULES = [EFFECT_LOOK_TOP_MAY_REVEAL_CREATE_IF_REVEALED];
