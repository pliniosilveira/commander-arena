/**
 * `effect.flicker`: "Exile target creature, then return it to the battlefield under its owner's
 * control." (CR 400.7: a zone change makes a new object; CR 400.7j: later parts of the effect can
 * find the object it moved; CR 110.2: under whose control it enters).
 *
 * The pronoun is read here, against the one noun this rule exiles, and nowhere else: "it" or "that
 * card" after an exile means the object the exile moved to exile, a new object (CR 400.7), which the
 * engine names `moved`. That is not what the binding pass would say for it (the target the spell
 * chose, which no longer exists), so the pronoun never reaches the binder: the clause has the
 * exiled noun and the destination, and its lowering is `exile` then `moveToZone` of `moved`. The
 * same words after any other verb are not read, and a return at another time ("at the beginning of
 * the next end step") is a delayed triggered ability (CR 603.7): since stage P48 (D-205) `effect.return-delayed` reads it.
 */
import { literal, optional, pattern, satisfy, sequence } from '../../combinators';
import type { IrNoun, IrZoneSpec } from '../../ir/types';
import { defineRule, family, quietly, spanned } from '../registry';
import { type Clauses, GRAVEYARD_OPERANDS, makeClause, UNDER_CONTROL } from './operands';

const RULE = 'effect.flicker';

/**
 * ", then return it to the battlefield under its owner's control", read as one piece: "it" or
 * "that card" (the object the exile moved, CR 400.7j; singular like its noun), the battlefield, an
 * optional "tapped", and whose control (CR 110.2a: without one the object would enter under the
 * control of whoever puts it there, which is not what any of these cards say, so it is not read).
 * One pattern, so a near miss fails where `effect.return` would, and its diagnostics are unchanged.
 */
