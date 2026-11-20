import { choice, fail, literal, map, pattern, sequence } from '../../combinators';
import type { IrTypeList } from '../../ir/types';
import { defineRule, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

const RULE = 'effect.put-milled-into-hand';

const CARD_TYPE = choice(
  map(literal('instant or sorcery'), () => ['instant', 'sorcery'] as readonly string[]),
  map(literal('instant'), () => ['instant'] as readonly string[]),
  map(literal('sorcery'), () => ['sorcery'] as readonly string[]),
  map(literal('creature'), () => ['creature'] as readonly string[]),
  map(literal('artifact'), () => ['artifact'] as readonly string[]),
  map(literal('enchantment'), () => ['enchantment'] as readonly string[]),
  map(literal('land'), () => ['land'] as readonly string[]),
);

/**
 * `effect.put-milled-into-hand`: "You may put an instant or sorcery card milled this way into your hand." (Leyline Dowser, CR 701.17a, 400.7j, 608.2c): after "Mill a card", the controller may put the
 * card the mill moved into their hand when it has one of the card types. The engine's `conditional` over `objectMatches` of `moved`, with a `may` of `moveToZone` of `moved` to the hand. Not read:
 * another zone, another player's hand, "that card" with no type, a type with no "card", a count other than one card, text before the instruction in the same sentence.
 */
export const EFFECT_PUT_MILLED_INTO_HAND = defineRule<Clauses>({
  id: RULE,
  family: 'effect',
  leading: ['you'],
  cites: [
    'CR 701.17a (Mill)',
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 400.7j (Zone Changes)',
  ],
  examples: [
    'you may put an instant or sorcery card milled this way into your hand',
    'you may put a creature card milled this way into your hand',
    'you may put a land card milled this way into your hand',
  ],
  rejects: [
    'you may put an instant or sorcery card milled this way into your graveyard',
    'you may put a card milled this way into your hand',
    'you may put an instant or sorcery card exiled this way into your hand',
    'you may put instant or sorcery cards milled this way into your hand',
    'you put an instant or sorcery card milled this way into your hand',
    'you may put an instant or sorcery card milled this way into an opponent’s hand',
    'you may put an instant or sorcery card milled this way onto the battlefield',
  ],
  parse: (ctx, pos) => {
    if (!/^you may put an? [a-z ]+ card milled this way/iu.test(ctx.text.slice(pos, pos + 70)))
      return fail(ctx, pos);
    const r = spanned(
      sequence(
        literal('you may put '),
        pattern(/an? /),
        CARD_TYPE,
        literal(' card milled this way into your hand'),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const { span } = r.value;
    const cardTypes = r.value.value[2];
    const types: IrTypeList = { kind: 'typeList', subtypes: [], cardTypes, span, rule: RULE };
    return {
      ok: true,
      value: [makeClause(RULE, 'putMilledIntoHand', { types }, span)],
      pos: r.pos,
    };
  },
});

export const PUT_MILLED_EFFECT_RULES = [EFFECT_PUT_MILLED_INTO_HAND];
