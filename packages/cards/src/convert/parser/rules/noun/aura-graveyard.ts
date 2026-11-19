/**
 * Noun rules of the Aura that enchants a card in a graveyard (issue 89, Animate Dead; CR 702.5a Enchant, 303.4a): "creature card in a graveyard", the object of "Enchant creature
 * card in a graveyard", and "creature put onto the battlefield with ~", the object of the enchant ability the Aura gains once it has returned the card.
 */
import { fail, literal, map, pattern, sequence } from '../../combinators';
import type { IrFilter, IrNoun } from '../../ir/types';
import { defineRule, quietly, spanned } from '../registry';
import { BOUNDARY, graveyardPhrase } from './phrases';

/**
 * `noun.card-in-a-graveyard`: "creature card in a graveyard", "land card in a graveyard" (CR 404.1, 108.3): a card of any player's graveyard, with the card types it names, said by
 * the Oracle text of an Aura ("Enchant creature card in a graveyard"). One card only, and a graveyard of any player (the engine's filter has no owner). Read only by the keyword
 * `enchant` and the sentence that gives an Aura its enchant ability, which name it. Not read: "target" (that is `noun.target-card-in-a-graveyard`), a graveyard of one player ("in your
 * graveyard"), "from", the plural, a creature in a graveyard (no card), a count.
 */
export const NOUN_CARD_IN_A_GRAVEYARD = defineRule<IrNoun>({
  id: 'noun.card-in-a-graveyard',
  family: 'noun',
  leading: [],
  cites: ['CR 404.1 (Graveyard)', 'CR 702.5a (Enchant)', 'CR 303.4a (Enchantments)'],
  examples: ['creature card in a graveyard', 'land card in a graveyard', 'card in a graveyard'],
  rejects: [
    'target creature card in a graveyard',
    'creature card in your graveyard',
    "creature card in an opponent's graveyard",
    'creature card from a graveyard',
    'creature cards in a graveyard',
    'creature in a graveyard',
    'creature card',
    'creature card in a graveyard.',
    'two creature cards in a graveyard',
  ],
  parse: (ctx, pos) => {
    const r = spanned(graveyardPhrase(false, 'inAny'))(ctx, pos);
    if (!r.ok) return r;
    // Nothing more is said: "creature card in a graveyard and ..." is another statement.
    if (!/^(?![\p{L}\p{N}])/u.test(ctx.text.slice(r.pos))) return fail(ctx, pos);
    return {
      ok: true,
      value: {
        kind: 'noun',
        det: 'a',
        filter: r.value.value,
        upTo: false,
        plural: false,
        other: false,
        span: r.value.span,
        rule: 'noun.card-in-a-graveyard',
      },
      pos: r.pos,
    };
  },
});

const PERMANENT_TYPES = ['creature', 'artifact', 'enchantment', 'land', 'planeswalker'] as const;

/**
 * `noun.put-onto-with-self`: "creature put onto the battlefield with ~", "permanent put onto the battlefield with ~" (CR 400.7, 303.4): a permanent that an effect of this permanent put
 * onto the battlefield (an Aura's "Return enchanted creature card to the battlefield ... attach ~ to it"). The engine's `putWithSource`. Read only by the sentence that gives an Aura
 * its enchant ability, which names it. Not read: another permanent ("with target Aura"), a pronoun ("with it"), the plural, "target", a card type that is not a permanent type, more words
 * after it.
 */
export const NOUN_PUT_ONTO_WITH_SELF = defineRule<IrNoun>({
  id: 'noun.put-onto-with-self',
  family: 'noun',
  leading: [],
  cites: ['CR 400.7 (General)', 'CR 303.4 (Auras)', 'CR 702.5a (Enchant)'],
  examples: [
    'creature put onto the battlefield with ~',
    'permanent put onto the battlefield with ~',
    'artifact put onto the battlefield with ~',
  ],
  rejects: [
    'creature put onto the battlefield with it',
    'creature put onto the battlefield with target Aura',
    'creatures put onto the battlefield with ~',
    'target creature put onto the battlefield with ~',
    'creature card put onto the battlefield with ~',
    'instant put onto the battlefield with ~',
    'creature put onto the battlefield',
    'creature put onto the battlefield with ~ this turn',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      map(
        sequence(
          pattern(new RegExp(`(${[...PERMANENT_TYPES, 'permanent'].join('|')})(?= put )`, 'iu')),
          literal(' put onto the battlefield with ~'),
          pattern(new RegExp(`(?!\\s*(?:this turn|and|or|,))${BOUNDARY}`, 'iu')),
        ),
        ([word]) => (word[1] ?? '').toLowerCase(),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const type = r.value.value;
    const filter: IrFilter = {
      ...(type === 'permanent' ? {} : { types: [type] }),
      putWithSelf: true,
      raw: ctx.text.slice(pos, r.pos),
    };
    return {
      ok: true,
      value: {
        kind: 'noun',
        det: 'a',
        filter,
        upTo: false,
        plural: false,
        other: false,
        span: r.value.span,
        rule: 'noun.put-onto-with-self',
      },
      pos: r.pos,
    };
  },
});

/** Quiet: these rules try at every noun position (`leading` is empty) and must not move the point where another line stops (the diagnostics of the golden corpus). */
export const AURA_GRAVEYARD_NOUN_RULES = [NOUN_CARD_IN_A_GRAVEYARD, NOUN_PUT_ONTO_WITH_SELF].map(
  quietly,
);
