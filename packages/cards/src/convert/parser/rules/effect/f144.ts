/**
 * Effect rules of deck support issue 144 (the Goblin deck): casting a card of your own graveyard without paying its mana cost, and exiling the top card of the library of the player a
 * trigger is about.
 */
import { choice, literal, map, optional, pattern, satisfy, sequence } from '../../combinators';
import type { IrArg, IrDuration, IrFilter, IrNoun } from '../../ir/types';
import { quantity } from '../amount/index';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, family, quietly, spanned } from '../registry';
import { flag } from './dragons';
import { type Clauses, makeClause, single } from './operands';

/** ". If that spell would be put into your graveyard, exile it instead": the rider, the next sentence, taken with the clause (CR 614.1a). */
export const EXILE_INSTEAD = pattern(
  new RegExp(
    `\\. if that spell would be put into your graveyard, exile it instead${BOUNDARY}(?!,| and\\b| then\\b)`,
    'iu',
  ),
);

const CAST_ID = 'effect.cast-own-graveyard-card-free';

/** An instant card, a sorcery card or a choice of the two: the cards a spell can be, which the engine's cast of a card as an effect runs and tests (a permanent card is not read). */
export function isInstantOrSorcery(filter: IrFilter): boolean {
  const kinds = filter.anyOf ?? [filter];
  const one = (f: IrFilter): boolean =>
    f.anyOf === undefined &&
    f.subtypes === undefined &&
    f.types?.length === 1 &&
    (f.types[0] === 'instant' || f.types[0] === 'sorcery');
  return (
    kinds.length > 0 &&
    kinds.every(one) &&
    (filter.anyOf === undefined || filter.types === undefined || filter.types.length === 0)
  );
}

/**
 * `effect.cast-own-graveyard-card-free`: "(you may) cast target instant or sorcery card with mana value 3 or less from your graveyard without paying its mana cost", with the rider "If
 * that spell would be put into your graveyard, exile it instead" (Goblin Dark-Dwellers; CR 115.1, 601.2, 608.2g, 118.9, 614.1a). The engine's `castCard` with `free` on one target card of
 * the controller's own graveyard, as `effect.cast-graveyard-card` reads one of any graveyard. "You may" is the choice the effect asks for itself (the sentence's own "you may" of a
 * trigger or the words of the rule). Not read: a graveyard that is not yours, several cards, "up to", paying the mana cost, mana of any type, a cast not "without paying its mana
 * cost", another thing done to the spell.
 */
export const EFFECT_CAST_OWN_GRAVEYARD_CARD_FREE = defineRule<Clauses>({
  id: CAST_ID,
  family: 'effect',
  leading: ['cast', 'you'],
  cites: [
    'CR 115.1 (Targets)',
    'CR 601.2 (Casting Spells)',
    'CR 608.2g (Resolving Spells and Abilities)',
    'CR 118.9 (Alternative Costs)',
    'CR 614.1a (Replacement Effects)',
  ],
  examples: [
    'you may cast target instant or sorcery card with mana value 3 or less from your graveyard without paying its mana cost',
    'cast target instant or sorcery card with mana value 3 or less from your graveyard without paying its mana cost',
    'you may cast target instant or sorcery card with mana value 3 or less from your graveyard without paying its mana cost. if that spell would be put into your graveyard, exile it instead',
    'you may cast target sorcery card from your graveyard without paying its mana cost',
  ],
  rejects: [
    'you may cast target instant or sorcery card with mana value 3 or less from a graveyard without paying its mana cost',
    "you may cast target instant or sorcery card from an opponent's graveyard without paying its mana cost",
    'you may cast up to one target instant or sorcery card from your graveyard without paying its mana cost',
    'you may cast two target instant or sorcery cards from your graveyard without paying their mana costs',
    'you may cast target instant or sorcery card from your graveyard',
    'you may cast target creature card from your graveyard without paying its mana cost',
    'you may cast target card from your graveyard without paying its mana cost',
    'you may cast target instant or sorcery card from your graveyard without paying its mana cost and draw a card',
    'you may cast target instant or sorcery card from your graveyard without paying its mana cost. if that spell would be put into a graveyard, exile it instead',
    'you may cast target instant or sorcery card from your graveyard without paying its mana cost. if that spell would be put into your graveyard, exile it instead, then draw a card',
    'you may cast target instant or sorcery card from your graveyard without paying its mana cost this turn',
  ],
  parse: single(
    CAST_ID,
    sequence(
      optional(spanned(literal('you may ')), null),
      literal('cast '),
      satisfy(
        family<IrNoun>('noun', { only: ['noun.target-graveyard-card'] }),
        (noun) =>
          noun.filter.controller === 'you' &&
          noun.count === undefined &&
          !noun.upTo &&
          !noun.plural &&
          isInstantOrSorcery(noun.filter),
      ),
      literal(' without paying its mana cost'),
      optional(spanned(EXILE_INSTEAD), null),
      // Nothing joined to the clause: a join says a second instruction, which is not read.
      pattern(/(?=\.|$)/u),
    ),
    ([may, , objects, , exileInstead]) => ({
      verb: 'castCard',
      args: {
        objects,
        may: flag(CAST_ID, may !== null, objects.span),
        free: flag(CAST_ID, true, objects.span),
        exileInstead: flag(CAST_ID, exileInstead !== null, objects.span),
      },
    }),
  ),
});

