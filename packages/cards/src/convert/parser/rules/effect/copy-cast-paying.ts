/**
 * Effect rule of the copy of a card exiled from a graveyard that is cast for an alternative cost (Blue Mage's Cane): "Exile up to one target instant or sorcery card from defending
 * player's graveyard. If you do, copy it. You may cast the copy by paying {3} rather than paying its mana cost." (CR 707.12, 608.2g, 118.9). The three sentences are one instruction
 * (`segment.ts` keeps them together); the lowering is in `lower/copy-cast-paying.ts`.
 */
import { fail, pattern } from '../../combinators';
import type { IrClause, IrCost } from '../../ir/types';
import { defineRule, family, quietly } from '../registry';
import { type Clauses, makeClause } from './operands';

const ID = 'effect.exile-copy-cast-paying';

/** ". If you do, copy it. You may cast the copy by paying {3} rather than paying its mana cost": the mana is one plain cost (generic and single-color symbols). */
const COPY_TAIL =
  /\. if you do, copy it\. you may cast the copy by paying ((?:\{(?:0|[1-9][0-9]*|[WUBRGC])\})+) rather than paying its mana cost(?![\p{L}\p{N}])/iu;
const COPY_TAIL_TEST =
  /\. if you do, copy it\. you may cast the copy by paying (?:\{[^}]+\})+ rather than paying its mana cost/iu;

/**
 * `effect.exile-copy-cast-paying`: an exile of cards the text chose, then "If you do, copy it. You may cast the copy by paying {3} rather than paying its mana cost." (CR 707.12: an
 * effect can have a player cast a copy of a card; CR 608.2g: during resolution, with no priority; CR 118.9, 601.2f: the mana paid is an alternative cost, paid instead of the mana
 * cost). The copy is of the card that was exiled, and nothing is copied when nothing was exiled. Not read: the copy cast without paying, "by paying" with a cost that is not mana
 * ({X}, a hybrid or Phyrexian symbol, life), "may" with no cast, another number of copies.
 */
export const EFFECT_EXILE_COPY_CAST_PAYING = quietly(
  defineRule<Clauses>({
    id: ID,
    family: 'effect',
    leading: ['exile'],
    cites: [
      'CR 707.12 (Copying Objects)',
      'CR 608.2g (Resolving Spells and Abilities)',
      'CR 118.9 (Alternative Costs)',
      'CR 601.2f (Casting Spells)',
    ],
    examples: [
      "exile up to one target instant or sorcery card from defending player's graveyard. if you do, copy it. you may cast the copy by paying {3} rather than paying its mana cost",
      'exile up to one target instant or sorcery card from your graveyard. if you do, copy it. you may cast the copy by paying {1}{R} rather than paying its mana cost',
    ],
    rejects: [
      "exile up to one target instant or sorcery card from defending player's graveyard. if you do, copy it. you may cast the copy without paying its mana cost",
      "exile up to one target instant or sorcery card from defending player's graveyard. if you do, copy it. you may cast the copy by paying {X} rather than paying its mana cost",
      "exile up to one target instant or sorcery card from defending player's graveyard. if you do, copy it. you may cast the copy by paying {R/W} rather than paying its mana cost",
      "exile up to one target instant or sorcery card from defending player's graveyard. if you do, copy it. you may cast the copy by paying {3}",
      "exile up to one target instant or sorcery card from defending player's graveyard. you may cast the copy by paying {3} rather than paying its mana cost",
      "exile up to one target instant or sorcery card from defending player's graveyard. if you do, copy it. you must cast the copy by paying {3} rather than paying its mana cost",
      "exile up to one target instant or sorcery card from defending player's graveyard. if you do, copy it. you may cast the copy by paying {3} rather than paying its mana cost and draw a card",
      "exile up to one target instant or sorcery card from defending player's graveyard. if you do, copy it",
    ],
    parse: (ctx, pos) => {
      // Only a text that carries the copy sentences is this rule's (the plain exile rule reads the first sentence alone).
      if (!COPY_TAIL_TEST.test(ctx.text.slice(pos))) return fail(ctx, pos);
      const exiled = family<Clauses>('effect', { only: ['effect.exile'] })(ctx, pos);
      if (!exiled.ok) return exiled;
      const [only, ...more] = exiled.value;
      if (only === undefined || more.length > 0) return fail(ctx, pos);
      const tail = pattern(COPY_TAIL)(ctx, exiled.pos);
      if (!tail.ok) return fail(ctx, pos);
      const span = { start: pos, end: tail.pos };
      const symbols = [...(tail.value[1] ?? '').matchAll(/\{([^}]+)\}/gu)].map((m) => m[1] ?? '');
      const cost: IrCost = { kind: 'mana', symbols, span, rule: ID };
      const copy: IrClause = makeClause(
        ID,
        'copyCardAndCastPaying',
        { cost: { kind: 'costList', costs: [cost], span, rule: ID } },
        span,
      );
      return {
        ok: true,
        value: [
          { ...only, span, rule: ID, connector: 'and' as const },
          { ...copy, optional: false },
        ],
        pos: tail.pos,
      };
    },
  }),
);

export const COPY_CAST_PAYING_EFFECT_RULES = [EFFECT_EXILE_COPY_CAST_PAYING];
