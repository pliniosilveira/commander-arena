/**
 * Effect rules of stage P34 (D-151, D-152), the second half (the first is dragons.ts): shuffling a permanent into its owner's library and revealing the top card (CR 701.20, 701.24), looking at the top
 * card and taking it when it fits (CR 401.2), Behold (CR 701.4), paying any amount of a mana symbol (CR 603.12) and the rider of mana that
 * is spent on a spell (CR 106.6). Each says what the text says; what the engine can run is the lowering's business.
 */
import {
  choice,
  fail,
  literal,
  map,
  optional,
  type Parser,
  pattern,
  satisfy,
  sequence,
} from '../../combinators';
import type { IrAmount, IrFilter, IrNoun } from '../../ir/types';
import {
  PERMANENT_TYPES,
  permanentPhrase,
  spellPhrase,
  typeWords,
  withoutZone,
} from '../noun/phrases';
import { defineRule, family, quietly, spanned } from '../registry';
import { BOUNDARY, flag, number } from './dragons';
import { TAKEN_CARD } from './library';
import { type Clauses, makeClause } from './operands';
import { impliedYou } from './player';

/** A permanent card, as the filter of a card in a library: a card of any of the six permanent types (CR 110.1, 301 to 306). */
export const PERMANENT_CARD: IrFilter = {
  anyOf: ['artifact', 'creature', 'enchantment', 'land', 'planeswalker', 'battle'].map(
    (t): IrFilter => ({ types: [t], raw: t }),
  ),
  card: true,
  raw: 'permanent card',
};

/** "a permanent card", "a creature card", "a land card": what the card revealed must be. */
const REVEALED_CARD: Parser<IrFilter> = choice(
  map(pattern(new RegExp(`an? permanent card${BOUNDARY}`, 'iu')), () => PERMANENT_CARD),
  (ctx, pos) => {
    const r = sequence(
      pattern(/an? /iu),
      typeWords(PERMANENT_TYPES, false),
      pattern(new RegExp(` card${BOUNDARY}`, 'iu')),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, types] = r.value;
    return {
      ok: true,
      value: { types, card: true, raw: ctx.text.slice(pos, r.pos) },
      pos: r.pos,
    };
  },
);

/**
 * `effect.shuffle-reveal-top`: "The owner of target permanent shuffles it into their library, then reveals the top card of their library. If
 * it's a permanent card, they put it onto the battlefield." (CR 701.24, 701.20, 400.7: the permanent is a new object in the library; its owner
 * reveals the top card of the library after the shuffle). The two sentences are one instruction, kept together by the segmenter.
 */