const CHOOSE_ID = 'effect.cast-chosen-graveyard-spell-free';

/**
 * `effect.cast-chosen-graveyard-spell-free`: "you may cast an instant or sorcery spell from your graveyard with mana value 4 or less without paying its mana cost", with the rider "If that spell
 * would be put into your graveyard, exile it instead" (Diviner of Mist, issue 102; CR 608.2g, 118.9, 614.1a). Not a target: the controller chooses the card as the effect resolves. The
 * engine's `castFree` of a choice from the graveyard, with `exileInstead`. Not read: another kind of spell, a graveyard that is not yours, a mana value that is not "N or less" (N from 1 to 9),
 * paying the mana cost, a rider about a graveyard that is not yours, another thing done to the spell.
 */
export const EFFECT_CAST_CHOSEN_GRAVEYARD_SPELL_FREE = defineRule<Clauses>({
  id: CHOOSE_ID,
  family: 'effect',
  leading: ['cast', 'you'],
  cites: [
    'CR 608.2g (Resolving Spells and Abilities)',
    'CR 118.9 (Alternative Costs)',
    'CR 614.1a (Replacement Effects)',
    'CR 202.3 (Mana Value)',
  ],
  examples: [
    'you may cast an instant or sorcery spell from your graveyard with mana value 4 or less without paying its mana cost',
    'cast an instant or sorcery spell from your graveyard with mana value 4 or less without paying its mana cost',
    'you may cast an instant or sorcery spell from your graveyard with mana value 4 or less without paying its mana cost. if that spell would be put into your graveyard, exile it instead',
  ],
  rejects: [
    'you may cast an instant or sorcery spell from a graveyard with mana value 4 or less without paying its mana cost',
    'you may cast a creature spell from your graveyard with mana value 4 or less without paying its mana cost',
    'you may cast an instant or sorcery spell from your graveyard with mana value 4 or more without paying its mana cost',
    'you may cast an instant or sorcery spell from your graveyard with mana value 4 or less',
    'you may cast an instant or sorcery spell from your graveyard without paying its mana cost',
    'you may cast an instant or sorcery spell from your graveyard with mana value 4 or less without paying its mana cost and draw a card',
    'you may cast an instant or sorcery spell from your graveyard with mana value 4 or less without paying its mana cost. if that spell would be put into a graveyard, exile it instead',
    'you may cast an instant or sorcery spell from your graveyard with mana value 4 or less without paying its mana cost this turn',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        new RegExp(
          `(you may )?cast an instant or sorcery spell from your graveyard with mana value ([1-9]) or less without paying its mana cost(\\. if that spell would be put into your graveyard, exile it instead)?${BOUNDARY}(?!,| and\\b| then\\b| this turn)`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, may, value, rider] = r.value.value;
    const span = r.value.span;
    const args: Record<string, IrArg> = {
      limit: { kind: 'number', value: Number(value), span },
      ...(rider === undefined ? {} : { exileInstead: flag(CHOOSE_ID, true, span) }),
    };
    return {
      ok: true,
      value: [
        {
          ...makeClause(CHOOSE_ID, 'castChosenGraveyardSpell', args, span),
          optional: may !== undefined,
        },
      ],
      pos: r.pos,
    };
  },
});

