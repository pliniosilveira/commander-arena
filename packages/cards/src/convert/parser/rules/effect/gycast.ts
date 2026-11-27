/**
 * Effect rule of the graveyard casts of the Revenant Recon deck (Counterpoint): a spell of a list of card types cast from your graveyard without paying its mana cost, with a mana value
 * that is at most the mana value of the spell an earlier sentence names.
 */
import { choice, fail, literal, map, optional, pattern, sequence } from '../../combinators';
import type { IrAmount, IrArg, IrNoun } from '../../ir/types';
import { BOUNDARY, CARD_TYPES, typeChoice } from '../noun/phrases';
import { defineRule, family, quietly, spanned } from '../registry';
import { flag } from './dragons';
import { EXILE_INSTEAD } from './f144';
import { type Clauses, makeClause } from './operands';

const ID = 'effect.cast-graveyard-spell-free-value-of-that-spell';

/**
 * `effect.cast-graveyard-spell-free-value-of-that-spell`: "(you may) cast a creature, instant, sorcery, or planeswalker spell from your graveyard with mana value less than or equal to that
 * spell's mana value without paying its mana cost" (Counterpoint; CR 608.2g, 118.9, 202.3, 608.2h). Not a target: the controller chooses the card as the effect resolves. "That spell" is
 * the spell an earlier sentence of the same text names (the lowering reads it and refuses the clause when there is none). The engine's `castFree` of a choice from the controller's
 * graveyard whose limit is the mana value of that spell. Not read: one type or a type that is not a spell's (a land), a graveyard that is not yours, another comparison, paying the mana
 * cost, a rider, another thing done to the spell, a second instruction joined to it.
 */
export const EFFECT_CAST_GRAVEYARD_SPELL_FREE_VALUE_OF_THAT_SPELL = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['cast', 'you'],
  cites: [
    'CR 608.2g (Resolving Spells and Abilities)',
    'CR 118.9 (Alternative Costs)',
    'CR 202.3 (Mana Value)',
    'CR 608.2h (Resolving Spells and Abilities)',
  ],
  examples: [
    "you may cast a creature, instant, sorcery, or planeswalker spell from your graveyard with mana value less than or equal to that spell's mana value without paying its mana cost",
    "cast an instant or sorcery spell from your graveyard with mana value less than or equal to that spell's mana value without paying its mana cost",
  ],
  rejects: [
    "you may cast a creature spell from your graveyard with mana value less than or equal to that spell's mana value without paying its mana cost",
    "you may cast a land or creature spell from your graveyard with mana value less than or equal to that spell's mana value without paying its mana cost",
    "you may cast an instant or sorcery spell from a graveyard with mana value less than or equal to that spell's mana value without paying its mana cost",
    "you may cast an instant or sorcery spell from your graveyard with mana value less than that spell's mana value without paying its mana cost",
    "you may cast an instant or sorcery spell from your graveyard with mana value less than or equal to that spell's mana value",
    "you may cast an instant or sorcery spell from your graveyard with mana value less than or equal to that spell's mana value without paying its mana cost and draw a card",
    "you may cast an instant or sorcery spell from your graveyard with mana value less than or equal to that card's mana value without paying its mana cost",
    "you may cast an instant or sorcery spell from your hand with mana value less than or equal to that spell's mana value without paying its mana cost",
  ],
  parse: (ctx, pos) => {
    const head = spanned(
      sequence(
        optional(literal('you may '), null),
        literal('cast '),
        pattern(/an? /iu),
        typeChoice(CARD_TYPES),
        literal(' spell from your graveyard with mana value less than or equal to '),
        family<IrAmount>('amount', { only: ['amount.that-spells-mana-value'] }),
        literal(' without paying its mana cost'),
        // Nothing joined to the clause: a join says a second instruction, which is not read.
        pattern(new RegExp(`${BOUNDARY}(?!,| and\\b| then\\b)`, 'u')),
      ),
    )(ctx, pos);
    if (!head.ok) return head;
    const [may, , , types, , limit] = head.value.value;
    // A land card is no spell (CR 305.1): never cast.
    if (types.includes('land')) return fail(ctx, pos);
    const span = head.value.span;
    const spells: IrNoun = {
      kind: 'noun',
      det: 'a',
      filter: {
        zone: 'graveyard',
        controller: 'you',
        card: true,
        anyOf: types.map((t) => ({ types: [t], raw: t })),
        raw: ctx.text.slice(span.start, span.end),
      },
      upTo: false,
      plural: false,
      other: false,
      span,
      rule: ID,
    };
    const args: Record<string, IrArg> = { spells, valueLimit: limit };
    return {
      ok: true,
      value: [
        { ...makeClause(ID, 'castChosenGraveyardSpell', args, span), optional: may !== null },
      ],
      pos: head.pos,
    };
  },
});