export const EFFECT_SHUFFLE_REVEAL_TOP = defineRule<Clauses>({
  id: 'effect.shuffle-reveal-top',
  family: 'effect',
  leading: ['the'],
  cites: [
    'CR 701.24 (Shuffle)',
    'CR 701.20 (Reveal)',
    'CR 400.7 (General)',
    'CR 108.3 (Owner and Controller)',
  ],
  examples: [
    "the owner of target permanent shuffles it into their library, then reveals the top card of their library. if it's a permanent card, they put it onto the battlefield",
    'the owner of target creature shuffles it into their library, then reveals the top card of their library. if it’s a creature card, they put it onto the battlefield',
    "the owner of target artifact shuffles it into their library, then reveals the top card of their library. if it's a land card, they put it onto the battlefield",
  ],
  rejects: [
    "the owner of target permanent shuffles it into their library, then reveals the top card of their library. if it's a permanent card, they put it into their hand",
    'the owner of target permanent shuffles it into their library, then reveals the top card of their library',
    "the owner of target permanent shuffles it into their library, then reveals the top card of their library. if it's a card, they put it onto the battlefield",
    "the owner of target permanent shuffles it into their library, then reveals the top two cards of their library. if it's a permanent card, they put it onto the battlefield",
    "the owner of target permanent puts it into their library, then reveals the top card of their library. if it's a permanent card, they put it onto the battlefield",
    "the owner of each permanent shuffles it into their library, then reveals the top card of their library. if it's a permanent card, they put it onto the battlefield",
    "the owner of target permanent shuffles it into their library, then reveals the top card of their library. if it's a permanent card, they put it onto the battlefield tapped",
    "the owner of up to two target permanents shuffles it into their library, then reveals the top card of their library. if it's a permanent card, they put it onto the battlefield",
  ],
  parse: (ctx, pos) => {
    const id = 'effect.shuffle-reveal-top';
    const head = literal('the owner of ')(ctx, pos);
    if (!head.ok) return head;
    const objects = satisfy(
      family<IrNoun>('noun', { only: ['noun.target-permanent'] }),
      (noun) => noun.det === 'target' && !noun.plural && !noun.upTo && noun.count === undefined,
    )(ctx, head.pos);
    if (!objects.ok) return objects;
    const rest = sequence(
      pattern(
        / shuffles it into their library, then reveals the top card of their library\. if it['’]s /iu,
      ),
      spanned(REVEALED_CARD),
      pattern(new RegExp(`, they put it onto the battlefield${BOUNDARY}`, 'iu')),
    )(ctx, objects.pos);
    if (!rest.ok) return rest;
    const [, card] = rest.value;
    const revealed: IrNoun = {
      kind: 'noun',
      det: 'a',
      filter: card.value,
      upTo: false,
      plural: false,
      other: false,
      span: card.span,
      rule: id,
    };
    return {
      ok: true,
      value: [
        makeClause(
          id,
          'shuffleRevealTop',
          { objects: objects.value, revealed },
          {
            start: pos,
            end: rest.pos,
          },
        ),
      ],
      pos: rest.pos,
    };
  },
});

/**
 * `effect.look-top-take`: "Look at the top card of your library. If it's a creature card of the chosen type, you may reveal it and put it
 * into your hand." (CR 401.2, 701.20a: the card stays on top of the library unless it is taken). The two sentences are one instruction, kept
 * together by the segmenter; the card taken is one of a kind, which may be "of the chosen type" (CR 607.2d).
 */
export const EFFECT_LOOK_TOP_TAKE = defineRule<Clauses>({
  id: 'effect.look-top-take',
  family: 'effect',
  leading: ['look'],
  cites: ['CR 401.2 (Library)', 'CR 701.20a (Reveal)', 'CR 607.2d (Linked Abilities)'],
  examples: [
    "look at the top card of your library. if it's a creature card of the chosen type, you may reveal it and put it into your hand",
    'look at the top card of your library. if it’s a land card, you may reveal it and put it into your hand',
    "look at the top card of your library. if it's a Dragon card, you may reveal it and put it into your hand",
  ],
  rejects: [
    'look at the top card of your library',
    "look at the top card of your library. if it's a creature card, you may reveal it and put it onto the battlefield",
    "look at the top two cards of your library. if it's a creature card, you may reveal it and put it into your hand",
    "look at the top card of your library. if it's a creature card, you may put it into your hand",
    "look at the top card of your library. if it's a creature card of the chosen type, you may reveal it and put it into your hand and draw a card",
    "look at the top card of target player's library. if it's a creature card, you may reveal it and put it into your hand",
  ],
  parse: (ctx, pos) => {
    const id = 'effect.look-top-take';
    const head = pattern(/look at the top card of your library\. if it['’]s /iu)(ctx, pos);
    if (!head.ok) return head;
    const card = TAKEN_CARD(ctx, head.pos);
    if (!card.ok) return card;
    const chosen = optional(
      map(pattern(new RegExp(` of the chosen type${BOUNDARY}`, 'iu')), () => 'type' as const),
      null,
    )(ctx, card.pos);
    if (!chosen.ok) return chosen;
    const tail = pattern(
      new RegExp(`, you may reveal it and put it into your hand${BOUNDARY}`, 'iu'),
    )(ctx, chosen.pos);
    if (!tail.ok) return tail;
    const span = { start: pos, end: tail.pos };
    const take: IrNoun = {
      ...card.value,
      filter: chosen.value === null ? card.value.filter : { ...card.value.filter, chosen: 'type' },
      rule: id,
    };
    return {
      ok: true,
      value: [
        makeClause(
          id,
          'lookTake',
          {
            count: number(1, {
              start: pos + 'look at the '.length,
              end: pos + 'look at the top card'.length,
            }),
            take,
            toGraveyard: flag(id, false, span),
            ontoBattlefield: flag(id, false, span),
            onTop: flag(id, true, span),
          },
          span,
        ),
      ],
      pos: tail.pos,
    };
  },
});

/**
 * `effect.behold`: "behold a Dragon" (CR 701.4: choose a permanent you control with the quality or reveal a card with it from your hand). The
 * quality is what a noun phrase of permanents says: a creature type, a card type, a color. "You may behold ... If you do, ..." is the offer the
 * sentences around it make; the action itself says no player.
 */
export const EFFECT_BEHOLD = defineRule<Clauses>({
  id: 'effect.behold',
  family: 'effect',
  leading: ['behold'],
  cites: ['CR 701.4 (Behold)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: [
    'behold a Dragon',
    'behold an artifact',
    'behold a Dragon creature',
    'behold a red creature',
  ],
  rejects: [
    'behold',
    'behold Dragon',
    'behold two Dragons',
    'behold a Dragon you control',
    'behold target Dragon',
    'behold a Dragon and draw a card',
    'beholds a Dragon',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.behold';
    const r = sequence(
      literal('behold '),
      pattern(/an? /iu),
      spanned(map(permanentPhrase(false, 'all'), withoutZone)),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, , what] = r.value;
    if (what.value.controller !== undefined) return fail(ctx, pos);
    const noun: IrNoun = {
      kind: 'noun',
      det: 'a',
      filter: what.value,
      upTo: false,
      plural: false,
      other: false,
      span: what.span,
      rule: id,
    };
    return {
      ok: true,
      value: [makeClause(id, 'behold', { what: noun }, { start: pos, end: r.pos })],
      pos: r.pos,
    };
  },
});

/**
 * `effect.pay-any-amount`: "pay any amount of {R}" (CR 118.1, 603.12: the player chooses how many times to pay one mana symbol, from none to
 * as many as they can pay). "You may" makes it an offer and "When you do, ..." says what it buys: the lowering of the sentences reads the two.
 */
export const EFFECT_PAY_ANY_AMOUNT = defineRule<Clauses>({
  id: 'effect.pay-any-amount',
  family: 'effect',
  leading: ['pay'],
  cites: [
    'CR 118.1 (Costs)',
    'CR 603.12 (Handling Triggered Abilities)',
    'CR 107.4 (Numbers and Symbols)',
  ],
  examples: ['pay any amount of {R}', 'pay any amount of {G}', 'pay any amount of {C}'],
  rejects: [
    'pay any amount of {R}{R}',
    'pay any amount of {X}',
    'pay any amount of {R/G}',
    'pay any amount of mana',
    'pay any amount of life',
    'pay an amount of {R}',
    'pay any amount of {R} and draw a card',
    'pay any amount {R}',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.pay-any-amount';
    const r = sequence(
      literal('pay any amount of '),
      spanned(pattern(new RegExp(`\\{([WUBRGC])\\}${BOUNDARY}`, 'u'))),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, symbol] = r.value;
    const letter = symbol.value[1] ?? '';
    return {
      ok: true,
      value: [
        makeClause(
          id,
          'payAnyAmount',
          {
            mana: {
              kind: 'manaSpec',
              what: { kind: 'symbols', symbols: [letter] },
              span: symbol.span,
              rule: id,
            },
          },
          { start: pos, end: r.pos },
        ),
      ],
      pos: r.pos,
    };
  },
});

/**
 * `effect.mana-rider`: "If that mana is spent on a Dragon creature spell, it gains haste until end of turn." (CR 106.6, 702.10: mana a
 * mana ability adds may carry a rider that works on the spell it is spent on; here the spell, if it becomes a permanent, has haste until end
 * of turn). It says something about the mana ability before it: the lowering of that ability reads it; anywhere else it is read and not run.
 */
export const EFFECT_MANA_RIDER = defineRule<Clauses>({
  id: 'effect.mana-rider',
  family: 'effect',
  leading: ['if'],
  cites: ['CR 106.6 (Mana)', 'CR 702.10 (Haste)', 'CR 605.1a (Mana Abilities)'],
  examples: [
    'if that mana is spent on a Dragon creature spell, it gains haste until end of turn',
    'if that mana is spent on a creature spell, it gains haste until end of turn',
    'if that mana is spent on an Elf spell, it gains haste until end of turn',
  ],
  rejects: [
    'if that mana is spent on a Dragon creature spell, it gains haste',
    'if that mana is spent on a Dragon creature spell, it gains flying until end of turn',
    'if that mana is spent on a Dragon creature spell, that spell gains haste until end of turn',
    'if that mana is spent on a Dragon creature spell, it gains haste until end of turn and you draw a card',
    'if that mana is spent on Dragon creature spells, it gains haste until end of turn',
    'if that mana is spent on a spell, it gains haste until end of turn',
    'if this mana is spent on a Dragon creature spell, it gains haste until end of turn',
    'if that mana is spent on an ability, it gains haste until end of turn',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.mana-rider';
    const r = sequence(
      pattern(/if that mana is spent on an? /iu),
      spanned(spellPhrase(false)),
      pattern(new RegExp(`, it gains haste until end of turn${BOUNDARY}`, 'iu')),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, spell] = r.value;
    const filter = spell.value;
    // A spell is named by its card types or its creature types: "a spell" says nothing the engine's rider could use.
    if (filter.types === undefined && filter.subtypes === undefined && filter.anyOf === undefined) {
      return fail(ctx, pos);
    }
    const noun: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter,
      upTo: false,
      plural: true,
      other: false,
      span: spell.span,
      rule: id,
    };
    return {
      ok: true,
      value: [makeClause(id, 'spentRider', { spells: noun }, { start: pos, end: r.pos })],
      pos: r.pos,
    };
  },
});

/**
 * `effect.damage-other-targets`: "3 damage to each of up to two other targets", the second instruction of "~ deals 4 damage to any target and 3
 * damage to each of up to two other targets" (CR 120.3, 115.3: the same source deals the damage, to targets that are none of the targets of the
 * slot before). It has no subject of its own: the lowering reads it only after a damage instruction of the same sentence that names none either.
 */
export const EFFECT_DAMAGE_OTHER_TARGETS = defineRule<Clauses>({
  id: 'effect.damage-other-targets',
  family: 'effect',
  leading: [],
  cites: ['CR 120.3 (Damage)', 'CR 115.3 (Targets)', 'CR 601.2c (Casting Spells)'],
  examples: [
    '3 damage to each of up to two other targets',
    '2 damage to up to two other targets',
    'X damage to each of up to three other targets',
  ],
  rejects: [
    '3 damage to each of up to two targets',
    '3 damage to any target',
    'deals 3 damage to each of up to two other targets',
    '3 to each of up to two other targets',
    '3 damage each of up to two other targets',
    '3 damage to each of up to two other targets and draw a card',
    'a damage to each of up to two other targets',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.damage-other-targets';
    const r = sequence(
      family<IrAmount>('amount', { only: ['amount.number', 'amount.x'] }),
      literal(' damage to '),
      family<IrNoun>('noun', { only: ['noun.other-targets'] }),
    )(ctx, pos);
    if (!r.ok) return r;
    const [amount, , to] = r.value;
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: [makeClause(id, 'dealDamage', { amount, to, sameSource: flag(id, true, span) }, span)],
      pos: r.pos,
    };
  },
});

/**
 * `effect.discard-any-number`: "Discard any number of cards." (CR 701.9: the player chooses none, some or all of the cards in their hand). What was
 * discarded is what "that many" counts afterwards ("then draw that many cards").
 */
export const EFFECT_DISCARD_ANY_NUMBER = defineRule<Clauses>({
  id: 'effect.discard-any-number',
  family: 'effect',
  leading: ['discard'],
  cites: [
    'CR 701.9 (Discard)',
    'CR 701.9b (Discard)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: ['discard any number of cards', 'Discard any number of cards'],
  rejects: [
    'discard any number of creature cards',
    'discard any number of card',
    'discard any number',
    'discards any number of cards',
    'discard any number of cards at random',
    'discard any number of cards and draw a card',
    'discard up to two cards',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.discard-any-number';
    const r = spanned(pattern(new RegExp(`discard any number of cards${BOUNDARY}`, 'iu')))(
      ctx,
      pos,
    );
    if (!r.ok) return r;
    return {
      ok: true,
      value: [
        makeClause(
          id,
          'discard',
          {
            player: impliedYou(id, pos),
            amount: number(0, r.value.span),
            anyNumber: flag(id, true, r.value.span),
          },
          r.value.span,
        ),
      ],
      pos: r.pos,
    };
  },
});

/**
 * `effect.mana-rider-scry`: "When that mana is spent to cast a creature spell that shares a creature type with your commander, scry 1." (CR 106.6, 603.2,
 * 701.22a, 903.3: mana a mana ability adds may carry an ability that triggers when it is spent on a spell; here the controller of the permanent scries). Like
 * `effect.mana-rider` it says something about the mana ability before it, which the lowering of that ability reads. Only the spell that shares a creature type with
 * the commander, and a scry of a number.
 */
export const EFFECT_MANA_RIDER_SCRY = defineRule<Clauses>({
  id: 'effect.mana-rider-scry',
  family: 'effect',
  leading: ['when'],
  cites: [
    'CR 106.6 (Mana)',
    'CR 603.2 (Triggered Abilities)',
    'CR 701.22a (Scry)',
    'CR 903.3 (Commander)',
  ],
  examples: [
    'when that mana is spent to cast a creature spell that shares a creature type with your commander, scry 1',
    'when that mana is spent to cast a creature spell that shares a creature type with your commander, scry 2',
  ],
  rejects: [
    'when that mana is spent to cast a creature spell that shares a creature type with your commander, scry',
    'when that mana is spent to cast a creature spell that shares a creature type with your commander, draw a card',
    'when that mana is spent to cast a creature spell, scry 1',
    'when that mana is spent to cast a creature spell that shares a creature type with target creature, scry 1',
    'when that mana is spent to cast a creature spell that shares a creature type with your commander, scry 1 and draw a card',
    'when that mana is spent to cast a creature spell that shares a creature type with your commander, scry X',
    'when that mana is spent to activate an ability that shares a creature type with your commander, scry 1',
    'when this mana is spent to cast a creature spell that shares a creature type with your commander, scry 1',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.mana-rider-scry';
    const r = sequence(
      pattern(/when that mana is spent to cast an? /iu),
      spanned(spellPhrase(false)),
      literal(' that shares a creature type with your commander, scry '),
      family<IrAmount>('amount', { only: ['amount.number'] }),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, spell, , count] = r.value;
    const end = r.pos;
    const filter = spell.value;
    if (filter.types === undefined && filter.subtypes === undefined && filter.anyOf === undefined) {
      return fail(ctx, pos);
    }
    const noun: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter,
      upTo: false,
      plural: true,
      other: false,
      span: spell.span,
      rule: id,
    };
    return {
      ok: true,
      value: [
        makeClause(
          id,
          'spentRider',
          {
            spells: noun,
            scry: count,
            sharesCreatureTypeWithCommander: flag(id, true, spell.span),
          },
          { start: pos, end },
        ),
      ],
      pos: end,
    };
  },
});

/**
 * `effect.mana-rider-scry-commander`: "When you spend this mana to cast your commander, scry X, where X is the number of times it's been cast from the command zone
 * this game." (CR 106.6, 603.2, 701.22a, 903.3, 903.8: mana a mana ability adds may carry an ability that triggers when it is spent on a spell; the controller scries as
 * many as the times that commander has been cast from the command zone, this cast included). Like `effect.mana-rider-scry` it says something about the mana ability
 * before it, which the lowering of that ability reads. Only "your commander" and that count.
 */
export const EFFECT_MANA_RIDER_SCRY_COMMANDER = defineRule<Clauses>({
  id: 'effect.mana-rider-scry-commander',
  family: 'effect',
  leading: ['when'],
  cites: [
    'CR 106.6 (Mana)',
    'CR 603.2 (Triggered Abilities)',
    'CR 701.22a (Scry)',
    'CR 903.8 (Commander)',
  ],
  examples: [
    "when you spend this mana to cast your commander, scry x, where x is the number of times it's been cast from the command zone this game",
  ],
  rejects: [
    "when you spend this mana to cast your commander, scry 1, where x is the number of times it's been cast from the command zone this game",
    "when you spend this mana to cast a commander, scry x, where x is the number of times it's been cast from the command zone this game",
    "when you spend this mana to cast your commander, scry x, where x is the number of times it's been cast this game",
    "when you spend this mana to cast your commander, scry x, where x is the number of times it's been cast from your hand this game",
    "when that mana is spent to cast your commander, scry x, where x is the number of times it's been cast from the command zone this game",
    "when you spend this mana to cast your commander, draw x, where x is the number of times it's been cast from the command zone this game",
    "when you spend this mana to cast your commander, scry x, where x is the number of times it's been cast from the command zone",
    "when you spend this mana to cast your commander, scry x, where x is the number of times it's been cast from the command zone this turn",
  ],
  parse: (ctx, pos) => {
    const id = 'effect.mana-rider-scry-commander';
    const r = pattern(
      /when you spend this mana to cast your commander, scry x, where x is the number of times it['’]s been cast from the command zone this game(?![\p{L}\p{N}])/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: [makeClause(id, 'spentRider', { commanderCastScry: flag(id, true, span) }, span)],
      pos: r.pos,
    };
  },
});

export const DRAGON_LIBRARY_EFFECT_RULES = [
  EFFECT_SHUFFLE_REVEAL_TOP,
  EFFECT_LOOK_TOP_TAKE,
  EFFECT_BEHOLD,
  EFFECT_PAY_ANY_AMOUNT,
  EFFECT_MANA_RIDER,
  EFFECT_MANA_RIDER_SCRY,
  EFFECT_MANA_RIDER_SCRY_COMMANDER,
  EFFECT_DAMAGE_OTHER_TARGETS,
  EFFECT_DISCARD_ANY_NUMBER,
].map(quietly);