const TOP_ID = 'effect.exile-top-of-that-player';

/**
 * `effect.exile-top-of-that-player`: "exile the top card of that player's library", "exile the top two cards of that player's library" (CR 701.13, 401: the controller of the effect
 * exiles the cards one after the other, face up, from the library of the player an earlier part of the text named; in a trigger about a player, the player of the event). The cards
 * belong to that player and are what "that card" names afterwards. The engine's `exileTop` with `from`. Not read: your own library or each player's, "target player's", the cards face
 * down, a number of 0 or 1 in the plural, a second instruction in the same sentence.
 */
export const EFFECT_EXILE_TOP_OF_THAT_PLAYER = defineRule<Clauses>({
  id: TOP_ID,
  family: 'effect',
  leading: ['exile'],
  cites: ['CR 701.13 (Exile)', 'CR 401.1 (Library)', 'CR 603.2 (Handling Triggered Abilities)'],
  examples: [
    "exile the top card of that player's library",
    'exile the top card of that player’s library',
    "exile the top two cards of that player's library",
  ],
  rejects: [
    "exile the top card of target player's library",
    "exile the top card of each player's library",
    'exile the top card of your library',
    "exile the top card of that player's library face down",
    "exile the top one cards of that player's library",
    "exile the top two card of that player's library",
    "exile the top cards of that player's library",
    "exile the top card of that player's graveyard",
    "exile the top card of that player's library and draw a card",
    "exile top card of that player's library",
  ],
  parse: (ctx, pos) => {
    const head = literal('exile the top ')(ctx, pos);
    if (!head.ok) return head;
    const counted = spanned(
      choice<number>(
        map(pattern(new RegExp(`card${BOUNDARY}`, 'iu')), () => 1),
        map(
          sequence(
            satisfy(quantity, (n) => n >= 2),
            pattern(new RegExp(` cards${BOUNDARY}`, 'iu')),
          ),
          ([n]) => n,
        ),
      ),
    )(ctx, head.pos);
    if (!counted.ok) return counted;
    const owner = sequence(
      literal(' of '),
      spanned(pattern(/that player/iu)),
      pattern(/['’]s library(?![\p{L}\p{N}])(?! face down)(?!,| and\b| then\b)/iu),
    )(ctx, counted.pos);
    if (!owner.ok) return owner;
    const [, who] = owner.value;
    const { value, span } = counted.value;
    const player: IrNoun = {
      kind: 'noun',
      det: 'anaphor',
      filter: { raw: 'that player' },
      upTo: false,
      plural: false,
      other: false,
      span: who.span,
      rule: TOP_ID,
    };
    return {
      ok: true,
      value: [
        makeClause(
          TOP_ID,
          'exileTop',
          { count: { kind: 'number', value, span }, from: player },
          { start: pos, end: owner.pos },
        ),
      ],
      pos: owner.pos,
    };
  },
});

const SPEND_ID = 'effect.may-cast-spend-any-color';

/**
 * `effect.may-cast-spend-any-color`: "Until end of turn, you may cast that card and you may spend mana as though it were mana of any color to cast that spell." (Grenzo, Havoc Raiser; CR
 * 601.2, 609.4b, 611.2a: until the end of the turn the controller may cast the card an earlier instruction exiled, and pay for the spell with mana of any color for any colored symbol).
 * The engine's `mayPlay` with `castOnly` and `anyManaColor`. The card is the one of the "exile" before it, which the lowering requires. Not read: a land to play, another length,
 * "mana of any type", "that card" left out, another thing said of the spell.
 */
export const EFFECT_MAY_CAST_SPEND_ANY_COLOR = defineRule<Clauses>({
  id: SPEND_ID,
  family: 'effect',
  leading: ['until'],
  cites: [
    'CR 601.2 (Casting Spells)',
    'CR 609.4b (Effects)',
    'CR 611.2a (Continuous Effects)',
    'CR 701.13 (Exile)',
  ],
  examples: [
    'until end of turn, you may cast that card and you may spend mana as though it were mana of any color to cast that spell',
  ],
  rejects: [
    'until end of turn, you may cast that card and you may spend mana as though it were mana of any type to cast that spell',
    'until end of turn, you may play that card and you may spend mana as though it were mana of any color to cast that spell',
    'until the end of your next turn, you may cast that card and you may spend mana as though it were mana of any color to cast that spell',
    'you may cast that card and you may spend mana as though it were mana of any color to cast that spell',
    'until end of turn, you may cast that card and you may spend mana as though it were mana of any color to cast it',
    'until end of turn, you may cast that card and you may spend mana as though it were mana of any color to cast that spell and draw a card',
    'until end of turn, you may cast target card and you may spend mana as though it were mana of any color to cast that spell',
    'until end of turn, you may cast those cards and you may spend mana as though it were mana of any color to cast that spell',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        new RegExp(
          `until end of turn, you may cast that card and you may spend mana as though it were mana of any color to cast that spell${BOUNDARY}(?!,| and\\b| then\\b)`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const { span } = r.value;
    const duration: IrDuration = {
      kind: 'duration',
      scope: 'untilEndOfTurn',
      span,
      rule: SPEND_ID,
    };
    return {
      ok: true,
      value: [
        {
          ...makeClause(
            SPEND_ID,
            'mayPlay',
            { castOnly: flag(SPEND_ID, true, span), anyManaColor: flag(SPEND_ID, true, span) },
            span,
          ),
          duration,
        },
      ],
      pos: r.pos,
    };
  },
});

const PUT_ID = 'effect.put-exiled-into-your-graveyard';

/**
 * `effect.put-exiled-into-your-graveyard`: "put them into your graveyard", with the lead "if any of those cards remain exiled, " (Glimpse the Impossible; CR 400.7, 404.1, 608.2c): the
 * cards the instruction before it exiled that are still in exile (a card that left exile is a new object and is not moved) go to the graveyard of their owner, the controller of the
 * effect. The engine's `moveToZone` of `moved` to the graveyard; the lowering refuses it where no exile of the top cards of the library comes before it. Not read: "it" or "that card",
 * another zone, "their owner's graveyard", another condition, another instruction joined to it.
 */
export const EFFECT_PUT_EXILED_INTO_YOUR_GRAVEYARD = defineRule<Clauses>({
  id: PUT_ID,
  family: 'effect',
  leading: ['if', 'put'],
  cites: [
    'CR 400.7 (General)',
    'CR 404.1 (Graveyard)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    'put them into your graveyard',
    'if any of those cards remain exiled, put them into your graveyard',
  ],
  rejects: [
    'put it into your graveyard',
    'put that card into your graveyard',
    'put them into a graveyard',
    "put them into their owner's graveyard",
    'put them into your hand',
    'if any of those cards remain exiled, put them into your hand',
    'if all of those cards remain exiled, put them into your graveyard',
    'if any of those cards remain exiled put them into your graveyard',
    'if any of those cards remain, put them into your graveyard',
  ],
  parse: single(
    PUT_ID,
    sequence(
      optional(literal('if any of those cards remain exiled, '), null),
      pattern(new RegExp(`put them into your graveyard${BOUNDARY}(?!['’])`, 'iu')),
    ),
    () => ({ verb: 'putExiledIntoGraveyard', args: {} }),
  ),
});

/** Tried first: "until end of turn, you may cast that card" is the first words of `effect.may-play`. */
export const F144_FIRST_EFFECT_RULES = [EFFECT_MAY_CAST_SPEND_ANY_COLOR].map(quietly);

export const F144_EFFECT_RULES = [
  EFFECT_CAST_OWN_GRAVEYARD_CARD_FREE,
  EFFECT_CAST_CHOSEN_GRAVEYARD_SPELL_FREE,
  EFFECT_PUT_EXILED_INTO_YOUR_GRAVEYARD,
  EFFECT_EXILE_TOP_OF_THAT_PLAYER,
].map(quietly);