const RETURN_BACK = spanned(
  pattern(
    /, then return (?:it|that card) to the battlefield( tapped)? under (its owner['’]s|your) control(?! at the beginning of the next end step)/i,
  ),
);

export const EFFECT_FLICKER = defineRule<Clauses>({
  id: RULE,
  family: 'effect',
  leading: ['exile'],
  cites: [
    'CR 400.7 (General)',
    'CR 400.7j (General)',
    'CR 110.2 (Permanents)',
    'CR 603.6a (Handling Triggered Abilities)',
  ],
  examples: [
    "exile target creature, then return it to the battlefield under its owner's control",
    'exile target creature, then return it to the battlefield under its owner’s control',
    'exile target creature, then return it to the battlefield under your control',
    "exile target creature you control, then return it to the battlefield under its owner's control",
    'exile target creature you control, then return that card to the battlefield under your control',
    "exile target nonland permanent you control, then return it to the battlefield under its owner's control",
    "exile target creature, then return it to the battlefield tapped under its owner's control",
  ],
  rejects: [
    "exile target creature, then return it to the battlefield under its owner's control at the beginning of the next end step",
    'exile target creature, then return it to the battlefield',
    'exile target creature, then return it to your hand',
    "exile target creature, then return them to the battlefield under their owners' control",
    "exile target creature, then return that creature to the battlefield under its owner's control",
    "exile target creature then return it to the battlefield under its owner's control",
    "exile target creature, then return it to the battlefield under his owner's control",
    "exile each creature you control, then return it to the battlefield under its owner's control",
    "exile two target creatures, then return those cards to the battlefield under their owners' control",
    "exile target creature. return it to the battlefield under its owner's control",
    "exile target creature, return it to the battlefield under its owner's control",
    "exile target card from a graveyard, then return it to the battlefield under its owner's control",
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('exile '),
      // One noun that is one object. The graveyard nouns are tried first, as `effect.exile` does,
      // so a diagnostic about a noun this rule refuses is the same one; a graveyard card, "each"
      // and "two target creatures" (whose "those cards" is plural) are not read.
      satisfy(
        family<IrNoun>('noun', { only: [...GRAVEYARD_OPERANDS, 'noun.target-permanent'] }),
        (n) => n.rule === 'noun.target-permanent' && !n.plural,
      ),
      RETURN_BACK,
    )(ctx, pos);
    if (!r.ok) return r;
    const [, objects, back] = r.value;
    const to: IrZoneSpec = {
      kind: 'zoneSpec',
      zone: 'battlefield',
      whose: /^your/i.test((back.value[2] ?? '').trim()) ? 'you' : 'owner',
      ...(back.value[1] === undefined ? {} : { tapped: true }),
      span: back.span,
      rule: RULE,
    };
    const clause = makeClause(RULE, 'flicker', { objects, to }, { start: pos, end: r.pos });
    return { ok: true, value: [clause], pos: r.pos };
  },
});

/**
 * `effect.return-delayed`: "return it to the battlefield under its owner's control at the beginning of the next end step" (stage P48, D-205, CR 603.7,
 * 603.7c, 400.7j, 110.2): the card the instruction before exiled ("Exile up to one target creature or land you control. If you do, return it ..."),
 * brought back by a delayed triggered ability the instruction creates. "It" is read here against the one noun the clause names; the lowering reads
 * it as the object an exile of the same text moved and refuses it after anything else. The control is stated ("under its owner's control" or "under your
 * control", CR 110.2a) and the time is the next end step, whoever's turn it is: no other step is read.
 */
export const EFFECT_RETURN_DELAYED = quietly(
  defineRule<Clauses>({
    id: 'effect.return-delayed',
    family: 'effect',
    leading: ['return'],
    cites: [
      'CR 603.7 (Handling Triggered Abilities)',
      'CR 603.7c (Handling Triggered Abilities)',
      'CR 400.7j (General)',
      'CR 110.2 (Permanents)',
    ],
    examples: [
      "return it to the battlefield under its owner's control at the beginning of the next end step",
      'return it to the battlefield under its owner’s control at the beginning of the next end step',
      'return it to the battlefield under your control at the beginning of the next end step',
      "return it to the battlefield tapped under its owner's control at the beginning of the next end step",
    ],
    rejects: [
      "return it to the battlefield under its owner's control",
      "return it to the battlefield under its owner's control at the beginning of your next end step",
      "return it to the battlefield under its owner's control at the beginning of the next upkeep",
      "return it to the battlefield under its owner's control at the beginning of the next end step and draw a card",
      'return it to the battlefield at the beginning of the next end step',
      "return it to its owner's hand at the beginning of the next end step",
      "return them to the battlefield under their owners' control at the beginning of the next end step",
      "return that card to the battlefield under its owner's control at the beginning of the next end step",
      "return target creature card to the battlefield under its owner's control at the beginning of the next end step",
      "return it to the battlefield under his owner's control at the beginning of the next end step",
      "return it to the battlefield under its owner's control at the beginning of the next combat",
    ],
    parse: (ctx, pos) => {
      const r = sequence(
        literal('return '),
        family<IrNoun>('noun', { only: ['noun.it'] }),
        literal(' to the battlefield'),
        optional(literal(' tapped'), null),
        UNDER_CONTROL,
        pattern(/ at the beginning of the next end step(?![\p{L}\p{N}])/iu),
      )(ctx, pos);
      if (!r.ok) return r;
      const [, objects, , tapped, whose] = r.value;
      const to: IrZoneSpec = {
        kind: 'zoneSpec',
        zone: 'battlefield',
        whose,
        ...(tapped === null ? {} : { tapped: true }),
        span: { start: objects.span.end, end: r.pos },
        rule: 'effect.return-delayed',
      };
      const clause = makeClause(
        'effect.return-delayed',
        'delayedReturn',
        { objects, to },
        { start: pos, end: r.pos },
      );
      return { ok: true, value: [clause], pos: r.pos };
    },
  }),
);

/**
 * `effect.return-at-upkeep`: "return it to the battlefield under its owner's control at the beginning of your next upkeep" (D-284, CR 603.7, 603.7c, 400.7, 110.2): the card
 * a creature became when it died, brought back by a delayed triggered ability the instruction creates. "It" is read here against the one noun the clause names; the lowering
 * reads it as the card of a creature that died (a trigger of `~` dying) and refuses it anywhere else. The control is stated ("under its owner's control" or "under your
 * control", CR 110.2a) and the time is the controller's next upkeep: no other step, no "the next upkeep" (whoever's), no "tapped" is read.
 */
export const EFFECT_RETURN_AT_UPKEEP = quietly(
  defineRule<Clauses>({
    id: 'effect.return-at-upkeep',
    family: 'effect',
    leading: ['return'],
    cites: [
      'CR 603.7 (Handling Triggered Abilities)',
      'CR 603.7c (Handling Triggered Abilities)',
      'CR 400.7 (General)',
      'CR 110.2 (Permanents)',
    ],
    examples: [
      "return it to the battlefield under its owner's control at the beginning of your next upkeep",
      'return it to the battlefield under its owner’s control at the beginning of your next upkeep',
      'return it to the battlefield under your control at the beginning of your next upkeep',
    ],
    rejects: [
      "return it to the battlefield under its owner's control",
      "return it to the battlefield under its owner's control at the beginning of the next upkeep",
      "return it to the battlefield under its owner's control at the beginning of the next end step",
      "return it to the battlefield under its owner's control at the beginning of your upkeep",
      "return it to the battlefield under its owner's control at the beginning of your next end step",
      "return it to the battlefield under its owner's control at the beginning of your next upkeep and draw a card",
      "return it to the battlefield tapped under its owner's control at the beginning of your next upkeep",
      'return it to the battlefield at the beginning of your next upkeep',
      "return it to its owner's hand at the beginning of your next upkeep",
      "return them to the battlefield under their owners' control at the beginning of your next upkeep",
      "return that card to the battlefield under its owner's control at the beginning of your next upkeep",
      "return target creature card to the battlefield under its owner's control at the beginning of your next upkeep",
      "return it to the battlefield under his owner's control at the beginning of your next upkeep",
      "return it to the battlefield under its owner's control at the beginning of your next turn",
    ],
    parse: (ctx, pos) => {
      const r = sequence(
        literal('return '),
        family<IrNoun>('noun', { only: ['noun.it'] }),
        literal(' to the battlefield'),
        UNDER_CONTROL,
        pattern(/ at the beginning of your next upkeep(?![\p{L}\p{N}])/iu),
      )(ctx, pos);
      if (!r.ok) return r;
      const [, objects, , whose] = r.value;
      const to: IrZoneSpec = {
        kind: 'zoneSpec',
        zone: 'battlefield',
        whose,
        span: { start: objects.span.end, end: r.pos },
        rule: 'effect.return-at-upkeep',
      };
      const clause = makeClause(
        'effect.return-at-upkeep',
        'delayedReturnAtUpkeep',
        { objects, to },
        { start: pos, end: r.pos },
      );
      return { ok: true, value: [clause], pos: r.pos };
    },
  }),
);

export const FLICKER_RULES = [EFFECT_FLICKER, EFFECT_RETURN_DELAYED, EFFECT_RETURN_AT_UPKEEP];
