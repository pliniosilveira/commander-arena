/**
 * Effect rule of the cards that give the instants and sorceries of a graveyard flashback with the cost equal to their mana cost: "Each instant and sorcery card in your graveyard gains
 * flashback until end of turn. The flashback cost is equal to its mana cost." (CR 702.34a, 118.9, 611.2a, 611.2c). The engine runs `gainFlashbackFromManaCost`
 * (`rules/flashback-grant.ts`); what can be lowered is the lowering's business (`lower/jeskai-flashback.ts`).
 */
import { fail, literal, type Parser, pattern, sequence } from '../../combinators';
import type { IrFilter, IrNoun } from '../../ir/types';
import { BOUNDARY, CARD_TYPES, typeChoice } from '../noun/phrases';
import { defineRule, quietly } from '../registry';
import { type Clauses, single } from './operands';

/**
 * "instant and sorcery card(s) in your graveyard": the card types a flashback card is (CR 702.34a: only an instant or a sorcery can be cast with flashback), joined by "and" (no "or", no
 * other quality), as the noun of the cards of a graveyard that is given flashback. Only the two, in either order. The filter names the cards by what they are: no zone and no controller (the
 * words "in your graveyard" are read by the caller, and the engine's grant is about the graveyard of its controller). `raw` is the text read.
 */
export const FLASHBACK_CARDS: Parser<IrNoun> = (ctx, pos) => {
  const r = sequence(
    typeChoice(CARD_TYPES, false, 'and'),
    pattern(new RegExp(` cards? in your graveyard${BOUNDARY}`, 'iu')),
  )(ctx, pos);
  if (!r.ok) return r;
  const [types] = r.value;
  if (types.length !== 2 || !types.includes('instant') || !types.includes('sorcery')) {
    return fail(ctx, pos);
  }
  const span = { start: pos, end: r.pos };
  const raw = ctx.text.slice(pos, r.pos);
  const filter: IrFilter = {
    anyOf: types.map((t): IrFilter => ({ types: [t], raw: t })),
    card: true,
    raw,
  };
  return {
    ok: true,
    value: {
      kind: 'noun',
      det: 'each',
      filter,
      upTo: false,
      plural: true,
      other: false,
      span,
      rule: 'effect.gain-flashback-from-mana-cost',
    },
    pos: r.pos,
  };
};

const RULE = 'effect.gain-flashback-from-mana-cost';

/**
 * `effect.gain-flashback-from-mana-cost`: "each instant and sorcery card in your graveyard gains flashback until end of turn. the flashback cost is equal to its mana cost" (CR 702.34a:
 * flashback, cast from the graveyard and exiled as it leaves the stack; CR 118.9: the flashback cost is an alternative cost, here the mana cost; CR 611.2a, 611.2c: the effect lasts until end
 * of turn and affects the cards in the graveyard as it resolves). The two sentences are one instruction (the segmenter joins them); the second says what the first gives. The engine's
 * `gainFlashbackFromManaCost`. Not read: another graveyard, another cost, a duration other than the turn, another kind of card, "target", the first sentence alone (its cost would be missing).
 */
export const EFFECT_GAIN_FLASHBACK_FROM_MANA_COST = defineRule<Clauses>({
  id: RULE,
  family: 'effect',
  leading: ['each'],
  cites: [
    'CR 702.34a (Flashback)',
    'CR 118.9 (Alternative Costs)',
    'CR 611.2a (Continuous Effects)',
    'CR 611.2c (Continuous Effects)',
  ],
  examples: [
    'each instant and sorcery card in your graveyard gains flashback until end of turn. the flashback cost is equal to its mana cost',
    'Each instant and sorcery card in your graveyard gains flashback until end of turn. The flashback cost is equal to its mana cost',
    'each sorcery and instant card in your graveyard gains flashback until end of turn. the flashback cost is equal to its mana cost',
  ],
  rejects: [
    'each instant card in your graveyard gains flashback until end of turn. the flashback cost is equal to its mana cost',
    'each instant and sorcery card in your graveyard gains flashback until end of turn',
    'each instant and sorcery card in your graveyard gains flashback until end of turn. the flashback cost is equal to its mana cost, then draw a card',
    'each instant and sorcery card in your graveyard gains flashback until end of turn. the flashback cost is equal to its converted mana cost',
    'each instant and sorcery card in your graveyard gains flashback. the flashback cost is equal to its mana cost',
    'each instant and sorcery card in a graveyard gains flashback until end of turn. the flashback cost is equal to its mana cost',
    'each creature card in your graveyard gains flashback until end of turn. the flashback cost is equal to its mana cost',
    'each instant or sorcery card in your graveyard gains flashback until end of turn. the flashback cost is equal to its mana cost',
    'target instant card in your graveyard gains flashback until end of turn. the flashback cost is equal to its mana cost',
    'each instant and sorcery card in your graveyard gains flashback until end of turn. the flashback cost is equal to {2}',
    'each instant and sorcery card in your graveyard gains flashback until your next turn. the flashback cost is equal to its mana cost',
    'each instant and instant card in your graveyard gains flashback until end of turn. the flashback cost is equal to its mana cost',
  ],
  parse: single(
    RULE,
    sequence(
      literal('each '),
      FLASHBACK_CARDS,
      pattern(
        new RegExp(
          ` gains flashback until end of turn\\. the flashback cost is equal to its mana cost${BOUNDARY}(?!,| and\\b| then\\b)`,
          'iu',
        ),
      ),
    ),
    ([, cards]) => ({ verb: 'gainFlashbackFromManaCost', args: { cards } }),
  ),
});

/** Quiet: it starts like "each ...", and must leave the diagnostics of the lines it does not read where they were. */
export const JESKAI_FLASHBACK_EFFECT_RULES = [quietly(EFFECT_GAIN_FLASHBACK_FROM_MANA_COST)];
