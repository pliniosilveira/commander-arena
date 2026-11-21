/**
 * Effect rule of the Federation Fleet deck (group B), Ambassador K'Ehleyr: "Parley -- At the beginning of combat on your turn, each player reveals the top card of their library, then
 * draws a card. For each nonland card revealed this way, put a +1/+1 counter on ~." The engine runs `revealTopBranches` of each player (rules/reveal-top-branches.ts) and a draw for each
 * player; only the words are new. The two sentences of one instruction are kept together by the segmenter (`segment.ts`).
 */
import { fail, type Parser, pattern } from '../../combinators';
import type { IrArg, IrNoun } from '../../ir/types';
import { BOUNDARY, CARD_TYPES } from '../noun/phrases';
import { defineRule } from '../registry';
import { type Clauses, makeClause } from './operands';

const ID = 'effect.each-player-reveals-then-draws';

/** "nonland card", "creature card": the kind of card revealed, a card type or the lack of one (CR 205.2a). */
const KIND_OF_CARD: Parser<IrNoun> = (ctx, pos) => {
  const r = pattern(new RegExp(`(non)?(${CARD_TYPES}) card${BOUNDARY}`, 'iu'))(ctx, pos);
  if (!r.ok) return r;
  const type = (r.value[2] ?? '').toLowerCase();
  const raw = ctx.text.slice(pos, r.pos);
  return {
    ok: true,
    value: {
      kind: 'noun',
      det: 'a',
      filter: {
        ...(r.value[1] === undefined ? { types: [type] } : { notTypes: [type] }),
        card: true,
        raw,
      },
      upTo: false,
      plural: false,
      other: false,
      span: { start: pos, end: r.pos },
      rule: ID,
    },
    pos: r.pos,
  };
};

/**
 * `effect.each-player-reveals-then-draws`: "each player reveals the top card of their library, then draws a card. For each nonland card revealed this way, put a +1/+1 counter on ~" (CR
 * 701.20a: revealing shows the card to every player and it stays on top of the library, so the draw takes it; CR 121.1; CR 608.2c; CR 122.1). Every player reveals the top card of their
 * own library and then draws a card; the permanent gets a counter for each card revealed that is of the kind (a player with no card to reveal gives none). The engine's `revealTopBranches` of
 * `eachPlayer` and a `draw` of each player. Not read: a number of cards but one, a library other than their own, "you", a draw but one card, a kind no sentence names, a counter but +1/+1,
 * an object but `~`, a second sentence with another instruction.
 */
export const EFFECT_EACH_PLAYER_REVEALS_THEN_DRAWS = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['each'],
  cites: [
    'CR 701.20a (Reveal)',
    'CR 121.1 (Drawing a Card)',
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 122.1 (Counters)',
  ],
  examples: [
    'each player reveals the top card of their library, then draws a card. For each nonland card revealed this way, put a +1/+1 counter on ~',
    'each player reveals the top card of their library, then draws a card. For each creature card revealed this way, put a +1/+1 counter on ~',
  ],
  rejects: [
    'each player reveals the top card of their library, then draws a card',
    'each player reveals the top card of their library, then draws a card. For each nonland card revealed this way',
    'each player reveals the top card of their library, then draws a card. For each nonland card revealed this way, put a +1/+1 counter on it',
    'each player reveals the top card of their library, then draws a card. For each nonland card revealed this way, put a -1/-1 counter on ~',
    'each player reveals the top card of their library, then draws a card. For each nonland card revealed this way, put two +1/+1 counters on ~',
    'each player reveals the top card of their library, then draws a card. For each card revealed this way, put a +1/+1 counter on ~',
    'each player reveals the top two cards of their library, then draws a card. For each nonland card revealed this way, put a +1/+1 counter on ~',
    'each player reveals the top card of their library, then draws two cards. For each nonland card revealed this way, put a +1/+1 counter on ~',
    'each opponent reveals the top card of their library, then draws a card. For each nonland card revealed this way, put a +1/+1 counter on ~',
    'each player reveals the top card of your library, then draws a card. For each nonland card revealed this way, put a +1/+1 counter on ~',
    'each player reveals the top card of their library, then draws a card. For each nonland card revealed this way, put a +1/+1 counter on ~ and draw a card',
    'each player reveals the top card of their library, then draws a card. For each nonland card revealed this way, put a +1/+1 counter on ~, then draw a card',
  ],
  parse: (ctx, pos) => {
    const head = pattern(
      /each player reveals the top card of their library, then draws a card\. For each /iu,
    )(ctx, pos);
    if (!head.ok) return head;
    const kind = KIND_OF_CARD(ctx, head.pos);
    if (!kind.ok) return kind;
    const tail = pattern(/(?: revealed this way, put a \+1\/\+1 counter on ~)(?![\p{L}\p{N}~])/iu)(
      ctx,
      kind.pos,
    );
    if (!tail.ok) return tail;
    // Only the end of the sentence may follow: nothing that adds an instruction the card would not always get ("and draw a card", ", then ...").
    if (/^(?:,| and\b| then\b)/iu.test(ctx.text.slice(tail.pos))) return fail(ctx, pos);
    const span = { start: pos, end: tail.pos };
    const args: Record<string, IrArg> = { what: kind.value };
    return {
      ok: true,
      value: [makeClause(ID, 'eachPlayerRevealsThenDraws', args, span)],
      pos: tail.pos,
    };
  },
});

export const PARLEY_EFFECT_RULES = [EFFECT_EACH_PLAYER_REVEALS_THEN_DRAWS];
