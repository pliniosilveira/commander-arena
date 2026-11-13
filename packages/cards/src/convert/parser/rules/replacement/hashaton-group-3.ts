/**
 * Replacement rules of the Hashaton deck program, group 3 (D-1150, D-1151, provisional numbers): the two replacement effects of Bard, King of Dale. "If you would
 * draw a card except the first one you draw in each of your draw steps, draw two cards instead." (CR 614.1a, 614.11, 504.1) is the engine's `drawInstead`; "If one
 * or more tokens would be created under your control, twice that many of those tokens are created instead." (CR 614.1a, 111.2, 614.5) is `tokensInstead` in its
 * `double` mode.
 */
import { choice, fail, literal, map, pattern, sequence } from '../../combinators';
import type { IrAbility, IrAmount, IrClause, IrNoun } from '../../ir/types';
import { defineRule, quietly, spanned } from '../registry';
import { replacement } from './shared';

const COUNT_WORDS: Readonly<Record<string, number>> = { two: 2, three: 3, four: 4 };

/**
 * `replacement.draw-instead`: "If you would draw a card except the first one you draw in each of your draw steps, draw two cards instead." (CR 614.1a, 614.11,
 * 614.11a, 504.1: each card the controller of the permanent would draw, but not the first of each of their draw steps, is replaced by two draws, which are made
 * before the sequence goes on; applied even when the library has no cards, CR 614.11). The engine's `drawInstead`. Not read: a replacement of every draw
 * ("If you would draw a card, draw two cards instead": the engine has no form without the exception), another player, another exception ("except the first
 * one you draw each turn"), one card, a number the engine does not run, a missing period or "instead".
 */
export const REPLACEMENT_DRAW_INSTEAD = defineRule<IrAbility>({
  id: 'replacement.draw-instead',
  family: 'replacement',
  leading: ['if'],
  cites: [
    'CR 614.1a (Replacement Effects)',
    'CR 614.11 (Replacement Effects)',
    'CR 614.5 (Replacement Effects)',
    'CR 504.1 (Draw Step)',
  ],
  examples: [
    'If you would draw a card except the first one you draw in each of your draw steps, draw two cards instead.',
    'If you would draw a card except the first one you draw in each of your draw steps, draw three cards instead.',
  ],
  rejects: [
    'If you would draw a card except the first one you draw in each of your draw steps, draw two cards instead',
    'If you would draw a card except the first one you draw in each of your draw steps, draw two cards.',
    'If you would draw a card except the first one you draw in each of your draw steps, draw a card instead.',
    'If you would draw a card except the first one you draw in each of your draw steps, draw seven cards instead.',
    'If you would draw a card, draw two cards instead.',
    'If you would draw a card except the first one you draw each turn, draw two cards instead.',
    'If you would draw a card except the first one you draw in your draw step, draw two cards instead.',
    'If an opponent would draw a card except the first one they draw in each of their draw steps, they draw two cards instead.',
    'If you would draw a card except the first one you draw in each of your draw steps, skip that draw instead.',
    'If you would draw a card except the first one you draw in each of your draw steps, draw two cards instead. Draw a card.',
    'If you would draw two cards except the first one you draw in each of your draw steps, draw two cards instead.',
  ],
  parse: (ctx, pos) => {
    const id = 'replacement.draw-instead';
    const r = sequence(
      literal(
        'if you would draw a card except the first one you draw in each of your draw steps, draw ',
      ),
      spanned(pattern(/(two|three|four)(?![\p{L}\p{N}])/iu)),
      pattern(/ cards instead(?![\p{L}\p{N}])/iu),
      literal('.'),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, word] = r.value;
    const span = { start: pos, end: r.pos };
    const count = COUNT_WORDS[(word.value[1] ?? '').toLowerCase()];
    if (count === undefined) return fail(ctx, pos);
    const amount: IrAmount = { kind: 'number', value: count, span: word.span };
    const event: IrClause = {
      kind: 'clause',
      verb: 'drawInstead',
      args: { amount },
      optional: false,
      span,
      rule: id,
    };
    return { ok: true, value: replacement(id, span, event), pos: r.pos };
  },
});

