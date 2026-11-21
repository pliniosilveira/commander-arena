/**
 * Effect rules of group D of the Federation Fleet deck: "you may reveal the top card of your library. Draw a card if it's an artifact card. If you don't draw a card this way, put two +1/+1
 * counters on ~." (B'Elanna Torres, Scrapper). The engine runs `revealTop`, `conditional` and `addCounters`; only the words are new. The three sentences are kept together by the
 * segmenter (`segment.ts`).
 */
import { fail, pattern } from '../../combinators';
import type { IrCounterSpec } from '../../ir/types';
import { positiveCount } from '../amount/index';
import { defineRule } from '../registry';
import { TAKEN_CARD } from './library';
import { type Clauses, makeClause } from './operands';

/**
 * `effect.reveal-top-draw-else-counters`: "you may reveal the top card of your library. Draw a card if it's an artifact card. If you don't draw a card this way, put two +1/+1 counters on ~"
 * (CR 701.20a: revealing shows the card to every player, it stays in the library; CR 608.2c: the sentences are read in order, and the third asks whether the second drew; CR 122.6:
 * counters put on the permanent). The engine's `revealTop` of your own library (with "you may" as a `may` around it: the choice comes before anything is shown) that draws a card for a card of
 * the kind, then a `conditional` of "you drew no card this way" that puts the counters on this permanent. Declining to reveal draws nothing, so the counters are put. Not read: more than the
 * top card, another library, another number of cards drawn, counters on another permanent or on a target, a fourth sentence.
 */
export const EFFECT_REVEAL_TOP_DRAW_ELSE_COUNTERS = defineRule<Clauses>({
  id: 'effect.reveal-top-draw-else-counters',
  family: 'effect',
  leading: ['reveal', 'you'],
  cites: [
    'CR 701.20a (Reveal)',
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 122.6 (Counters)',
  ],
  examples: [
    "you may reveal the top card of your library. Draw a card if it's an artifact card. If you don't draw a card this way, put two +1/+1 counters on ~",
    "reveal the top card of your library. Draw a card if it's a land card. If you don't draw a card this way, put a +1/+1 counter on ~",
    'you may reveal the top card of your library. Draw a card if it’s an artifact card. If you don’t draw a card this way, put three charge counters on ~',
  ],
  rejects: [
    'you may reveal the top card of your library',
    "you may reveal the top card of your library. Draw a card if it's an artifact card",
    "you may reveal the top two cards of your library. Draw a card if it's an artifact card. If you don't draw a card this way, put two +1/+1 counters on ~",
    "you may reveal the top card of target player's library. Draw a card if it's an artifact card. If you don't draw a card this way, put two +1/+1 counters on ~",
    "you may reveal the top card of your library. Draw two cards if it's an artifact card. If you don't draw a card this way, put two +1/+1 counters on ~",
    "you may reveal the top card of your library. Draw a card if it's an artifact card. If you don't draw a card this way, put two +1/+1 counters on target creature",
    "you may reveal the top card of your library. Draw a card if it's an artifact card. If you don't draw a card this way, put two +1/+1 counters on ~ and draw a card",
    "you may reveal the top card of your library. Draw a card if it's an artifact card. If you do, put two +1/+1 counters on ~",
    "you may reveal the top card of your library. Draw a card if it's an artifact card. If you don't draw a card this way, gain 2 life",
    "you reveal the top card of your library. Draw a card if it's an artifact card. If you don't draw a card this way, put two +1/+1 counters on ~",
  ],
  parse: (ctx, pos) => {
    const id = 'effect.reveal-top-draw-else-counters';
    const head = pattern(
      /(you may )?reveal the top card of your library\. draw a card if it['’]s /iu,
    )(ctx, pos);
    if (!head.ok) return head;
    const card = TAKEN_CARD(ctx, head.pos);
    if (!card.ok) return card;
    const middle = pattern(/\. if you don['’]t draw a card this way, put /iu)(ctx, card.pos);
    if (!middle.ok) return middle;
    const count = positiveCount(ctx, middle.pos);
    if (!count.ok) return count;
    const counter = pattern(
      / ([+-]\d+\/[+-]\d+|first strike|double strike|[a-z]+) counters? on ~(?![\p{L}\p{N}])/iu,
    )(ctx, count.pos);
    if (!counter.ok) return counter;
    const span = { start: pos, end: counter.pos };
    const counterSpec: IrCounterSpec = {
      kind: 'counterSpec',
      name: (counter.value[1] ?? '').toLowerCase(),
      span: { start: count.pos, end: counter.pos },
      rule: id,
    };
    if (counter.pos < ctx.text.length && /^[\p{L}\p{N}]/u.test(ctx.text.slice(counter.pos))) {
      return fail(ctx, pos);
    }
    const clause = makeClause(
      id,
      'revealTopDrawElseCounters',
      {
        what: card.value,
        counter: counterSpec,
        count: { kind: 'number', value: count.value, span: { start: middle.pos, end: count.pos } },
      },
      span,
    );
    return {
      ok: true,
      value: [head.value[1] !== undefined ? { ...clause, optional: true } : clause],
      pos: counter.pos,
    };
  },
});

export const FEDERATION_D_EFFECT_RULES = [EFFECT_REVEAL_TOP_DRAW_ELSE_COUNTERS];
