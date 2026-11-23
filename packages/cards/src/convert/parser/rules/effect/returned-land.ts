/**
 * Effect rules of the Elminster deck (issue 590, Princess Yue): the two sentences after "return this card to the battlefield tapped under your control" that say what the
 * returned card is now: "She's a land named Moon." and "She gains "{T}: Add {C}."" (CR 612.8, 205.1a, 613.1d, 613.1f, 611.2a: continuous effects with no stated duration last
 * until the end of the game; CR 400.7: the card that returned is a new object, which the effects are about). The pronoun is the card the instruction before it moved.
 */
import { fail, pattern } from '../../combinators';
import type { IrClause, IrNameArg } from '../../ir/types';
import { defineRule, quietly, spanned } from '../registry';
import { QUOTED_MANA } from '../static/grants';
import { type Clauses, makeClause, single } from './operands';

/**
 * `effect.returned-is-named-land`: "she's a land named Moon" (CR 612.8: a continuous effect that sets the name of an object; CR 205.1a: the card type land replaces the card types
 * the object has and the creature types go with the creature type, while its supertypes stay). The engine's `setTypes` of `moved` with a `name`, for the rest of the game. The
 * lowering refuses it after any instruction but a move of a card. Not read: another card type, a name that is not capitalised, "becomes", a duration, text after the name.
 */
export const EFFECT_RETURNED_IS_NAMED_LAND = defineRule<Clauses>({
  id: 'effect.returned-is-named-land',
  family: 'effect',
  leading: ['she', 'he', 'it', 'she’s', "she's", 'he’s', "he's", 'it’s', "it's"],
  cites: [
    'CR 612.8 (Text-Changing Effects)',
    'CR 205.1a (Card Types)',
    'CR 613.1d (Interaction of Continuous Effects)',
    'CR 611.2a (Continuous Effects)',
  ],
  examples: [
    "she's a land named Moon",
    'she’s a land named Moon',
    "he's a land named The Moon",
    "it's a land named Moon",
  ],
  rejects: [
    "she's a land named moon",
    "she's an artifact named Moon",
    "she's a land creature named Moon",
    'she is a land named Moon',
    "she's a land named",
    "she's a land named Moon until end of turn",
    "she's a land named Moon and draw a card",
    'she becomes a land named Moon',
    "they're a land named Moon",
  ],
  parse: single(
    'effect.returned-is-named-land',
    (ctx, pos) => {
      const r = spanned(
        pattern(
          /(?:[Ss]he|[Hh]e|[Ii]t)['’]s a land named (\p{Lu}[\p{L}'’-]*(?: \p{Lu}[\p{L}'’-]*)*)(?![\p{L}\p{N}'’-])/u,
        ),
      )(ctx, pos);
      if (!r.ok) return r;
      const name = r.value.value[1];
      if (name === undefined) return fail(ctx, pos);
      // What follows the name must end the instruction: "until ...", "and ..." and "," start another thing.
      const next = ctx.text.slice(r.pos).trimStart()[0];
      if (next !== undefined && next !== '.') return fail(ctx, pos);
      const arg: IrNameArg = {
        kind: 'name',
        name,
        span: r.value.span,
        rule: 'effect.returned-is-named-land',
      };
      return { ok: true, value: arg, pos: r.pos };
    },
    (name) => ({ verb: 'returnedIsNamedLand', args: { name } }),
  ),
});

/**
 * `effect.returned-gains-mana-ability`: 'she gains "{T}: Add {C}."' (CR 613.1f, 605.1a, 611.2a: a layer 6 effect that gives a mana ability, with no stated duration). The engine's
 * `grantAbility` of `moved`, for the rest of the game. The lowering refuses it after any instruction but the naming of a returned card. Not read: another duration, a
 * keyword, an ability that is not a mana ability, text after the quote.
 */
export const EFFECT_RETURNED_GAINS_MANA_ABILITY = defineRule<Clauses>({
  id: 'effect.returned-gains-mana-ability',
  family: 'effect',
  leading: ['she', 'he', 'it'],
  cites: [
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 605.1a (Mana Abilities)',
    'CR 611.2a (Continuous Effects)',
  ],
  examples: ['she gains "{T}: Add {C}."', 'he gains "{T}: Add {G}."', 'it gains "{T}: Add {C}."'],
  rejects: [
    'she gains flying',
    'she has "{T}: Add {C}."',
    'she gains "{T}: Draw a card."',
    'she gains "{T}: Add {C}." until end of turn',
    'they gain "{T}: Add {C}."',
    'she gains "{T}: Add {C}"',
  ],
  parse: (ctx, pos) => {
    const lead = pattern(/(?:she|he|it) gains /iu)(ctx, pos);
    if (!lead.ok) return lead;
    const quoted = QUOTED_MANA(ctx, lead.pos);
    if (!quoted.ok) return quoted;
    const [granted] = quoted.value;
    if (granted?.kind !== 'grantAbility' || quoted.value.length !== 1) return fail(ctx, lead.pos);
    const clause: IrClause = makeClause(
      'effect.returned-gains-mana-ability',
      'returnedGainsManaAbility',
      { ability: granted.ability },
      { start: pos, end: quoted.pos },
    );
    return { ok: true, value: [clause], pos: quoted.pos };
  },
});

export const RETURNED_LAND_EFFECT_RULES = [
  EFFECT_RETURNED_IS_NAMED_LAND,
  EFFECT_RETURNED_GAINS_MANA_ABILITY,
].map(quietly);