/** The tokens a doubling names: every token ("tokens"), as a group the engine reads with no controller of its own (the controller is the player of the effect). */
function everyToken(span: { start: number; end: number }, rule: string): IrNoun {
  return {
    kind: 'noun',
    det: 'each',
    filter: { token: true, raw: 'tokens' },
    upTo: false,
    plural: true,
    other: false,
    span,
    rule,
  };
}

/**
 * `replacement.tokens-double`: "If one or more tokens would be created under your control, twice that many of those tokens are created instead." and "If an effect
 * would create one or more tokens under your control, it creates twice that many of those tokens instead." (CR 614.1a, 111.2, 614.5: every creation of tokens under
 * the control of the controller of the permanent makes twice as many of the same tokens; each such effect replaces a creation once, so two of them make four times as
 * many). The engine's `tokensInstead` in `double` mode: the tokens are the ones the creation describes, there is no token of its own. Every creation of tokens goes through
 * it, whether an effect or a trigger or another replacement makes them, so the second wording is read as the first is. Not read: a kind of token ("creature tokens",
 * "artifact tokens": the engine's doubling names every token), another player, another number ("three times"), counters ("twice that many counters"), a
 * missing period or "instead".
 */
export const REPLACEMENT_TOKENS_DOUBLE = defineRule<IrAbility>({
  id: 'replacement.tokens-double',
  family: 'replacement',
  leading: ['if'],
  cites: [
    'CR 614.1a (Replacement Effects)',
    'CR 111.2 (Tokens)',
    'CR 614.5 (Replacement Effects)',
    'CR 616.1 (Interaction of Replacement and/or Prevention Effects)',
  ],
  examples: [
    'If one or more tokens would be created under your control, twice that many of those tokens are created instead.',
    'If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.',
  ],
  rejects: [
    'If one or more tokens would be created under your control, twice that many of those tokens are created instead',
    'If one or more tokens would be created under your control, twice that many of those tokens are created.',
    'If one or more tokens would be created under your control, three times that many of those tokens are created instead.',
    'If one or more tokens would be created under your control, that many of those tokens are created instead.',
    'If one or more creature tokens would be created under your control, twice that many of those tokens are created instead.',
    'If one or more tokens would be created under an opponent’s control, twice that many of those tokens are created instead.',
    'If one or more tokens would be created, twice that many of those tokens are created instead.',
    'If one or more tokens would be created under your control, twice that many of those tokens are created instead. Draw a card.',
    'If an effect would create one or more creature tokens under your control, it creates twice that many of those tokens instead.',
    'If an effect would create one or more tokens under your control, it creates twice that many of those tokens.',
    'If an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead.',
  ],
  parse: (ctx, pos) => {
    const id = 'replacement.tokens-double';
    const r = choice(
      map(
        literal(
          'if one or more tokens would be created under your control, twice that many of those tokens are created instead.',
        ),
        () => null,
      ),
      map(
        sequence(
          literal('if an effect would create one or more tokens under your control, '),
          pattern(/it creates twice that many of those tokens instead\./iu),
        ),
        () => null,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    const event: IrClause = {
      kind: 'clause',
      verb: 'tokensInstead',
      args: {
        what: everyToken(span, id),
        double: { kind: 'flag', value: true, span, rule: id },
      },
      optional: false,
      span,
      rule: id,
    };
    return { ok: true, value: replacement(id, span, event), pos: r.pos };
  },
});

export const HASHATON_G3_REPLACEMENT_RULES = [
  REPLACEMENT_DRAW_INSTEAD,
  REPLACEMENT_TOKENS_DOUBLE,
].map(quietly);
