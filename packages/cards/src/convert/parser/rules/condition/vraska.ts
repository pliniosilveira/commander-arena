/**
 * Conditions of the Vraska deck (stage P49, D-206): "at least four mana was spent to cast it" (CR 601.2h), "a card left your graveyard this turn"
 * (CR 400.7) and "~ was cast from a graveyard" (CR 601.2a). Each is read as the intervening "if" of a triggered ability or as the condition of an
 * "if" sentence of a spell; the engine refuses where no spell, event or source exists to ask.
 */
import { fail, map, pattern, sequence } from '../../combinators';
import type { IrCondition, IrNoun } from '../../ir/types';
import { quantity } from '../amount/index';
import { permanentPhrase, withoutZone } from '../noun/phrases';
import { defineRule, spanned } from '../registry';

/**
 * `condition.mana-spent-at-least`: "at least four mana was spent to cast it" (CR 601.2h: the mana paid for the spell's cost, which the engine counts as the
 * spell is cast; D-183). "It" is the spell that caused a cast trigger. The engine's `manaSpentAtLeast`. Not read: "at most", a mana of a kind ("at least
 * {R}{R} was spent"), another spell ("to cast this spell"), the plural verb.
 */
export const CONDITION_MANA_SPENT_AT_LEAST = defineRule<IrCondition>({
  id: 'condition.mana-spent-at-least',
  family: 'condition',
  leading: ['at'],
  cites: ['CR 601.2h (Casting Spells)', 'CR 603.4 (Handling Triggered Abilities)'],
  examples: [
    'at least four mana was spent to cast it',
    'at least 4 mana was spent to cast it',
    'at least two mana was spent to cast it',
  ],
  rejects: [
    'at least four mana was spent to cast it.',
    'at most four mana was spent to cast it',
    'at least four mana were spent to cast it',
    'at least {R}{R} was spent to cast it',
    'at least four mana was spent to cast this spell',
    'at least four mana was spent',
    'at least four was spent to cast it',
    'at least zero mana was spent to cast it',
  ],
  parse: (ctx, pos) => {
    const lead = pattern(/at least /iu)(ctx, pos);
    if (!lead.ok) return lead;
    const n = quantity(ctx, lead.pos);
    if (!n.ok) return n;
    if (n.value < 1) return fail(ctx, pos);
    const tail = spanned(pattern(/ mana was spent to cast it(?![\p{L}\p{N}])/iu))(ctx, n.pos);
    if (!tail.ok) return tail;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'manaSpentAtLeast', count: n.value },
        span: { start: pos, end: tail.pos },
        rule: 'condition.mana-spent-at-least',
      },
      pos: tail.pos,
    };
  },
});

/**
 * `condition.card-left-graveyard`: "a card left your graveyard this turn" (CR 400.7: the turn log of cards that left a graveyard, to any zone). The
 * engine's `cardLeftYourGraveyard`, read as the event happens and again as the ability resolves (CR 603.4). Not read: another player's graveyard, a
 * count ("two or more cards"), "a creature card", another time ("last turn").
 */
export const CONDITION_CARD_LEFT_GRAVEYARD = defineRule<IrCondition>({
  id: 'condition.card-left-graveyard',
  family: 'condition',
  leading: ['a'],
  cites: ['CR 400.7 (General)', 'CR 603.4 (Handling Triggered Abilities)'],
  examples: ['a card left your graveyard this turn'],
  rejects: [
    'a card left your graveyard this turn.',
    'a card left a graveyard this turn',
    "a card left an opponent's graveyard this turn",
    'a creature card left your graveyard this turn',
    'two cards left your graveyard this turn',
    'a card left your graveyard',
    'a card leaves your graveyard this turn',
    'a card left your hand this turn',
  ],
  parse: (ctx, pos) => {
    const r = spanned(pattern(/a card left your graveyard this turn(?![\p{L}\p{N}])/iu))(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'cardLeftYourGraveyard' },
        span: { start: pos, end: r.pos },
        rule: 'condition.card-left-graveyard',
      },
      pos: r.pos,
    };
  },
});

/**
 * `condition.cast-from-graveyard`: "~ was cast from a graveyard" (CR 601.2a, 603.4; the card's own name or "this spell" reads as `~`): the spell the
 * text belongs to was cast from a graveyard (with Flashback or any other permission). The engine's `castFromZone` of the graveyard. Not read: another
 * zone, "from your graveyard" (the zone is the owner's graveyard either way, but the words are not those of the card), another spell ("that spell").
 */
export const CONDITION_CAST_FROM_GRAVEYARD = defineRule<IrCondition>({
  id: 'condition.cast-from-graveyard',
  family: 'condition',
  leading: ['~'],
  cites: ['CR 601.2a (Casting Spells)', 'CR 603.4 (Handling Triggered Abilities)'],
  examples: ['~ was cast from a graveyard'],
  rejects: [
    '~ was cast from a graveyard.',
    '~ was cast from your graveyard',
    '~ was cast from exile',
    '~ was cast from your hand',
    '~ was cast',
    '~ was not cast from a graveyard',
    '~ was cast from a graveyard or exile',
    'that spell was cast from a graveyard',
  ],
  parse: (ctx, pos) => {
    const r = spanned(pattern(/~ was cast from a graveyard(?![\p{L}\p{N}])(?! or)/iu))(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'castFromZone', zone: 'graveyard' },
        span: { start: pos, end: r.pos },
        rule: 'condition.cast-from-graveyard',
      },
      pos: r.pos,
    };
  },
});

/**
 * `condition.it-targets`: "it targets a tapped creature" (CR 601.2c, 601.2f, stage P50, D-207: the targets are chosen before the cost is determined): the
 * spell the text belongs to has a chosen target that is a permanent of this kind. The engine's `spellTargets`, read as the total cost is determined. Not
 * read: a player ("it targets you"), a count, a plural, "it doesn't target", another spell.
 */
export const CONDITION_IT_TARGETS = defineRule<IrCondition>({
  id: 'condition.it-targets',
  family: 'condition',
  leading: ['it'],
  cites: ['CR 601.2c (Casting Spells)', 'CR 601.2f (Casting Spells)'],
  examples: ['it targets a tapped creature', 'it targets a creature', 'it targets an artifact'],
  rejects: [
    'it targets a tapped creature.',
    'it targets tapped creatures',
    'it targets a player',
    "it doesn't target a creature",
    'it targets',
    'it targets a creature you control',
    'it targets two creatures',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      pattern(/it targets an? /iu),
      map(spanned(map(permanentPhrase(false, 'all'), withoutZone)), (p) => p),
    )(ctx, pos);
    if (!r.ok) return r;
    const phrase = r.value[1];
    if (phrase.value.controller !== undefined) return fail(ctx, pos);
    const noun: IrNoun = {
      kind: 'noun',
      det: 'a',
      filter: phrase.value,
      upTo: false,
      plural: false,
      other: false,
      span: phrase.span,
      rule: 'condition.it-targets',
    };
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'spellTargets', noun },
        span: { start: pos, end: r.pos },
        rule: 'condition.it-targets',
      },
      pos: r.pos,
    };
  },
});

export const VRASKA_CONDITION_RULES = [
  CONDITION_IT_TARGETS,
  CONDITION_MANA_SPENT_AT_LEAST,
  CONDITION_CARD_LEFT_GRAVEYARD,
  CONDITION_CAST_FROM_GRAVEYARD,
];