const CHOOSE_ID = 'effect.choose-graveyard-card-may-cast-it';

/**
 * `effect.choose-graveyard-card-may-cast-it`: "choose an instant or sorcery card in your graveyard. You may cast it this turn." with the rider "If that spell would be put into your graveyard,
 * exile it instead." (Mission Briefing; CR 608.2d the choice, 601.2 and 611.2a the permission until end of turn, 614.1a the rider). Not a target: the controller chooses the card as the effect
 * resolves. The engine's `mayCast` of a `choose` selector of the graveyard, with `exileInstead` for the rider. Not read: a land card, a graveyard that is not yours, a permission that is not
 * "this turn", paying or not paying the mana cost in another way, another rider, another thing done to the card, a second instruction joined to it.
 */
export const EFFECT_CHOOSE_GRAVEYARD_CARD_MAY_CAST_IT = defineRule<Clauses>({
  id: CHOOSE_ID,
  family: 'effect',
  leading: ['choose'],
  cites: [
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 601.2 (Casting Spells)',
    'CR 611.2a (Continuous Effects)',
    'CR 614.1a (Replacement Effects)',
  ],
  examples: [
    'choose an instant or sorcery card in your graveyard. you may cast it this turn',
    'choose an instant or sorcery card in your graveyard. you may cast it this turn. if that spell would be put into your graveyard, exile it instead',
    'choose a creature, instant, or sorcery card in your graveyard. you may cast it this turn',
  ],
  rejects: [
    'choose an instant or sorcery card in your graveyard',
    'choose an instant or sorcery card in a graveyard. you may cast it this turn',
    "choose an instant or sorcery card in an opponent's graveyard. you may cast it this turn",
    'choose a land card in your graveyard. you may cast it this turn',
    'choose a land or instant card in your graveyard. you may cast it this turn',
    'choose an instant or sorcery card in your graveyard. you may cast it',
    'choose an instant or sorcery card in your graveyard. you may cast it until end of turn',
    'choose an instant or sorcery card in your graveyard. you may cast it this turn and draw a card',
    'choose an instant or sorcery card in your graveyard. you may cast it this turn. if that spell would be put into a graveyard, exile it instead',
    'choose target instant or sorcery card in your graveyard. you may cast it this turn',
  ],
  parse: (ctx, pos) => {
    const head = spanned(
      sequence(
        literal('choose '),
        pattern(/an? /iu),
        choice(
          typeChoice(CARD_TYPES),
          map(pattern(new RegExp(`(?:${CARD_TYPES})${BOUNDARY}`, 'iu')), (m) => [
            m[0].toLowerCase(),
          ]),
        ),
        literal(' card in your graveyard. you may cast it this turn'),
        optional(spanned(EXILE_INSTEAD), null),
        // Nothing joined to the clause: a join says a second instruction, which is not read.
        pattern(/(?=\.|$)/u),
      ),
    )(ctx, pos);
    if (!head.ok) return head;
    const [, , types, , exileInstead] = head.value.value;
    if (types.includes('land')) return fail(ctx, pos);
    const span = head.value.span;
    const cards: IrNoun = {
      kind: 'noun',
      det: 'a',
      filter: {
        zone: 'graveyard',
        controller: 'you',
        card: true,
        anyOf: types.map((t) => ({ types: [t], raw: t })),
        raw: ctx.text.slice(span.start, span.end),
      },
      upTo: false,
      plural: false,
      other: false,
      span,
      rule: CHOOSE_ID,
    };
    const args: Record<string, IrArg> = {
      cards,
      exileInstead: flag(CHOOSE_ID, exileInstead !== null, span),
    };
    return {
      ok: true,
      value: [makeClause(CHOOSE_ID, 'mayCastChosenGraveyardCard', args, span)],
      pos: head.pos,
    };
  },
});

export const GYCAST_EFFECT_RULES = [
  EFFECT_CAST_GRAVEYARD_SPELL_FREE_VALUE_OF_THAT_SPELL,
  EFFECT_CHOOSE_GRAVEYARD_CARD_MAY_CAST_IT,
].map(quietly);
